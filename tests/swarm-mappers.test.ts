import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import {
	mapSwarmCluster,
	mapSwarmConfig,
	mapSwarmNode,
	mapSwarmSecret,
	mapSwarmService,
	mapSwarmStacks,
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
				Labels: { team: 'platform', 'com.docker.stack.namespace': 'demo' },
				TaskTemplate: {
					ContainerSpec: {
						Image: 'nginx:1.29',
						Configs: [{ ConfigID: 'config-1', ConfigName: 'app-config', File: { Name: '/etc/app.conf' } }],
						Secrets: [{ SecretID: 'secret-1', SecretName: 'db-password', File: { Name: 'db-password' } }]
					},
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
		assert.deepEqual(service.labels, { team: 'platform', 'com.docker.stack.namespace': 'demo' });
		assert.equal(service.stackName, 'demo');
		assert.equal(service.healthState, 'converging');
		assert.deepEqual(service.configs, [{ id: 'config-1', name: 'app-config', target: '/etc/app.conf' }]);
		assert.deepEqual(service.secrets, [{ id: 'secret-1', name: 'db-password', target: 'db-password' }]);
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

	it('discovers Swarm stacks from namespace labels and keeps their services grouped', () => {
		const services = [
			mapSwarmService({ ID: 'one', Spec: { Name: 'demo_web', Labels: { 'com.docker.stack.namespace': 'demo' }, Mode: { Replicated: { Replicas: 2 } } }, ServiceStatus: { RunningTasks: 2, DesiredTasks: 2 } }),
			mapSwarmService({ ID: 'two', Spec: { Name: 'demo_worker', Labels: { 'com.docker.stack.namespace': 'demo' }, Mode: { Replicated: { Replicas: 1 } } }, ServiceStatus: { RunningTasks: 1, DesiredTasks: 1 } }),
			mapSwarmService({ ID: 'loose', Spec: { Name: 'loose', Mode: { Replicated: { Replicas: 1 } } } })
		];

		const stacks = mapSwarmStacks(services);
		assert.equal(stacks.length, 1);
		assert.equal(stacks[0].name, 'demo');
		assert.deepEqual(stacks[0].services.map((service) => service.name), ['demo_web', 'demo_worker']);
		assert.equal(stacks[0].runningTasks, 3);
		assert.equal(stacks[0].desiredTasks, 3);
	});

	it('maps config and secret metadata with safely derived service usage', () => {
		const services = [{
			ID: 'service-1',
			Spec: {
				Name: 'demo_web',
				Labels: { 'com.docker.stack.namespace': 'demo' },
				TaskTemplate: { ContainerSpec: {
					Configs: [{ ConfigID: 'config-1', ConfigName: 'app-config' }],
					Secrets: [{ SecretID: 'secret-1', SecretName: 'db-password' }]
				} }
			}
		}];
		const config = mapSwarmConfig({
			ID: 'config-1', Version: { Index: 12 }, CreatedAt: '2026-08-23T10:00:00Z', UpdatedAt: '2026-08-23T10:01:00Z',
			Spec: { Name: 'app-config', Labels: { team: 'platform' }, Data: Buffer.from('config contents').toString('base64') }
		}, services);
		const secret = mapSwarmSecret({
			ID: 'secret-1', Version: { Index: 13 }, CreatedAt: '2026-08-23T11:00:00Z', UpdatedAt: '2026-08-23T11:01:00Z',
			Spec: { Name: 'db-password', Data: 'c3VwZXItc2VjcmV0' }
		}, services);

		assert.deepEqual(config, {
			id: 'config-1', version: 12, name: 'app-config', labels: { team: 'platform' }, data: 'config contents', createdAt: '2026-08-23T10:00:00Z', updatedAt: '2026-08-23T10:01:00Z',
			services: [{ serviceId: 'service-1', serviceName: 'demo_web', stackName: 'demo' }], stackNames: ['demo']
		});
		assert.deepEqual(secret, {
			id: 'secret-1', version: 13, name: 'db-password', labels: {}, createdAt: '2026-08-23T11:00:00Z', updatedAt: '2026-08-23T11:01:00Z',
			services: [{ serviceId: 'service-1', serviceName: 'demo_web', stackName: 'demo' }], stackNames: ['demo']
		});
		assert.equal(config.data, 'config contents');
		assert.equal(JSON.stringify(secret).includes('c3VwZXItc2VjcmV0'), false);
		assert.equal(JSON.stringify(secret).includes('super-secret'), false);
		assert.equal('data' in secret, false);
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
		assert.deepEqual(model.configs, []);
		assert.deepEqual(model.secrets, []);
		assert.deepEqual(model.networks, []);
	});

	it('uses only the seven read-only manager endpoints', async () => {
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
			'/tasks': [],
			'/configs': [],
			'/secrets': [],
			'/networks': []
		};
		const model = await loadSwarmReadModel(capability, async (path) => {
			requested.push(path);
			return responses[path];
		});

		assert.deepEqual(requested.sort(), ['/configs', '/networks', '/nodes', '/secrets', '/services?status=true', '/swarm', '/tasks'].sort());
		assert.equal(model.cluster?.id, 'cluster');
	});
});
