import { dockerJsonRequest, getDockerInfo, getDockerVersion } from './docker';
import {
	loadSwarmReadModel,
	parseSwarmCapability,
	unknownSwarmCapability,
	type SwarmCapability,
	type SwarmReadModel
} from '$lib/types/swarm';

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
