import { dockerFetch, dockerJsonRequest, getDockerInfo, getDockerVersion } from './docker';
import {
	loadSwarmReadModel,
	markManagedSwarmStacks,
	mapSwarmConfig,
	mapSwarmSecret,
	parseSwarmCapability,
	unknownSwarmCapability,
	type SwarmCapability,
	type SwarmConfigSummary,
	type SwarmReadModel,
	type SwarmSecretSummary
} from '$lib/types/swarm';
import {
	performSwarmServiceCreate,
	performSwarmServiceDelete,
	performSwarmServiceAction,
	type SwarmServiceCreateInput,
	type SwarmServiceCreateResult,
	type SwarmServiceDeleteResult,
	type SwarmServiceAction,
	type SwarmServiceActionResult
} from './swarm-service';
import {
	performSwarmNodeAction,
	type SwarmNodeAction,
	type SwarmNodeActionResult
} from './swarm-node';
import {
	performSwarmResourceCreate,
	performSwarmResourceDelete,
	performSwarmResourceLabelUpdate,
	type SwarmResourceCreateResult,
	type SwarmResourceDeleteResult,
	type SwarmResourceLabelUpdateResult,
	type SwarmResourceKind
} from './swarm-resource';
import { hasStoredSwarmStackFile } from './swarm-stack';

const CAPABILITY_CACHE_TTL_MS = 30_000;
const UNKNOWN_CACHE_TTL_MS = 5_000;
const CAPABILITY_TIMEOUT_MS = 5_000;

interface CapabilityCacheEntry {
	capability: SwarmCapability;
	expiresAt: number;
}

const capabilityCache = new Map<number | null, CapabilityCacheEntry>();

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

export async function getSwarmCapability(environmentId?: number | null, refresh = false): Promise<SwarmCapability> {
	const cacheKey = environmentId ?? null;
	const cached = capabilityCache.get(cacheKey);
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

	capabilityCache.set(cacheKey, {
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
	const model = await loadSwarmReadModel(
		capability,
		(path) => dockerJsonRequest<unknown>(path, {}, environmentId)
	);
	model.stacks = await markManagedSwarmStacks(
		model.stacks,
		(name) => hasStoredSwarmStackFile(environmentId, name)
	);
	return model;
}

export interface SwarmResourceList {
	capability: SwarmCapability;
	managerEndpointRequired: boolean;
	resources: SwarmConfigSummary[] | SwarmSecretSummary[];
}

export async function getSwarmResourceList(
	environmentId: number,
	kind: SwarmResourceKind,
	refreshCapability = false
): Promise<SwarmResourceList> {
	const capability = await getSwarmCapability(environmentId, refreshCapability);
	if (capability.kind !== 'swarm-manager') {
		return {
			capability,
			managerEndpointRequired: capability.kind === 'swarm-worker',
			resources: []
		};
	}

	const [resourceValues, serviceValues] = await Promise.all([
		dockerJsonRequest<unknown>(kind === 'config' ? '/configs' : '/secrets', {}, environmentId),
		dockerJsonRequest<unknown>('/services', {}, environmentId)
	]);
	const rawServices = Array.isArray(serviceValues) ? serviceValues : [];
	const resources = Array.isArray(resourceValues)
		? resourceValues.map((resource) => kind === 'config'
			? mapSwarmConfig(resource, rawServices)
			: mapSwarmSecret(resource, rawServices))
		: [];

	return { capability, managerEndpointRequired: false, resources };
}

async function swarmResourceRequest(
	environmentId: number,
	path: string,
	options: RequestInit = {}
): Promise<unknown> {
	const response = await dockerFetch(path, {
		...options,
		headers: { 'Content-Type': 'application/json', ...options.headers }
	}, environmentId);
	const text = await response.text();
	let value: any = undefined;
	if (text) {
		try {
			value = JSON.parse(text);
		} catch {
			value = undefined;
		}
	}
	if (!response.ok) {
		const error: any = new Error(value?.message || `Docker API error: ${response.status}`);
		error.statusCode = response.status;
		throw error;
	}
	return value;
}

export async function createSwarmResource(
	environmentId: number,
	kind: SwarmResourceKind,
	name: unknown,
	value: unknown
): Promise<SwarmResourceCreateResult> {
	const capability = await getSwarmCapability(environmentId, true);
	return performSwarmResourceCreate(
		capability,
		kind,
		name,
		value,
		(path, options = {}) => swarmResourceRequest(environmentId, path, options)
	);
}

export async function deleteSwarmResource(
	environmentId: number,
	kind: SwarmResourceKind,
	resourceId: string
): Promise<SwarmResourceDeleteResult> {
	const capability = await getSwarmCapability(environmentId, true);
	return performSwarmResourceDelete(
		capability,
		kind,
		resourceId,
		(path, options = {}) => swarmResourceRequest(environmentId, path, options)
	);
}

export async function updateSwarmResourceLabels(
	environmentId: number,
	kind: SwarmResourceKind,
	resourceId: string,
	labels: unknown
): Promise<SwarmResourceLabelUpdateResult> {
	const capability = await getSwarmCapability(environmentId, true);
	return performSwarmResourceLabelUpdate(
		capability,
		kind,
		resourceId,
		labels,
		(path, options = {}) => swarmResourceRequest(environmentId, path, options)
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

export async function createSwarmService(
	environmentId: number,
	input: SwarmServiceCreateInput
): Promise<SwarmServiceCreateResult> {
	const capability = await getSwarmCapability(environmentId, true);
	return performSwarmServiceCreate(
		capability,
		input,
		(path, options = {}) => dockerJsonRequest<unknown>(path, options, environmentId)
	);
}

export async function deleteSwarmService(
	environmentId: number,
	serviceId: string
): Promise<SwarmServiceDeleteResult> {
	const capability = await getSwarmCapability(environmentId, true);
	return performSwarmServiceDelete(
		capability,
		serviceId,
		(path, options = {}) => swarmResourceRequest(environmentId, path, options)
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
