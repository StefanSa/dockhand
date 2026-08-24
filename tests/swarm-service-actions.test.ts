import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import {
	performSwarmServiceAction,
	SwarmServiceActionError
} from '../src/lib/server/swarm-service';
import type { SwarmCapability } from '../src/lib/types/swarm';

const manager: SwarmCapability = {
	kind: 'swarm-manager',
	localNodeState: 'active',
	controlAvailable: true,
	detectedAt: '2026-08-22T00:00:00.000Z'
};

function service(mode: Record<string, unknown>, forceUpdate = 4): Record<string, unknown> {
	return {
		Version: { Index: 17 },
		Spec: {
			Name: 'validation',
			Labels: { existing: 'preserved' },
			TaskTemplate: {
				ForceUpdate: forceUpdate,
				ContainerSpec: { Image: 'alpine:latest', Args: ['sleep', '3600'] }
			},
			Mode: mode,
			UpdateConfig: { Parallelism: 1 }
		}
	};
}

describe('Swarm service actions', () => {
	it('scales a replicated service with its current version and complete spec', async () => {
		const calls: Array<{ path: string; options?: RequestInit }> = [];
		const result = await performSwarmServiceAction(manager, 'service/id', { type: 'scale', replicas: 3 }, async (path, options) => {
			calls.push({ path, options });
			return calls.length === 1
				? service({ Replicated: { Replicas: 6 } })
				: { Warnings: ['service warning'] };
		});

		assert.deepEqual(calls.map((call) => call.path), [
			'/services/service%2Fid',
			'/services/service%2Fid/update?version=17'
		]);
		assert.equal(calls[1].options?.method, 'POST');
		const spec = JSON.parse(String(calls[1].options?.body));
		assert.equal(spec.Mode.Replicated.Replicas, 3);
		assert.equal(spec.TaskTemplate.ForceUpdate, 4);
		assert.equal(spec.Labels.existing, 'preserved');
		assert.equal(spec.UpdateConfig.Parallelism, 1);
		assert.deepEqual(result, { action: 'scale', version: 17, warnings: ['service warning'] });
	});

	it('force-updates a replicated service by incrementing only TaskTemplate.ForceUpdate', async () => {
		const calls: Array<{ path: string; options?: RequestInit }> = [];
		const result = await performSwarmServiceAction(manager, 'service', { type: 'force-update' }, async (path, options) => {
			calls.push({ path, options });
			return calls.length === 1
				? service({ Replicated: { Replicas: 6 } }, 9)
				: { Warnings: null };
		});

		const updateBody = JSON.parse(String(calls[1].options?.body));
		assert.equal(updateBody.TaskTemplate.ForceUpdate, 10);
		assert.equal(updateBody.Mode.Replicated.Replicas, 6);
		assert.equal(updateBody.TaskTemplate.ContainerSpec.Image, 'alpine:latest');
		assert.deepEqual(result, { action: 'force-update', version: 17, warnings: [] });
	});

	it('replaces only the selected Config reference while preserving its target and the complete Service spec', async () => {
		const calls: Array<{ path: string; options?: RequestInit }> = [];
		const current = service({ Replicated: { Replicas: 2 } });
		(current.Spec as any).TaskTemplate.ContainerSpec.Configs = [
			{ ConfigID: 'config-old', ConfigName: 'app-v1', File: { Name: '/etc/app.conf', UID: '1000', GID: '1000', Mode: 288 } },
			{ ConfigID: 'config-other', ConfigName: 'shared', File: { Name: '/etc/shared.conf' } }
		];

		const result = await performSwarmServiceAction(manager, 'service', {
			type: 'replace-config',
			sourceConfigId: 'config-old',
			replacementConfigId: 'config-new',
			replacementConfigName: 'app-v2'
		}, async (path, options) => {
			calls.push({ path, options });
			return calls.length === 1 ? current : { Warnings: ['rolling update started'] };
		});

		const updateBody = JSON.parse(String(calls[1].options?.body));
		assert.deepEqual(updateBody.TaskTemplate.ContainerSpec.Configs, [
			{ ConfigID: 'config-new', ConfigName: 'app-v2', File: { Name: '/etc/app.conf', UID: '1000', GID: '1000', Mode: 288 } },
			{ ConfigID: 'config-other', ConfigName: 'shared', File: { Name: '/etc/shared.conf' } }
		]);
		assert.equal(updateBody.TaskTemplate.ForceUpdate, 4);
		assert.equal(updateBody.Mode.Replicated.Replicas, 2);
		assert.deepEqual(updateBody.Labels, { existing: 'preserved' });
		assert.deepEqual(result, { action: 'replace-config', version: 17, warnings: ['rolling update started'] });
	});

	it('rejects a stale or duplicate Config replacement before issuing a Service update', async () => {
		for (const configs of [
			[{ ConfigID: 'config-other', ConfigName: 'other' }],
			[{ ConfigID: 'config-old', ConfigName: 'old' }, { ConfigID: 'config-new', ConfigName: 'new' }]
		]) {
			let requests = 0;
			await assert.rejects(
				performSwarmServiceAction(manager, 'service', {
					type: 'replace-config', sourceConfigId: 'config-old', replacementConfigId: 'config-new', replacementConfigName: 'new'
				}, async () => {
					requests++;
					const current = service({ Replicated: { Replicas: 1 } });
					(current.Spec as any).TaskTemplate.ContainerSpec.Configs = configs;
					return current;
				}),
				(error: unknown) => error instanceof SwarmServiceActionError && error.statusCode === 409
			);
			assert.equal(requests, 1);
		}
	});

	it('rejects every direct mutation of a stack-managed service before issuing an update', async () => {
		for (const action of [
			{ type: 'scale', replicas: 3 } as const,
			{ type: 'force-update' } as const,
			{ type: 'replace-config', sourceConfigId: 'config-old', replacementConfigId: 'config-new', replacementConfigName: 'new' } as const
		]) {
			let requests = 0;
			await assert.rejects(
				performSwarmServiceAction(manager, 'stack-service', action, async () => {
					requests++;
					const current = service({ Replicated: { Replicas: 2 } });
					(current.Spec as any).Labels['com.docker.stack.namespace'] = 'platform';
					return current;
				}),
				(error: unknown) => error instanceof SwarmServiceActionError
					&& error.statusCode === 409
					&& /stored stack definition/i.test(error.message)
			);
			assert.equal(requests, 1);
		}
	});

	for (const capability of [
		{ ...manager, kind: 'swarm-worker', controlAvailable: false } as SwarmCapability,
		{ ...manager, kind: 'standalone', localNodeState: 'inactive', controlAvailable: false } as SwarmCapability
	]) {
		it(`rejects ${capability.kind} without issuing Docker service requests`, async () => {
			let requests = 0;
			await assert.rejects(
				performSwarmServiceAction(capability, 'service', { type: 'force-update' }, async () => {
					requests++;
					return {};
				}),
				(error: unknown) => error instanceof SwarmServiceActionError && error.statusCode === 409
			);
			assert.equal(requests, 0);
		});
	}

	it('propagates Docker API errors without retrying or changing the request', async () => {
		const dockerError = Object.assign(new Error('update conflict'), { statusCode: 409 });
		let requests = 0;
		await assert.rejects(
			performSwarmServiceAction(manager, 'service', { type: 'scale', replicas: 5 }, async (_path, options) => {
				requests++;
				if (!options) return service({ Replicated: { Replicas: 6 } });
				throw dockerError;
			}),
			(error: unknown) => error === dockerError
		);
		assert.equal(requests, 2);
	});

	it('rejects scaling a global service before issuing an update', async () => {
		let requests = 0;
		await assert.rejects(
			performSwarmServiceAction(manager, 'service', { type: 'scale', replicas: 2 }, async () => {
				requests++;
				return service({ Global: {} });
			}),
			(error: unknown) => error instanceof SwarmServiceActionError && error.statusCode === 400
		);
		assert.equal(requests, 1);
	});
});
