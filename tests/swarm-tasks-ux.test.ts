import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import {
	filterSwarmTasks,
	isActiveSwarmTask,
	swarmTaskCounts
} from '../src/lib/swarm-tasks';
import type { SwarmNodeSummary, SwarmServiceSummary, SwarmTaskSummary } from '../src/lib/types/swarm';

const tasks: SwarmTaskSummary[] = [
	{ id: 'run-123456789', name: 'web.1.run', serviceId: 'svc-web', nodeId: 'node-a', state: 'running', desiredState: 'running', image: 'nginx:alpine', version: 1 },
	{ id: 'done-12345678', name: 'web.1.old', serviceId: 'svc-web', nodeId: 'node-a', state: 'shutdown', desiredState: 'shutdown', image: 'nginx:old', version: 1 },
	{ id: 'fail-12345678', name: 'jobs.2.fail', serviceId: 'svc-job', nodeId: 'node-b', state: 'failed', desiredState: 'shutdown', image: 'busybox:latest', error: 'exit 1', version: 1 },
	{ id: 'transition-123', name: 'web.2.stop', serviceId: 'svc-web', nodeId: 'node-b', state: 'preparing', desiredState: 'shutdown', image: 'nginx:alpine', version: 1 }
];

const services = [
	{ id: 'svc-web', name: 'frontend' },
	{ id: 'svc-job', name: 'nightly-job' }
] as SwarmServiceSummary[];
const nodes = [
	{ id: 'node-a', hostname: 'manager-one' },
	{ id: 'node-b', hostname: 'worker-two' }
] as SwarmNodeSummary[];

describe('Swarm tasks UX', () => {
	it('uses Active by hiding normal completed history while retaining failures and transitions', () => {
		assert.equal(isActiveSwarmTask(tasks[0]), true);
		assert.equal(isActiveSwarmTask(tasks[1]), false);
		assert.equal(isActiveSwarmTask(tasks[2]), true);
		assert.equal(isActiveSwarmTask(tasks[3]), true);
		assert.deepEqual(filterSwarmTasks(tasks, 'active', '', services, nodes).map((task) => task.id), [
			'run-123456789',
			'fail-12345678',
			'transition-123'
		]);
	});

	it('counts every requested filter independently', () => {
		assert.deepEqual(swarmTaskCounts(tasks), {
			active: 3,
			all: 4,
			running: 1,
			failed: 1,
			shutdown: 3
		});
	});

	it('searches service, node, image, task name and full task ID', () => {
		for (const query of ['frontend', 'manager-one', 'nginx:old', 'jobs.2.fail', 'fail-12345678']) {
			const result = filterSwarmTasks(tasks, 'all', query, services, nodes);
			assert.ok(result.length > 0, `expected a match for ${query}`);
		}
		assert.deepEqual(filterSwarmTasks(tasks, 'all', 'worker-two', services, nodes).map((task) => task.id), [
			'fail-12345678',
			'transition-123'
		]);
	});
});
