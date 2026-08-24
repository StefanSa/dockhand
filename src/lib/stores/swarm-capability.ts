import { writable } from 'svelte/store';
import type { SwarmCapability } from '$lib/types/swarm';

export interface SwarmCapabilityState {
	environmentId: number | null;
	capability: SwarmCapability | null;
	loading: boolean;
	error: string | null;
}

export type SwarmCapabilityFetcher = (
	environmentId: number,
	refresh: boolean
) => Promise<SwarmCapability>;

export interface SwarmCapabilityCache {
	get(environmentId: number): SwarmCapability | null | undefined;
	set(environmentId: number, capability: SwarmCapability): void;
}

const initialState: SwarmCapabilityState = {
	environmentId: null,
	capability: null,
	loading: false,
	error: null
};

export function capabilityForEnvironment(
	state: SwarmCapabilityState,
	environmentId: number | null | undefined
): SwarmCapability | null {
	if (!environmentId || state.environmentId !== environmentId) return null;
	return state.capability;
}

export function createSwarmCapabilityStore(
	fetchCapability: SwarmCapabilityFetcher,
	cache?: SwarmCapabilityCache
) {
	const { subscribe, set } = writable<SwarmCapabilityState>(initialState);
	let state = initialState;
	let requestSequence = 0;

	function publish(next: SwarmCapabilityState): void {
		state = next;
		set(next);
	}

	function cachedCapability(environmentId: number): SwarmCapability | null {
		try {
			return cache?.get(environmentId) ?? null;
		} catch {
			return null;
		}
	}

	function rememberCapability(environmentId: number, capability: SwarmCapability): void {
		try {
			cache?.set(environmentId, capability);
		} catch {
			// Browser storage is an optimization. Capability detection must still work without it.
		}
	}

	async function load(environmentId: number | null | undefined, refresh = false): Promise<void> {
		const requestId = ++requestSequence;
		if (!environmentId) {
			publish(initialState);
			return;
		}

		const knownCapability = state.environmentId === environmentId
			? state.capability
			: cachedCapability(environmentId);
		publish({
			environmentId,
			capability: knownCapability,
			loading: true,
			error: null
		});

		try {
			const capability = await fetchCapability(environmentId, refresh);
			if (requestId !== requestSequence) return;
			rememberCapability(environmentId, capability);
			publish({ environmentId, capability, loading: false, error: null });
		} catch (error) {
			if (requestId !== requestSequence) return;
			publish({
				environmentId,
				capability: state.environmentId === environmentId ? state.capability : knownCapability,
				loading: false,
				error: error instanceof Error ? error.message : 'Failed to detect Swarm capability'
			});
		}
	}

	return {
		subscribe,
		load,
		setCapability(environmentId: number, capability: SwarmCapability) {
			rememberCapability(environmentId, capability);
			if (state.environmentId !== environmentId) return;
			requestSequence++;
			publish({ environmentId, capability, loading: false, error: null });
		},
		clear() {
			requestSequence++;
			publish(initialState);
		}
	};
}
