import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { servicesForSwarmNode, tasksForSwarmNode, tasksForSwarmService } from '../src/lib/swarm-relations';
import type { SwarmNodeSummary, SwarmServiceSummary, SwarmTaskSummary } from '../src/lib/types/swarm';

const tasks = [
	{ id: 'task-a', serviceId: 'service-a', nodeId: 'node-a' },
	{ id: 'task-b', serviceId: 'service-b', nodeId: 'node-a' },
	{ id: 'task-c', serviceId: 'service-a', nodeId: 'node-b' },
	{ id: 'task-d', nodeId: 'node-a' }
] as SwarmTaskSummary[];
const services = [{ id: 'service-a' }, { id: 'service-b' }, { id: 'service-c' }] as SwarmServiceSummary[];

describe('Swarm Service Task Node relationships', () => {
	it('finds every task for a service and node by stable Docker IDs', () => {
		assert.deepEqual(tasksForSwarmService(tasks, 'service-a').map((task) => task.id), ['task-a', 'task-c']);
		assert.deepEqual(tasksForSwarmNode(tasks, 'node-a').map((task) => task.id), ['task-a', 'task-b', 'task-d']);
	});

	it('deduplicates services running on a node and ignores unassigned tasks', () => {
		assert.deepEqual(
			servicesForSwarmNode(services, tasks, { id: 'node-a' } as SwarmNodeSummary).map((service) => service.id),
			['service-a', 'service-b']
		);
	});
});
