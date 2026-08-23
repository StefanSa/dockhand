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
	if (!environmentId || state.environmentId !== environmentId || state.loading) return null;
	return state.capability;
}

export function createSwarmCapabilityStore(fetchCapability: SwarmCapabilityFetcher) {
	const { subscribe, set, update } = writable<SwarmCapabilityState>(initialState);
	let requestSequence = 0;

	async function load(environmentId: number | null | undefined, refresh = false): Promise<void> {
		const requestId = ++requestSequence;
		if (!environmentId) {
			set(initialState);
			return;
		}

		set({
			environmentId,
			capability: null,
			loading: true,
			error: null
		});

		try {
			const capability = await fetchCapability(environmentId, refresh);
			if (requestId !== requestSequence) return;
			set({ environmentId, capability, loading: false, error: null });
		} catch (error) {
			if (requestId !== requestSequence) return;
			set({
				environmentId,
				capability: null,
				loading: false,
				error: error instanceof Error ? error.message : 'Failed to detect Swarm capability'
			});
		}
	}

	return {
		subscribe,
		load,
		setCapability(environmentId: number, capability: SwarmCapability) {
			update((state) => {
				if (state.environmentId !== environmentId) return state;
				requestSequence++;
				return { environmentId, capability, loading: false, error: null };
			});
		},
		clear() {
			requestSequence++;
			set(initialState);
		}
	};
}
