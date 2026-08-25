import type { Environment } from '$lib/stores/environment';
import type { SwarmCapability } from '$lib/types/swarm';

export interface SwarmEnvironmentNode {
	environment: Environment;
	capability: SwarmCapability;
	name: string;
	role: 'manager' | 'worker';
}

export interface SwarmEnvironmentCluster {
	kind: 'swarm-cluster';
	key: string;
	clusterId: string;
	name: string;
	environment: Environment;
	managerEnvironmentId: number;
	nodes: SwarmEnvironmentNode[];
}

export interface StandaloneEnvironmentGroup {
	kind: 'environment';
	key: string;
	name: string;
	environment: Environment;
	capability?: SwarmCapability;
}

export type EnvironmentGroup = SwarmEnvironmentCluster | StandaloneEnvironmentGroup;

export interface SwarmManagerTopology {
	clusterId: string;
	nodes: Array<{ id: string; hostname?: string; role?: 'manager' | 'worker' }>;
}

export function enrichCapabilitiesWithManagerTopology(
	capabilities: Record<number, SwarmCapability>,
	topologies: SwarmManagerTopology[]
): Record<number, SwarmCapability> {
	const nodes = new Map(topologies.flatMap((topology) => topology.nodes.map((node) => [node.id, {
		clusterId: topology.clusterId,
		hostname: node.hostname,
		role: node.role
	}] as const)));
	return Object.fromEntries(Object.entries(capabilities).map(([environmentId, capability]) => {
		const node = capability.nodeId ? nodes.get(capability.nodeId) : undefined;
		if (!node) return [environmentId, capability];
		return [environmentId, {
			...capability,
			clusterId: node.clusterId,
			nodeName: node.hostname || capability.nodeName,
			controlAvailable: node.role ? node.role === 'manager' : capability.controlAvailable,
			kind: node.role ? (node.role === 'manager' ? 'swarm-manager' : 'swarm-worker') : capability.kind
		}];
	})) as Record<number, SwarmCapability>;
}

function isClusterMember(capability: SwarmCapability | undefined): capability is SwarmCapability & { clusterId: string } {
	return Boolean(
		capability?.clusterId
		&& (capability.kind === 'swarm-manager' || capability.kind === 'swarm-worker')
	);
}

export function groupEnvironments(
	environments: Environment[],
	capabilities: Record<number, SwarmCapability | undefined>
): EnvironmentGroup[] {
	const membersByCluster = new Map<string, SwarmEnvironmentNode[]>();

	for (const environment of environments) {
		const capability = capabilities[environment.id];
		if (!isClusterMember(capability)) continue;
		const members = membersByCluster.get(capability.clusterId) ?? [];
		members.push({
			environment,
			capability,
			name: capability.nodeName?.trim() || environment.name,
			role: capability.kind === 'swarm-manager' ? 'manager' : 'worker'
		});
		membersByCluster.set(capability.clusterId, members);
	}

	const emittedClusters = new Set<string>();
	const groups: EnvironmentGroup[] = [];
	for (const environment of environments) {
		const capability = capabilities[environment.id];
		if (!isClusterMember(capability)) {
			groups.push({
				kind: 'environment',
				key: `environment:${environment.id}`,
				name: environment.name,
				environment,
				capability
			});
			continue;
		}

		if (emittedClusters.has(capability.clusterId)) continue;
		emittedClusters.add(capability.clusterId);
		const nodes = [...(membersByCluster.get(capability.clusterId) ?? [])]
			.sort((left, right) => Number(right.role === 'manager') - Number(left.role === 'manager'));
		const manager = nodes.find((node) => node.role === 'manager') ?? nodes[0];
		groups.push({
			kind: 'swarm-cluster',
			key: `swarm:${capability.clusterId}`,
			clusterId: capability.clusterId,
			name: manager.environment.name,
			environment: manager.environment,
			managerEnvironmentId: manager.environment.id,
			nodes
		});
	}

	return groups;
}

export function environmentGroupForId(groups: EnvironmentGroup[], environmentId: number | null | undefined): EnvironmentGroup | null {
	if (!environmentId) return null;
	return groups.find((group) => group.kind === 'swarm-cluster'
		? group.nodes.some((node) => node.environment.id === environmentId)
		: group.environment.id === environmentId) ?? null;
}

export function swarmManagerEnvironmentId(
	groups: EnvironmentGroup[],
	environmentId: number | null | undefined
): number | null {
	const group = environmentGroupForId(groups, environmentId);
	if (!group) return environmentId ?? null;
	return group.kind === 'swarm-cluster' ? group.managerEnvironmentId : group.environment.id;
}

export function environmentGroupMatches(group: EnvironmentGroup, search: string): boolean {
	const query = search.trim().toLowerCase();
	if (!query) return true;
	return group.name.toLowerCase().includes(query);
}
