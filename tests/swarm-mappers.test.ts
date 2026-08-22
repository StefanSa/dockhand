import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import {
	mapSwarmCluster,
	mapSwarmNode,
	mapSwarmService,
	mapSwarmTask,
	loadSwarmReadModel,
	type SwarmCapability
} from '../src/lib/types/swarm';

describe('Swarm read-only response mapping', () => {
	it('maps node identity, role, status, labels, engine, and resources', () => {
		const node = mapSwarmNode({
			ID: 'node-1',
			Version: { Index: 7 },
			Spec: { Role: 'manager', Availability: 'active', Labels: { region: 'eu' } },
			Description: {
				Hostname: 'manager-1',
				Platform: { OS: 'linux', Architecture: 'x86_64' },
				Resources: { NanoCPUs: 4_000_000_000, MemoryBytes: 8_589_934_592 },
				Engine: { EngineVersion: '28.3.3' }
			},
			Status: { State: 'ready', Addr: '10.0.0.10' },
			ManagerStatus: { Leader: true, Reachability: 'reachable', Addr: '10.0.0.10:2377' }
		});

		assert.deepEqual(node, {
			id: 'node-1',
			version: 7,
			hostname: 'manager-1',
			role: 'manager',
			availability: 'active',
			status: 'ready',
			address: '10.0.0.10',
			engineVersion: '28.3.3',
			platform: { os: 'linux', architecture: 'x86_64' },
			resources: { nanoCpus: 4_000_000_000, memoryBytes: 8_589_934_592 },
			managerStatus: { leader: true, reachability: 'reachable', address: '10.0.0.10:2377' },
			labels: { region: 'eu' },
			createdAt: undefined,
			updatedAt: undefined
		});
	});

	it('maps tasks and derives service presentation fields', () => {
		const task = mapSwarmTask({
			ID: 'task-1',
			Version: { Index: 9 },
			ServiceID: 'service-1',
			NodeID: 'node-1',
			Slot: 2,
			DesiredState: 'running',
			Spec: { ContainerSpec: { Image: 'nginx:1.29' } },
			Status: {
				State: 'running',
				Message: 'started',
				Timestamp: '2026-08-22T00:00:00Z',
				ContainerStatus: { ContainerID: 'container-1' }
			}
		});
		const service = mapSwarmService({
			ID: 'service-1',
			Version: { Index: 11 },
			Spec: {
				Name: 'web',
				Labels: { team: 'platform' },
				TaskTemplate: {
					ContainerSpec: { Image: 'nginx:1.29' },
					Placement: { Constraints: ['node.labels.region==eu'], Preferences: [{ Spread: { SpreadDescriptor: 'node.labels.zone' } }] }
				},
				Mode: { Replicated: { Replicas: 3 } },
				EndpointSpec: { Ports: [{ Protocol: 'tcp', TargetPort: 80, PublishedPort: 8080, PublishMode: 'ingress' }] }
			},
			ServiceStatus: { RunningTasks: 2, DesiredTasks: 3 },
			UpdateStatus: { State: 'completed', Message: 'update completed' }
		}, [task]);

		assert.equal(task.state, 'running');
		assert.equal(task.containerId, 'container-1');
		assert.equal(service.name, 'web');
		assert.equal(service.mode, 'replicated');
		assert.equal(service.desiredTasks, 3);
		assert.equal(service.runningTasks, 2);
		assert.deepEqual(service.labels, { team: 'platform' });
		assert.deepEqual(service.constraints, ['node.labels.region==eu']);
		assert.deepEqual(service.ports[0], {
			name: undefined,
			protocol: 'tcp',
			targetPort: 80,
			publishedPort: 8080,
			publishMode: 'ingress'
		});
	});

	it('maps cluster health without exposing join tokens', () => {
		const nodes = [
			mapSwarmNode({ ID: 'manager', Spec: { Role: 'manager', Availability: 'active' }, Description: { Hostname: 'manager' }, Status: { State: 'ready' }, ManagerStatus: { Reachability: 'reachable' } }),
			mapSwarmNode({ ID: 'worker', Spec: { Role: 'worker', Availability: 'active' }, Description: { Hostname: 'worker' }, Status: { State: 'down' } })
		];
		const tasks = [mapSwarmTask({ ID: 'task', ServiceID: 'service', Status: { State: 'running' } })];
		const services = [mapSwarmService({ ID: 'service', Spec: { Name: 'web', Mode: { Global: {} } } }, tasks)];
		const cluster = mapSwarmCluster({
			ID: 'cluster',
			Version: { Index: 3 },
			JoinTokens: { Worker: 'must-not-leak', Manager: 'must-not-leak' },
			Spec: { Name: 'production', DataPathPort: 4789 }
		}, nodes, services, tasks);

		assert.equal(cluster.name, 'production');
		assert.deepEqual(cluster.health, {
			nodes: 2,
			readyNodes: 1,
			managers: 1,
			reachableManagers: 1,
			services: 1,
			runningTasks: 1
		});
		assert.equal('joinTokens' in cluster, false);
	});

	it('does not call manager-only endpoints for a worker', async () => {
		const capability: SwarmCapability = {
			kind: 'swarm-worker',
			localNodeState: 'active',
			controlAvailable: false,
			nodeId: 'worker',
			detectedAt: '2026-08-22T00:00:00.000Z'
		};
		let requests = 0;
		const model = await loadSwarmReadModel(capability, async () => {
			requests++;
			throw new Error('must not be called');
		});

		assert.equal(requests, 0);
		assert.equal(model.managerEndpointRequired, true);
		assert.equal(model.cluster, null);
		assert.deepEqual(model.nodes, []);
	});

	it('uses only the four read-only manager endpoints', async () => {
		const capability: SwarmCapability = {
			kind: 'swarm-manager',
			localNodeState: 'active',
			controlAvailable: true,
			detectedAt: '2026-08-22T00:00:00.000Z'
		};
		const requested: string[] = [];
		const responses: Record<string, unknown> = {
			'/swarm': { ID: 'cluster' },
			'/nodes': [],
			'/services?status=true': [],
			'/tasks': []
		};
		const model = await loadSwarmReadModel(capability, async (path) => {
			requested.push(path);
			return responses[path];
		});

		assert.deepEqual(requested.sort(), ['/nodes', '/services?status=true', '/swarm', '/tasks'].sort());
		assert.equal(model.cluster?.id, 'cluster');
	});
});
