import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { planSwarmConfigReplacement } from '../src/lib/swarm-config-replacement';
import type { SwarmConfigSummary } from '../src/lib/types/swarm';

const source: SwarmConfigSummary = {
	id: 'config-old', version: 3, name: 'app-config-v1', labels: { team: 'platform' }, data: 'old=true',
	createdAt: '2026-08-23T00:00:00Z', updatedAt: '2026-08-23T00:00:00Z',
	services: [{ serviceId: 'service-1', serviceName: 'demo_web', stackName: 'demo' }],
	stackNames: ['demo']
};

describe('Swarm Config replacement semantics', () => {
	it('plans a new immutable Config and only explicitly selected Service updates', () => {
		assert.deepEqual(planSwarmConfigReplacement(source, ' app-config-v2 ', 'old=false', {
			serviceIds: ['service-1', 'service-1'], confirmed: true
		}), {
			sourceId: 'config-old',
			name: 'app-config-v2',
			value: 'old=false',
			affectedServiceIds: ['service-1'],
			affectedStackNames: ['demo'],
			serviceIdsToUpdate: ['service-1'],
			referencesUpdated: false
		});
	});

	it('allows a confirmed create-only decision without changing references', () => {
		const plan = planSwarmConfigReplacement(source, 'app-config-v2', 'changed', {
			serviceIds: [], confirmed: true
		});
		assert.deepEqual(plan.serviceIdsToUpdate, []);
		assert.equal(plan.referencesUpdated, false);
	});

	it('requires a new name, explicit confirmation, and valid selected Services', () => {
		assert.throws(() => planSwarmConfigReplacement(source, 'app-config-v1', 'changed', { serviceIds: [], confirmed: true }), /new name/i);
		assert.throws(() => planSwarmConfigReplacement(source, 'app-config-v2', 'changed', { serviceIds: [], confirmed: false }), /Confirm/);
		assert.throws(() => planSwarmConfigReplacement(source, ' ', 'changed', { serviceIds: [], confirmed: true }), /name is required/i);
		assert.throws(() => planSwarmConfigReplacement(source, 'app-config-v2', 'changed', { serviceIds: ['other'], confirmed: true }), /currently using/i);
	});
});
