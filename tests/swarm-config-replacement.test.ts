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
	it('plans a new immutable Config without claiming to update references', () => {
		assert.deepEqual(planSwarmConfigReplacement(source, ' app-config-v2 ', 'old=false', true), {
			sourceId: 'config-old',
			name: 'app-config-v2',
			value: 'old=false',
			affectedServiceIds: ['service-1'],
			affectedStackNames: ['demo'],
			referencesUpdated: false
		});
	});

	it('requires a new name and an explicit decision to preserve current references', () => {
		assert.throws(() => planSwarmConfigReplacement(source, 'app-config-v1', 'changed', true), /new name/i);
		assert.throws(() => planSwarmConfigReplacement(source, 'app-config-v2', 'changed', false), /Confirm/);
		assert.throws(() => planSwarmConfigReplacement(source, ' ', 'changed', true), /name is required/i);
	});
});
