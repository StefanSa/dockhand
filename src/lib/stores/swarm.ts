import { browser } from '$app/environment';
import { writable } from 'svelte/store';
import { currentEnvironment } from './environment';
import type { SwarmCapability } from '$lib/types/swarm';

interface SwarmCapabilityState {
	environmentId: number | null;
	capability: SwarmCapability | null;
	loading: boolean;
	error: string | null;
}

const initialState: SwarmCapabilityState = {
	environmentId: null,
	capability: null,
	loading: false,
	error: null
};

function createSwarmCapabilityStore() {
	const { subscribe, set, update } = writable<SwarmCapabilityState>(initialState);
	let requestSequence = 0;

	async function load(environmentId: number | null | undefined, refresh = false): Promise<void> {
		const requestId = ++requestSequence;
		if (!environmentId) {
			set(initialState);
			return;
		}

		update((state) => ({
			environmentId,
			capability: state.environmentId === environmentId ? state.capability : null,
			loading: true,
			error: null
		}));

		try {
			const suffix = refresh ? '?refresh=true' : '';
			const response = await fetch(`/api/environments/${environmentId}/capabilities${suffix}`);
			const body = await response.json();
			if (!response.ok) throw new Error(body.error || 'Failed to detect Swarm capability');
			if (requestId !== requestSequence) return;
			set({ environmentId, capability: body, loading: false, error: null });
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
			requestSequence++;
			set({ environmentId, capability, loading: false, error: null });
		},
		clear() {
			requestSequence++;
			set(initialState);
		}
	};
}

export const swarmCapability = createSwarmCapabilityStore();

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
