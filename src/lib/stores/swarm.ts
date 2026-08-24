import { browser } from '$app/environment';
import { currentEnvironment } from './environment';
import { createSwarmCapabilityStore, type SwarmCapabilityCache } from './swarm-capability';
import type { SwarmCapability, SwarmCapabilityKind } from '$lib/types/swarm';

const CAPABILITY_CACHE_PREFIX = 'dockhand:swarm-capability:v1:';
const CAPABILITY_CACHE_MAX_AGE_MS = 24 * 60 * 60 * 1000;
const CAPABILITY_KINDS = new Set<SwarmCapabilityKind>([
	'standalone',
	'swarm-manager',
	'swarm-worker',
	'swarm-unavailable',
	'unknown'
]);

function isCachedCapability(value: unknown): value is { savedAt: number; capability: SwarmCapability } {
	if (!value || typeof value !== 'object') return false;
	const cached = value as { savedAt?: unknown; capability?: Partial<SwarmCapability> };
	return typeof cached.savedAt === 'number'
		&& typeof cached.capability?.kind === 'string'
		&& CAPABILITY_KINDS.has(cached.capability.kind as SwarmCapabilityKind)
		&& typeof cached.capability.detectedAt === 'string';
}

const browserCapabilityCache: SwarmCapabilityCache | undefined = browser ? {
	get(environmentId) {
		const key = `${CAPABILITY_CACHE_PREFIX}${environmentId}`;
		const raw = localStorage.getItem(key);
		if (!raw) return null;
		try {
			const cached: unknown = JSON.parse(raw);
			if (!isCachedCapability(cached) || Date.now() - cached.savedAt > CAPABILITY_CACHE_MAX_AGE_MS) {
				localStorage.removeItem(key);
				return null;
			}
			return cached.capability;
		} catch {
			localStorage.removeItem(key);
			return null;
		}
	},
	set(environmentId, capability) {
		localStorage.setItem(`${CAPABILITY_CACHE_PREFIX}${environmentId}`, JSON.stringify({
			savedAt: Date.now(),
			capability
		}));
	}
} : undefined;

export const swarmCapability = createSwarmCapabilityStore(async (environmentId, refresh) => {
	const suffix = refresh ? '?refresh=true' : '';
	const response = await fetch(`/api/environments/${environmentId}/capabilities${suffix}`);
	const body = await response.json();
	if (!response.ok) throw new Error(body.error || 'Failed to detect Swarm capability');
	return body;
}, browserCapabilityCache);

if (browser) {
	let activeEnvironmentId: number | null = null;
	currentEnvironment.subscribe((environment) => {
		activeEnvironmentId = environment?.id ?? null;
		void swarmCapability.load(activeEnvironmentId);
	});
	setInterval(() => {
		if (activeEnvironmentId) void swarmCapability.load(activeEnvironmentId, true);
	}, 30_000);
}
