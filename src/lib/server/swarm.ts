import { dockerFetch, dockerJsonRequest, getDockerInfo, getDockerVersion } from './docker';
import {
	loadSwarmReadModel,
	parseSwarmCapability,
	unknownSwarmCapability,
	type SwarmCapability,
	type SwarmReadModel
} from '$lib/types/swarm';
import {
	performSwarmServiceAction,
	type SwarmServiceAction,
	type SwarmServiceActionResult
} from './swarm-service';
import {
	performSwarmNodeAction,
	type SwarmNodeAction,
	type SwarmNodeActionResult
} from './swarm-node';

const CAPABILITY_CACHE_TTL_MS = 30_000;
const UNKNOWN_CACHE_TTL_MS = 5_000;
const CAPABILITY_TIMEOUT_MS = 5_000;

interface CapabilityCacheEntry {
	capability: SwarmCapability;
	expiresAt: number;
}

const capabilityCache = new Map<number, CapabilityCacheEntry>();

function withTimeout<T>(promise: Promise<T>, milliseconds: number): Promise<T> {
	return new Promise<T>((resolve, reject) => {
		const timer = setTimeout(() => reject(new Error('Capability detection timed out')), milliseconds);
		promise.then(
			(value) => { clearTimeout(timer); resolve(value); },
			(error) => { clearTimeout(timer); reject(error); }
		);
	});
}

export function clearSwarmCapabilityCache(environmentId?: number): void {
	if (environmentId === undefined) {
		capabilityCache.clear();
		return;
	}
	capabilityCache.delete(environmentId);
}

export async function getSwarmCapability(environmentId: number, refresh = false): Promise<SwarmCapability> {
	const cached = capabilityCache.get(environmentId);
	if (!refresh && cached && cached.expiresAt > Date.now()) return cached.capability;

	let capability: SwarmCapability;
	try {
		const [info, version] = await Promise.all([
			withTimeout(getDockerInfo(environmentId), CAPABILITY_TIMEOUT_MS),
			withTimeout(getDockerVersion(environmentId), CAPABILITY_TIMEOUT_MS).catch(() => undefined)
		]);
		capability = parseSwarmCapability(info, version);
	} catch (error: any) {
		const message = error?.statusCode === 403
			? 'Docker API access to /info was denied'
			: 'Unable to query Docker /info';
		capability = unknownSwarmCapability(message);
	}

	capabilityCache.set(environmentId, {
		capability,
		expiresAt: Date.now() + (capability.kind === 'unknown' ? UNKNOWN_CACHE_TTL_MS : CAPABILITY_CACHE_TTL_MS)
	});
	return capability;
}

export async function getSwarmReadModel(environmentId: number, refreshCapability = false): Promise<SwarmReadModel> {
	const capability = await getSwarmCapability(environmentId, refreshCapability);

	// Workers can report their local role through /info, but cluster object
	// endpoints are manager-only. loadSwarmReadModel returns before requesting
	// them and never attempts to route through RemoteManagers.
	return loadSwarmReadModel(
		capability,
		(path) => dockerJsonRequest<unknown>(path, {}, environmentId)
	);
}

export async function updateSwarmService(
	environmentId: number,
	serviceId: string,
	action: SwarmServiceAction
): Promise<SwarmServiceActionResult> {
	const capability = await getSwarmCapability(environmentId, true);
	return performSwarmServiceAction(
		capability,
		serviceId,
		action,
		(path, options = {}) => dockerJsonRequest<unknown>(path, options, environmentId)
	);
}

async function nodeRequest(
	environmentId: number,
	path: string,
	options: RequestInit = {}
): Promise<unknown> {
	if (options.method !== 'POST') {
		return dockerJsonRequest<unknown>(path, options, environmentId);
	}

	const response = await dockerFetch(path, {
		...options,
		headers: { 'Content-Type': 'application/json', ...options.headers }
	}, environmentId);
	if (!response.ok) {
		const text = await response.text();
		let message = text;
		try {
			message = JSON.parse(text).message || text;
		} catch {
			// Docker may return plain text for proxy or daemon errors.
		}
		const error: any = new Error(message || `Docker API error: ${response.status}`);
		error.statusCode = response.status;
		throw error;
	}
	return undefined;
}

export async function updateSwarmNode(
	environmentId: number,
	nodeId: string,
	action: SwarmNodeAction
): Promise<SwarmNodeActionResult> {
	const capability = await getSwarmCapability(environmentId, true);
	return performSwarmNodeAction(
		capability,
		nodeId,
		action,
		(path, options = {}) => nodeRequest(environmentId, path, options)
	);
}
