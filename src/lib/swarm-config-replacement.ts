import type { SwarmConfigSummary } from '$lib/types/swarm';

export interface SwarmConfigReplacementPlan {
	sourceId: string;
	name: string;
	value: string;
	affectedServiceIds: string[];
	affectedStackNames: string[];
	referencesUpdated: false;
}

export function planSwarmConfigReplacement(
	source: SwarmConfigSummary,
	name: string,
	value: string,
	referencesRemainConfirmed: boolean
): SwarmConfigReplacementPlan {
	const normalizedName = name.trim();
	if (!normalizedName) throw new Error('A new Config name is required.');
	if (normalizedName === source.name) throw new Error('Replacement Configs need a new name because Docker Config data is immutable.');
	if (!referencesRemainConfirmed) throw new Error('Confirm that existing Service and Stack references will remain unchanged.');

	return {
		sourceId: source.id,
		name: normalizedName,
		value,
		affectedServiceIds: source.services.map((usage) => usage.serviceId),
		affectedStackNames: [...source.stackNames],
		referencesUpdated: false
	};
}
