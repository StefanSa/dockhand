import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import {
	SwarmResourceActionError,
	findSwarmResourceUsage,
	performSwarmResourceCreate,
	performSwarmResourceDelete
} from '../src/lib/server/swarm-resource';
import type { SwarmCapability } from '../src/lib/types/swarm';

const manager: SwarmCapability = {
	kind: 'swarm-manager', localNodeState: 'active', controlAvailable: true,
	detectedAt: '2026-08-23T00:00:00.000Z'
};

describe('Swarm Config and Secret actions', () => {
	for (const kind of ['config', 'secret'] as const) {
		it(`creates ${kind} data through Docker but returns metadata only`, async () => {
			const submittedValue = `${kind}-sensitive-value`;
			let requestBody = '';
			const result = await performSwarmResourceCreate(manager, kind, `${kind}-name`, submittedValue, async (path, options) => {
				assert.equal(path, `/${kind}s/create`);
				assert.equal(options?.method, 'POST');
				requestBody = String(options?.body);
				return { ID: `${kind}-id` };
			});

			assert.deepEqual(result, { id: `${kind}-id`, name: `${kind}-name` });
			assert.equal(JSON.stringify(result).includes(submittedValue), false);
			assert.equal(requestBody.includes(submittedValue), false);
			assert.equal(JSON.parse(requestBody).Data, Buffer.from(submittedValue).toString('base64'));
		});

		it(`deletes an unused ${kind} after checking service references`, async () => {
			const requested: string[] = [];
			const result = await performSwarmResourceDelete(manager, kind, `${kind}-id`, async (path, options) => {
				requested.push(`${options?.method ?? 'GET'} ${path}`);
				return path === '/services' ? [] : undefined;
			});
			assert.deepEqual(result, { id: `${kind}-id` });
			assert.deepEqual(requested, ['GET /services', `DELETE /${kind}s/${kind}-id`]);
		});
	}

	it('blocks deleting in-use Configs and Secrets before Docker DELETE', async () => {
		for (const kind of ['config', 'secret'] as const) {
			const idKey = kind === 'config' ? 'ConfigID' : 'SecretID';
			const listKey = kind === 'config' ? 'Configs' : 'Secrets';
			let deletes = 0;
			await assert.rejects(
				performSwarmResourceDelete(manager, kind, 'resource-id', async (path, options) => {
					if (options?.method === 'DELETE') deletes++;
					if (path === '/services') return [{
						ID: 'service-id', Spec: { Name: 'demo_web', TaskTemplate: { ContainerSpec: {
							[listKey]: [{ [idKey]: 'resource-id' }]
						} } }
					}];
				}),
				(error: unknown) => error instanceof SwarmResourceActionError
					&& error.statusCode === 409 && error.message.includes('demo_web')
			);
			assert.equal(deletes, 0);
		}
	});

	it('rejects Worker and Standalone mutations without Docker requests', async () => {
		for (const capability of [
			{ ...manager, kind: 'swarm-worker', controlAvailable: false },
			{ ...manager, kind: 'standalone', controlAvailable: false }
		] as SwarmCapability[]) {
			let requests = 0;
			await assert.rejects(
				performSwarmResourceCreate(capability, 'secret', 'name', 'value', async () => { requests++; }),
				(error: unknown) => error instanceof SwarmResourceActionError && error.statusCode === 409
			);
			await assert.rejects(
				performSwarmResourceDelete(capability, 'config', 'id', async () => { requests++; }),
				(error: unknown) => error instanceof SwarmResourceActionError && error.statusCode === 409
			);
			assert.equal(requests, 0);
		}
	});

	it('propagates Docker 404, 409, and transport errors without retrying', async () => {
		for (const dockerError of [
			Object.assign(new Error('not found'), { statusCode: 404 }),
			Object.assign(new Error('object is in use'), { statusCode: 409 }),
			new Error('transport failed')
		]) {
			let attempts = 0;
			await assert.rejects(
				performSwarmResourceCreate(manager, 'config', 'name', 'value', async () => {
					attempts++;
					throw dockerError;
				}),
				(error: unknown) => error === dockerError
			);
			assert.equal(attempts, 1);
		}
	});

	it('derives usage only from matching service references', () => {
		const services = [{ ID: 'one', Spec: { Name: 'web', TaskTemplate: { ContainerSpec: { Secrets: [{ SecretID: 'target' }] } } } }];
		assert.deepEqual(findSwarmResourceUsage(services, 'secret', 'target'), ['web']);
		assert.deepEqual(findSwarmResourceUsage(services, 'config', 'target'), []);
	});
});
