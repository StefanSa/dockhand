import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { filterSwarmNodes, swarmNodeCounts } from '../src/lib/swarm-nodes';
import type { SwarmNodeSummary } from '../src/lib/types/swarm';

const nodes: SwarmNodeSummary[] = [
	{
		id: 'manager-node-id', version: 1, hostname: 'swarm-mgr01', role: 'manager',
		availability: 'active', status: 'ready', address: '10.0.0.10', labels: { zone: 'core' }
	},
	{
		id: 'worker-node-id', version: 1, hostname: 'swarm-wrk02', role: 'worker',
		availability: 'drain', status: 'down', address: '10.0.0.20', labels: { zone: 'edge' }
	}
];

describe('Swarm node filtering', () => {
	it('counts and filters manager and worker nodes', () => {
		assert.deepEqual(swarmNodeCounts(nodes), { all: 2, manager: 1, worker: 1 });
		assert.deepEqual(filterSwarmNodes(nodes, 'manager', '').map((node) => node.id), ['manager-node-id']);
		assert.deepEqual(filterSwarmNodes(nodes, 'worker', '').map((node) => node.id), ['worker-node-id']);
	});

	it('searches node identity, state, address and labels', () => {
		for (const query of ['wrk02', '10.0.0.20', 'worker-node', 'drain', 'down', 'edge']) {
			assert.deepEqual(filterSwarmNodes(nodes, 'all', query).map((node) => node.id), ['worker-node-id']);
		}
	});
});
