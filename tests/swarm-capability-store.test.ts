import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { get } from 'svelte/store';
import {
	capabilityForEnvironment,
	createSwarmCapabilityStore,
	type SwarmCapabilityCache
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

function capabilityCache(seed: Array<[number, SwarmCapability]> = []): SwarmCapabilityCache {
	const values = new Map(seed);
	return {
		get: (environmentId) => values.get(environmentId),
		set: (environmentId, value) => { values.set(environmentId, value); }
	};
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

	it('keeps the known standalone state visible while refreshing it', async () => {
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
			capability: capability('standalone'),
			loading: true,
			error: null
		});
		assert.equal(capabilityForEnvironment(get(store), 3)?.kind, 'standalone');

		refresh.resolve(capability('standalone'));
		await refreshLoad;
		assert.equal(capabilityForEnvironment(get(store), 3)?.kind, 'standalone');
	});

	it('hydrates the last known capability synchronously across page reloads', async () => {
		const cache = capabilityCache([[7, capability('swarm-manager')]]);
		const response = deferred<SwarmCapability>();
		const store = createSwarmCapabilityStore(() => response.promise, cache);

		const load = store.load(7);
		assert.equal(get(store).loading, true);
		assert.equal(capabilityForEnvironment(get(store), 7)?.kind, 'swarm-manager');

		response.resolve(capability('swarm-worker'));
		await load;
		assert.equal(capabilityForEnvironment(get(store), 7)?.kind, 'swarm-worker');

		const reloaded = createSwarmCapabilityStore(() => Promise.resolve(capability('swarm-worker')), cache);
		const reload = reloaded.load(7);
		assert.equal(capabilityForEnvironment(get(reloaded), 7)?.kind, 'swarm-worker');
		await reload;
	});

	it('switches between cached manager, worker and standalone states without a neutral frame', async () => {
		const cache = capabilityCache([
			[1, capability('swarm-manager')],
			[2, capability('swarm-worker')],
			[3, capability('standalone')]
		]);
		const pending = new Map<number, ReturnType<typeof deferred<SwarmCapability>>>();
		const store = createSwarmCapabilityStore((environmentId) => {
			const request = deferred<SwarmCapability>();
			pending.set(environmentId, request);
			return request.promise;
		}, cache);

		for (const [environmentId, kind] of [[1, 'swarm-manager'], [2, 'swarm-worker'], [3, 'standalone']] as const) {
			void store.load(environmentId);
			assert.equal(capabilityForEnvironment(get(store), environmentId)?.kind, kind);
		}

		pending.get(3)?.resolve(capability('standalone'));
		await new Promise((resolve) => setTimeout(resolve, 0));
		assert.equal(capabilityForEnvironment(get(store), 3)?.kind, 'standalone');
	});

	it('keeps a cached capability when background refresh fails', async () => {
		const store = createSwarmCapabilityStore(
			() => Promise.reject(new Error('temporarily unavailable')),
			capabilityCache([[4, capability('swarm-manager')]])
		);

		await store.load(4, true);
		assert.equal(capabilityForEnvironment(get(store), 4)?.kind, 'swarm-manager');
		assert.equal(get(store).error, 'temporarily unavailable');
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
