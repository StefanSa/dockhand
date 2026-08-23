import { browser } from '$app/environment';
import { currentEnvironment } from './environment';
import { createSwarmCapabilityStore } from './swarm-capability';

export const swarmCapability = createSwarmCapabilityStore(async (environmentId, refresh) => {
	const suffix = refresh ? '?refresh=true' : '';
	const response = await fetch(`/api/environments/${environmentId}/capabilities${suffix}`);
	const body = await response.json();
	if (!response.ok) throw new Error(body.error || 'Failed to detect Swarm capability');
	return body;
});

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
