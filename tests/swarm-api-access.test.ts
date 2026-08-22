import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { requireSwarmReadAccess, requireSwarmUpdateAccess } from '../src/lib/server/swarm-access';

function denied(message: string): Response {
	return new Response(JSON.stringify({ error: message }), { status: 403 });
}

describe('Swarm API read authorization', () => {
	it('rejects a missing environment-scoped swarm:view permission before checking access', async () => {
		let accessChecked = false;
		const response = await requireSwarmReadAccess({
			async requirePermission(resource, action, environmentId) {
				assert.equal(resource, 'swarm');
				assert.equal(action, 'view');
				assert.equal(environmentId, 42);
				return denied('Permission denied');
			},
			async requireEnvAccess() {
				accessChecked = true;
				return null;
			}
		}, 42);

		assert.equal(response?.status, 403);
		assert.equal(accessChecked, false);
	});

	it('rejects access to an environment outside the role scope', async () => {
		const response = await requireSwarmReadAccess({
			async requirePermission() { return null; },
			async requireEnvAccess(environmentId) {
				assert.equal(environmentId, 7);
				return denied('Access denied to this environment');
			}
		}, 7);

		assert.equal(response?.status, 403);
		assert.deepEqual(await response?.json(), { error: 'Access denied to this environment' });
	});

	it('allows a request only after both checks pass', async () => {
		const calls: string[] = [];
		const response = await requireSwarmReadAccess({
			async requirePermission() { calls.push('permission'); return null; },
			async requireEnvAccess() { calls.push('environment'); return null; }
		}, 9);

		assert.equal(response, null);
		assert.deepEqual(calls, ['permission', 'environment']);
	});
});

describe('Swarm API update authorization', () => {
	it('rejects a missing environment-scoped swarm:update permission before checking access', async () => {
		let accessChecked = false;
		const response = await requireSwarmUpdateAccess({
			async requirePermission(resource, action, environmentId) {
				assert.equal(resource, 'swarm');
				assert.equal(action, 'update');
				assert.equal(environmentId, 42);
				return denied('Permission denied');
			},
			async requireEnvAccess() {
				accessChecked = true;
				return null;
			}
		}, 42);

		assert.equal(response?.status, 403);
		assert.equal(accessChecked, false);
	});

	it('requires both update permission and environment access', async () => {
		const calls: string[] = [];
		const response = await requireSwarmUpdateAccess({
			async requirePermission() { calls.push('permission'); return null; },
			async requireEnvAccess() { calls.push('environment'); return denied('Access denied'); }
		}, 7);

		assert.equal(response?.status, 403);
		assert.deepEqual(calls, ['permission', 'environment']);
	});
});
