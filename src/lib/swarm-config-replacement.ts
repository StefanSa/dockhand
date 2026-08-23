import type { SwarmConfigSummary } from '$lib/types/swarm';

export interface SwarmConfigReplacementPlan {
	sourceId: string;
	name: string;
	value: string;
	affectedServiceIds: string[];
	affectedStackNames: string[];
	serviceIdsToUpdate: string[];
	referencesUpdated: false;
}

export interface SwarmConfigReplacementSelection {
	serviceIds: string[];
	confirmed: boolean;
}

export function planSwarmConfigReplacement(
	source: SwarmConfigSummary,
	name: string,
	value: string,
	selection: SwarmConfigReplacementSelection
): SwarmConfigReplacementPlan {
	const normalizedName = name.trim();
	if (!normalizedName) throw new Error('A new Config name is required.');
	if (normalizedName === source.name) throw new Error('Replacement Configs need a new name because Docker Config data is immutable.');
	if (!selection.confirmed) throw new Error('Confirm how Dockhand should handle the existing Service and Stack references.');

	const affectedServiceIds = source.services.map((usage) => usage.serviceId);
	const affectedServiceSet = new Set(affectedServiceIds);
	const serviceIdsToUpdate = [...new Set(selection.serviceIds)];
	if (serviceIdsToUpdate.some((serviceId) => !affectedServiceSet.has(serviceId))) {
		throw new Error('Only Services currently using this Config can be updated.');
	}

	return {
		sourceId: source.id,
		name: normalizedName,
		value,
		affectedServiceIds,
		affectedStackNames: [...source.stackNames],
		serviceIdsToUpdate,
		referencesUpdated: false
	};
}
