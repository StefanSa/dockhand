import type { SwarmNodeSummary } from '$lib/types/swarm';

export type SwarmNodeFilter = 'all' | 'manager' | 'worker';

export const SWARM_NODE_FILTERS: Array<{ value: SwarmNodeFilter; label: string }> = [
	{ value: 'all', label: 'All' },
	{ value: 'manager', label: 'Managers' },
	{ value: 'worker', label: 'Workers' }
];

export function swarmNodeCounts(nodes: SwarmNodeSummary[]): Record<SwarmNodeFilter, number> {
	return {
		all: nodes.length,
		manager: nodes.filter((node) => node.role === 'manager').length,
		worker: nodes.filter((node) => node.role === 'worker').length
	};
}

export function filterSwarmNodes(
	nodes: SwarmNodeSummary[],
	filter: SwarmNodeFilter,
	search: string
): SwarmNodeSummary[] {
	const query = search.trim().toLowerCase();
	return nodes.filter((node) => {
		if (filter !== 'all' && node.role !== filter) return false;
		if (!query) return true;
		return [
			node.hostname,
			node.address,
			node.id,
			node.role,
			node.availability,
			node.status,
			node.managerStatus?.reachability,
			...Object.entries(node.labels).flatMap(([key, value]) => [key, value])
		].some((value) => value?.toLowerCase().includes(query));
	});
}
