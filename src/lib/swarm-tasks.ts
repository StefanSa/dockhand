import type { SwarmNodeSummary, SwarmServiceSummary, SwarmTaskSummary } from '$lib/types/swarm';

export type SwarmTaskFilter = 'active' | 'all' | 'running' | 'failed' | 'shutdown';

export const SWARM_TASK_FILTERS: Array<{ value: SwarmTaskFilter; label: string }> = [
	{ value: 'active', label: 'Active' },
	{ value: 'all', label: 'All' },
	{ value: 'running', label: 'Running' },
	{ value: 'failed', label: 'Failed' },
	{ value: 'shutdown', label: 'Shutdown' }
];

const FAILURE_STATES = new Set(['failed', 'rejected', 'orphaned']);
const TERMINAL_STATES = new Set(['complete', 'shutdown', 'failed', 'rejected', 'remove', 'orphaned']);

function normalized(value: string | undefined): string {
	return value?.trim().toLowerCase() ?? '';
}

export function isFailedSwarmTask(task: SwarmTaskSummary): boolean {
	return Boolean(task.error?.trim()) || FAILURE_STATES.has(normalized(task.state));
}

export function isActiveSwarmTask(task: SwarmTaskSummary): boolean {
	if (isFailedSwarmTask(task)) return true;
	return !(
		normalized(task.desiredState) === 'shutdown' &&
		TERMINAL_STATES.has(normalized(task.state))
	);
}

export function matchesSwarmTaskFilter(task: SwarmTaskSummary, filter: SwarmTaskFilter): boolean {
	switch (filter) {
		case 'active':
			return isActiveSwarmTask(task);
		case 'running':
			return normalized(task.state) === 'running';
		case 'failed':
			return isFailedSwarmTask(task);
		case 'shutdown':
			return normalized(task.desiredState) === 'shutdown' || normalized(task.state) === 'shutdown';
		case 'all':
			return true;
	}
}

export function swarmTaskCounts(tasks: SwarmTaskSummary[]): Record<SwarmTaskFilter, number> {
	return {
		active: tasks.filter((task) => matchesSwarmTaskFilter(task, 'active')).length,
		all: tasks.length,
		running: tasks.filter((task) => matchesSwarmTaskFilter(task, 'running')).length,
		failed: tasks.filter((task) => matchesSwarmTaskFilter(task, 'failed')).length,
		shutdown: tasks.filter((task) => matchesSwarmTaskFilter(task, 'shutdown')).length
	};
}

export function filterSwarmTasks(
	tasks: SwarmTaskSummary[],
	filter: SwarmTaskFilter,
	query: string,
	services: SwarmServiceSummary[],
	nodes: SwarmNodeSummary[]
): SwarmTaskSummary[] {
	const serviceNames = new Map(services.map((service) => [service.id, service.name]));
	const nodeNames = new Map(nodes.map((node) => [node.id, node.hostname]));
	const needle = normalized(query);

	return tasks.filter((task) => {
		if (!matchesSwarmTaskFilter(task, filter)) return false;
		if (!needle) return true;
		return [
			serviceNames.get(task.serviceId ?? ''),
			nodeNames.get(task.nodeId ?? ''),
			task.image,
			task.name,
			task.id
		].some((value) => normalized(value).includes(needle));
	});
}
