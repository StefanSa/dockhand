import { browser } from '$app/environment';
import { get, writable } from 'svelte/store';
import { currentEnvironment, environments, type Environment } from './environment';
import { createSwarmCapabilityStore, type SwarmCapabilityCache } from './swarm-capability';
import type { SwarmCapability, SwarmCapabilityKind } from '$lib/types/swarm';
import {
	enrichCapabilitiesWithManagerTopology,
	groupEnvironments,
	swarmManagerEnvironmentId,
	type SwarmManagerTopology
} from '$lib/environment-grouping';

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

async function fetchSwarmCapability(environmentId: number, refresh: boolean): Promise<SwarmCapability> {
	const suffix = refresh ? '?refresh=true' : '';
	const response = await fetch(`/api/environments/${environmentId}/capabilities${suffix}`);
	const body = await response.json();
	if (!response.ok) throw new Error(body.error || 'Failed to detect Swarm capability');
	return body;
}

export const swarmCapability = createSwarmCapabilityStore(fetchSwarmCapability, browserCapabilityCache);

export interface SwarmEnvironmentCapabilitiesState {
	environmentIds: number[];
	capabilities: Record<number, SwarmCapability>;
	loading: boolean;
	initialized: boolean;
}

function createSwarmEnvironmentCapabilitiesStore() {
	const initial: SwarmEnvironmentCapabilitiesState = {
		environmentIds: [],
		capabilities: {},
		loading: false,
		initialized: false
	};
	const { subscribe, set } = writable(initial);
	let state = initial;
	let requestSequence = 0;

	function publish(next: SwarmEnvironmentCapabilitiesState): void {
		state = next;
		set(next);
	}

	async function load(environmentList: Environment[], refresh = false): Promise<void> {
		const ids = [...new Set(environmentList.map((environment) => environment.id))].sort((left, right) => left - right);
		const requestId = ++requestSequence;
		if (ids.length === 0) {
			publish({ environmentIds: [], capabilities: {}, loading: false, initialized: true });
			return;
		}

		const sameSet = ids.length === state.environmentIds.length
			&& ids.every((id, index) => id === state.environmentIds[index]);
		if (sameSet && state.initialized && !refresh) return;

		const retained = Object.fromEntries(
			ids.flatMap((id) => state.capabilities[id] ? [[id, state.capabilities[id]]] : [])
		) as Record<number, SwarmCapability>;
		publish({ environmentIds: ids, capabilities: retained, loading: true, initialized: sameSet && state.initialized });

		const results = await Promise.all(ids.map(async (environmentId) => {
			try {
				return [environmentId, await fetchSwarmCapability(environmentId, refresh)] as const;
			} catch {
				return [environmentId, retained[environmentId]] as const;
			}
		}));
		if (requestId !== requestSequence) return;

		const detectedCapabilities: Record<number, SwarmCapability> = {};
		for (const [environmentId, capability] of results) {
			if (capability) detectedCapabilities[environmentId] = capability;
		}
		const topologies = (await Promise.all(Object.entries(detectedCapabilities).map(async ([environmentId, capability]): Promise<SwarmManagerTopology | null> => {
			if (capability.kind !== 'swarm-manager' || !capability.clusterId) return null;
			try {
				const response = await fetch(`/api/swarm?env=${environmentId}`);
				if (!response.ok) return null;
				const model = await response.json();
				if (!Array.isArray(model.nodes)) return null;
				return {
					clusterId: capability.clusterId,
					nodes: model.nodes.flatMap((node: any) => typeof node?.id === 'string' ? [{
						id: node.id,
						hostname: typeof node.hostname === 'string' ? node.hostname : undefined,
						role: node.role === 'manager' || node.role === 'worker' ? node.role : undefined
					}] : [])
				};
			} catch {
				return null;
			}
		}))).filter((topology): topology is SwarmManagerTopology => Boolean(topology));
		if (requestId !== requestSequence) return;
		const capabilities = enrichCapabilitiesWithManagerTopology(detectedCapabilities, topologies);
		publish({ environmentIds: ids, capabilities, loading: false, initialized: true });

		const selected = get(currentEnvironment);
		const logicalEnvironmentId = swarmManagerEnvironmentId(
			groupEnvironments(environmentList, capabilities),
			selected?.id
		);
		if (selected && logicalEnvironmentId && logicalEnvironmentId !== selected.id) {
			const logicalEnvironment = environmentList.find((environment) => environment.id === logicalEnvironmentId);
			if (logicalEnvironment) {
				currentEnvironment.set({ id: logicalEnvironment.id, name: logicalEnvironment.name });
			}
		}
	}

	return {
		subscribe,
		load,
		setCapability(environmentId: number, capability: SwarmCapability) {
			if (!state.environmentIds.includes(environmentId)) return;
			publish({
				...state,
				capabilities: { ...state.capabilities, [environmentId]: capability }
			});
		}
	};
}

export const swarmEnvironmentCapabilities = createSwarmEnvironmentCapabilitiesStore();

if (browser) {
	let activeEnvironmentId: number | null = null;
	currentEnvironment.subscribe((environment) => {
		activeEnvironmentId = environment?.id ?? null;
		void swarmCapability.load(activeEnvironmentId);
	});
	environments.subscribe((environmentList) => {
		void swarmEnvironmentCapabilities.load(environmentList);
	});
	setInterval(() => {
		if (activeEnvironmentId) void swarmCapability.load(activeEnvironmentId, true);
	}, 30_000);
}
