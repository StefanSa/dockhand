import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import {
	isSwarmDetailAvailable,
	parseSwarmDetail,
	swarmDetailHref,
	swarmTabHref
} from '../src/lib/swarm-navigation';
import type { SwarmReadModel } from '../src/lib/types/swarm';

function model(ids: { node: string; service: string; task: string; stack: string; config: string; secret: string }): SwarmReadModel {
	return {
		capability: { kind: 'swarm-manager', controlAvailable: true, detectedAt: '2026-08-23T00:00:00Z' },
		managerEndpointRequired: false,
		cluster: null,
		nodes: [{ id: ids.node } as SwarmReadModel['nodes'][number]],
		services: [{ id: ids.service } as SwarmReadModel['services'][number]],
		tasks: [{ id: ids.task } as SwarmReadModel['tasks'][number]],
		stacks: [{ name: ids.stack } as SwarmReadModel['stacks'][number]],
		configs: [{ id: ids.config } as SwarmReadModel['configs'][number]],
		secrets: [{ id: ids.secret } as SwarmReadModel['secrets'][number]]
	};
}

describe('Swarm resource deep links', () => {
	it('builds stable links for every related resource without pinning an environment', () => {
		assert.equal(swarmDetailHref('service', 'service/id'), '/swarm?tab=services&resource=service&id=service%2Fid');
		assert.equal(swarmDetailHref('task', 'task id'), '/swarm?tab=tasks&resource=task&id=task+id');
		assert.equal(swarmDetailHref('node', 'node-1'), '/swarm?tab=nodes&resource=node&id=node-1');
		assert.equal(swarmDetailHref('stack', 'demo'), '/swarm?tab=stacks&resource=stack&id=demo');
		assert.equal(swarmDetailHref('config', 'config-1'), '/swarm?tab=configs&resource=config&id=config-1');
		assert.equal(swarmDetailHref('secret', 'secret-1'), '/swarm?tab=secrets&resource=secret&id=secret-1');
		assert.equal(swarmTabHref('services'), '/swarm?tab=services');
		assert.equal(swarmDetailHref('service', 'service-1').includes('env='), false);
	});

	it('parses direct entry independent of a mismatched or omitted tab', () => {
		assert.deepEqual(parseSwarmDetail(new URLSearchParams('resource=service&id=service-1')), {
			kind: 'service', id: 'service-1', tab: 'services'
		});
		assert.deepEqual(parseSwarmDetail(new URLSearchParams('tab=nodes&resource=config&id=config-1')), {
			kind: 'config', id: 'config-1', tab: 'configs'
		});
		assert.equal(parseSwarmDetail(new URLSearchParams('resource=unknown&id=x')), null);
		assert.equal(parseSwarmDetail(new URLSearchParams('resource=task')), null);
	});

	it('rejects stale resource IDs after an environment switch', () => {
		const first = model({ node: 'n1', service: 's1', task: 't1', stack: 'stack1', config: 'c1', secret: 'x1' });
		const second = model({ node: 'n2', service: 's2', task: 't2', stack: 'stack2', config: 'c2', secret: 'x2' });
		for (const [kind, id] of [['node', 'n1'], ['service', 's1'], ['task', 't1'], ['stack', 'stack1'], ['config', 'c1'], ['secret', 'x1']] as const) {
			const detail = parseSwarmDetail(new URLSearchParams(`resource=${kind}&id=${id}`));
			assert.ok(detail);
			assert.equal(isSwarmDetailAvailable(first, detail), true);
			assert.equal(isSwarmDetailAvailable(second, detail), false);
		}
	});
});
