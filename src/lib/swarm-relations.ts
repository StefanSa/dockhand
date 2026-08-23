import type { SwarmNodeSummary, SwarmServiceSummary, SwarmTaskSummary } from '$lib/types/swarm';

export function tasksForSwarmService(tasks: SwarmTaskSummary[], serviceId: string): SwarmTaskSummary[] {
	return tasks.filter((task) => task.serviceId === serviceId);
}

export function tasksForSwarmNode(tasks: SwarmTaskSummary[], nodeId: string): SwarmTaskSummary[] {
	return tasks.filter((task) => task.nodeId === nodeId);
}

export function servicesForSwarmNode(
	services: SwarmServiceSummary[],
	tasks: SwarmTaskSummary[],
	node: Pick<SwarmNodeSummary, 'id'>
): SwarmServiceSummary[] {
	const serviceIds = new Set(tasksForSwarmNode(tasks, node.id).flatMap((task) => task.serviceId ? [task.serviceId] : []));
	return services.filter((service) => serviceIds.has(service.id));
}
