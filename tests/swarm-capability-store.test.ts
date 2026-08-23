import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { get } from 'svelte/store';
import {
	capabilityForEnvironment,
	createSwarmCapabilityStore
} from '../src/lib/stores/swarm-capability';
import type { SwarmCapability } from '../src/lib/types/swarm';

function deferred<T>() {
	let resolve!: (value: T) => void;
	let reject!: (reason?: unknown) => void;
	const promise = new Promise<T>((res, rej) => {
		resolve = res;
		reject = rej;
	});
	return { promise, resolve, reject };
}

function capability(kind: SwarmCapability['kind']): SwarmCapability {
	return { kind, detectedAt: '2026-08-23T00:00:00.000Z' };
}

describe('Swarm capability store environment switching', () => {
	it('clears manager capability immediately and ignores its stale response on a worker', async () => {
		const manager = deferred<SwarmCapability>();
		const worker = deferred<SwarmCapability>();
		const store = createSwarmCapabilityStore((environmentId) => (
			environmentId === 1 ? manager.promise : worker.promise
		));

		const managerLoad = store.load(1);
		const workerLoad = store.load(2);
		assert.deepEqual(get(store), {
			environmentId: 2,
			capability: null,
			loading: true,
			error: null
		});

		worker.resolve(capability('swarm-worker'));
		await workerLoad;
		manager.resolve(capability('swarm-manager'));
		await managerLoad;

		assert.equal(get(store).environmentId, 2);
		assert.equal(get(store).capability?.kind, 'swarm-worker');
	});

	it('keeps only the last response across manager, worker, standalone and manager switches', async () => {
		const requests = new Map<number, ReturnType<typeof deferred<SwarmCapability>>>();
		const store = createSwarmCapabilityStore((environmentId) => {
			const request = deferred<SwarmCapability>();
			requests.set(environmentId, request);
			return request.promise;
		});

		const loads = [store.load(1), store.load(2), store.load(3), store.load(4)];
		requests.get(2)?.resolve(capability('swarm-worker'));
		requests.get(1)?.resolve(capability('swarm-manager'));
		requests.get(3)?.resolve(capability('standalone'));
		requests.get(4)?.resolve(capability('swarm-manager'));
		await Promise.all(loads);

		assert.equal(get(store).environmentId, 4);
		assert.equal(get(store).capability?.kind, 'swarm-manager');
	});

	it('uses a neutral state while refreshing a standalone environment', async () => {
		const refresh = deferred<SwarmCapability>();
		let requestCount = 0;
		const store = createSwarmCapabilityStore(() => {
			requestCount++;
			return requestCount === 1 ? Promise.resolve(capability('standalone')) : refresh.promise;
		});

		await store.load(3);
		const refreshLoad = store.load(3, true);

		assert.deepEqual(get(store), {
			environmentId: 3,
			capability: null,
			loading: true,
			error: null
		});
		assert.equal(capabilityForEnvironment(get(store), 3), null);

		refresh.resolve(capability('standalone'));
		await refreshLoad;
		assert.equal(capabilityForEnvironment(get(store), 3)?.kind, 'standalone');
	});

	it('never exposes manager or worker capability after switching to standalone', async () => {
		for (const previousKind of ['swarm-manager', 'swarm-worker'] as const) {
			const standalone = deferred<SwarmCapability>();
			const store = createSwarmCapabilityStore((environmentId) => (
				environmentId === 1 ? Promise.resolve(capability(previousKind)) : standalone.promise
			));

			await store.load(1);
			const standaloneLoad = store.load(2);
			assert.equal(capabilityForEnvironment(get(store), 2), null);
			assert.equal(get(store).capability, null);

			standalone.resolve(capability('standalone'));
			await standaloneLoad;
			assert.equal(capabilityForEnvironment(get(store), 2)?.kind, 'standalone');
		}
	});

	it('ignores a stale page capability after the active environment changes', async () => {
		const standalone = deferred<SwarmCapability>();
		const store = createSwarmCapabilityStore((environmentId) => (
			environmentId === 2 ? standalone.promise : Promise.resolve(capability('swarm-manager'))
		));

		await store.load(1);
		const standaloneLoad = store.load(2);
		store.setCapability(1, capability('swarm-manager'));
		assert.deepEqual(get(store), {
			environmentId: 2,
			capability: null,
			loading: true,
			error: null
		});

		standalone.resolve(capability('standalone'));
		await standaloneLoad;
		assert.equal(capabilityForEnvironment(get(store), 2)?.kind, 'standalone');
	});
});
