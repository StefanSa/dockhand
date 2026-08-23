export type SwarmCapabilityKind =
	| 'standalone'
	| 'swarm-manager'
	| 'swarm-worker'
	| 'swarm-unavailable'
	| 'unknown';

export type SwarmLocalNodeState = 'inactive' | 'pending' | 'active' | 'error' | 'locked';

export interface SwarmCapability {
	kind: SwarmCapabilityKind;
	localNodeState?: SwarmLocalNodeState;
	controlAvailable?: boolean;
	nodeId?: string;
	nodeAddress?: string;
	clusterId?: string;
	nodeCount?: number;
	managerCount?: number;
	managerAddresses?: string[];
	error?: string;
	apiVersion?: string;
	serverVersion?: string;
	detectedAt: string;
}

export interface SwarmNodeSummary {
	id: string;
	version: number;
	hostname: string;
	role: 'manager' | 'worker';
	availability: 'active' | 'pause' | 'drain' | 'unknown';
	status: string;
	address?: string;
	engineVersion?: string;
	platform?: { os?: string; architecture?: string };
	resources?: { nanoCpus?: number; memoryBytes?: number };
	managerStatus?: { leader: boolean; reachability?: string; address?: string };
	labels: Record<string, string>;
	createdAt?: string;
	updatedAt?: string;
}

export interface SwarmTaskSummary {
	id: string;
	version: number;
	name?: string;
	serviceId?: string;
	nodeId?: string;
	slot?: number;
	desiredState?: string;
	state?: string;
	message?: string;
	error?: string;
	image?: string;
	containerId?: string;
	createdAt?: string;
	updatedAt?: string;
	statusTimestamp?: string;
}

export interface SwarmServiceSummary {
	id: string;
	version: number;
	name: string;
	image?: string;
	mode: 'replicated' | 'global' | 'replicated-job' | 'global-job' | 'unknown';
	desiredTasks: number | null;
	runningTasks: number;
	completedTasks: number;
	labels: Record<string, string>;
	constraints: string[];
	preferences: unknown[];
	ports: Array<{
		name?: string;
		protocol?: string;
		targetPort?: number;
		publishedPort?: number;
		publishMode?: string;
	}>;
	updateStatus?: { state?: string; message?: string; startedAt?: string; completedAt?: string };
	createdAt?: string;
	updatedAt?: string;
}

export interface SwarmResourceUsage {
	serviceId: string;
	serviceName: string;
}

export interface SwarmConfigSummary {
	id: string;
	name: string;
	createdAt?: string;
	updatedAt?: string;
	services: SwarmResourceUsage[];
}

export interface SwarmSecretSummary {
	id: string;
	name: string;
	createdAt?: string;
	updatedAt?: string;
	services: SwarmResourceUsage[];
}

export interface SwarmStackSummary {
	name: string;
	services: SwarmServiceSummary[];
	runningTasks: number;
	desiredTasks: number | null;
}

export interface SwarmClusterSummary {
	id: string;
	version: number;
	name?: string;
	createdAt?: string;
	updatedAt?: string;
	dataPathPort?: number;
	defaultAddressPool?: string[];
	subnetSize?: number;
	autoLockManagers?: boolean;
	orchestration?: { taskHistoryRetentionLimit?: number };
	dispatcher?: { heartbeatPeriod?: number };
	caConfig?: { nodeCertExpiry?: number };
	raft?: {
		snapshotInterval?: number;
		keepOldSnapshots?: number;
		logEntriesForSlowFollowers?: number;
		electionTick?: number;
		heartbeatTick?: number;
	};
	health: {
		nodes: number;
		readyNodes: number;
		managers: number;
		reachableManagers: number;
		services: number;
		runningTasks: number;
	};
}

export interface SwarmReadModel {
	capability: SwarmCapability;
	managerEndpointRequired: boolean;
	cluster: SwarmClusterSummary | null;
	nodes: SwarmNodeSummary[];
	services: SwarmServiceSummary[];
	tasks: SwarmTaskSummary[];
	stacks: SwarmStackSummary[];
	configs: SwarmConfigSummary[];
	secrets: SwarmSecretSummary[];
}

function isRecord(value: unknown): value is Record<string, any> {
	return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function stringValue(value: unknown): string | undefined {
	return typeof value === 'string' && value.length > 0 ? value : undefined;
}

function numberValue(value: unknown): number | undefined {
	return typeof value === 'number' && Number.isFinite(value) ? value : undefined;
}

function stringRecord(value: unknown): Record<string, string> {
	if (!isRecord(value)) return {};
	return Object.fromEntries(
		Object.entries(value).filter((entry): entry is [string, string] => typeof entry[1] === 'string')
	);
}

function versionIndex(value: unknown): number {
	return isRecord(value) ? numberValue(value.Index) ?? 0 : 0;
}

export function unknownSwarmCapability(error?: unknown, detectedAt = new Date().toISOString()): SwarmCapability {
	const message = error instanceof Error ? error.message : stringValue(error);
	return {
		kind: 'unknown',
		error: message,
		detectedAt
	};
}

export function parseSwarmCapability(
	infoValue: unknown,
	versionValue?: unknown,
	detectedAt = new Date().toISOString()
): SwarmCapability {
	if (!isRecord(infoValue)) return unknownSwarmCapability('Docker /info returned an invalid response', detectedAt);

	const version = isRecord(versionValue) ? versionValue : {};
	const swarm = isRecord(infoValue.Swarm) ? infoValue.Swarm : null;
	const localNodeState = swarm ? stringValue(swarm.LocalNodeState) : undefined;
	const managerAddresses = swarm && Array.isArray(swarm.RemoteManagers)
		? swarm.RemoteManagers
			.map((manager: unknown) => isRecord(manager) ? stringValue(manager.Addr) : undefined)
			.filter((address: string | undefined): address is string => Boolean(address))
		: [];

	const base: Omit<SwarmCapability, 'kind'> = {
		localNodeState: ['inactive', 'pending', 'active', 'error', 'locked'].includes(localNodeState ?? '')
			? localNodeState as SwarmLocalNodeState
			: undefined,
		controlAvailable: swarm && typeof swarm.ControlAvailable === 'boolean' ? swarm.ControlAvailable : undefined,
		nodeId: swarm ? stringValue(swarm.NodeID) : undefined,
		nodeAddress: swarm ? stringValue(swarm.NodeAddr) : undefined,
		clusterId: swarm && isRecord(swarm.Cluster) ? stringValue(swarm.Cluster.ID) : undefined,
		nodeCount: swarm ? numberValue(swarm.Nodes) : undefined,
		managerCount: swarm ? numberValue(swarm.Managers) : undefined,
		managerAddresses,
		error: swarm ? stringValue(swarm.Error) : undefined,
		apiVersion: stringValue(version.ApiVersion),
		serverVersion: stringValue(version.Version) ?? stringValue(infoValue.ServerVersion),
		detectedAt
	};

	if (!swarm || !base.localNodeState) {
		return { ...base, kind: 'unknown', error: base.error ?? 'Docker /info did not report a valid Swarm state' };
	}

	if (base.localNodeState === 'inactive') return { ...base, kind: 'standalone' };
	if (base.localNodeState === 'active') {
		if (typeof base.controlAvailable !== 'boolean') {
			return { ...base, kind: 'unknown', error: base.error ?? 'Docker /info did not report the Swarm node role' };
		}
		return { ...base, kind: base.controlAvailable ? 'swarm-manager' : 'swarm-worker' };
	}
	return { ...base, kind: 'swarm-unavailable' };
}

export function isSwarmEnvironment(capability: SwarmCapability | null | undefined): boolean {
	return capability?.kind === 'swarm-manager' || capability?.kind === 'swarm-worker';
}

export function mapSwarmNode(value: unknown): SwarmNodeSummary {
	const node = isRecord(value) ? value : {};
	const spec = isRecord(node.Spec) ? node.Spec : {};
	const description = isRecord(node.Description) ? node.Description : {};
	const status = isRecord(node.Status) ? node.Status : {};
	const manager = isRecord(node.ManagerStatus) ? node.ManagerStatus : null;
	const platform = isRecord(description.Platform) ? description.Platform : {};
	const resources = isRecord(description.Resources) ? description.Resources : {};
	const engine = isRecord(description.Engine) ? description.Engine : {};
	const availability = stringValue(spec.Availability);

	return {
		id: stringValue(node.ID) ?? '',
		version: versionIndex(node.Version),
		hostname: stringValue(description.Hostname) ?? stringValue(node.ID) ?? 'Unknown node',
		role: spec.Role === 'manager' ? 'manager' : 'worker',
		availability: availability === 'active' || availability === 'pause' || availability === 'drain'
			? availability
			: 'unknown',
		status: stringValue(status.State) ?? 'unknown',
		address: stringValue(status.Addr),
		engineVersion: stringValue(engine.EngineVersion),
		platform: { os: stringValue(platform.OS), architecture: stringValue(platform.Architecture) },
		resources: { nanoCpus: numberValue(resources.NanoCPUs), memoryBytes: numberValue(resources.MemoryBytes) },
		managerStatus: manager ? {
			leader: manager.Leader === true,
			reachability: stringValue(manager.Reachability),
			address: stringValue(manager.Addr)
		} : undefined,
		labels: stringRecord(spec.Labels),
		createdAt: stringValue(node.CreatedAt),
		updatedAt: stringValue(node.UpdatedAt)
	};
}

export function mapSwarmTask(value: unknown): SwarmTaskSummary {
	const task = isRecord(value) ? value : {};
	const status = isRecord(task.Status) ? task.Status : {};
	const containerStatus = isRecord(status.ContainerStatus) ? status.ContainerStatus : {};
	const spec = isRecord(task.Spec) ? task.Spec : {};
	const containerSpec = isRecord(spec.ContainerSpec) ? spec.ContainerSpec : {};

	return {
		id: stringValue(task.ID) ?? '',
		version: versionIndex(task.Version),
		name: stringValue(task.Name),
		serviceId: stringValue(task.ServiceID),
		nodeId: stringValue(task.NodeID),
		slot: numberValue(task.Slot),
		desiredState: stringValue(task.DesiredState),
		state: stringValue(status.State),
		message: stringValue(status.Message),
		error: stringValue(status.Err),
		image: stringValue(containerSpec.Image),
		containerId: stringValue(containerStatus.ContainerID),
		createdAt: stringValue(task.CreatedAt),
		updatedAt: stringValue(task.UpdatedAt),
		statusTimestamp: stringValue(status.Timestamp)
	};
}

export function mapSwarmService(value: unknown, tasks: SwarmTaskSummary[] = []): SwarmServiceSummary {
	const service = isRecord(value) ? value : {};
	const spec = isRecord(service.Spec) ? service.Spec : {};
	const taskTemplate = isRecord(spec.TaskTemplate) ? spec.TaskTemplate : {};
	const containerSpec = isRecord(taskTemplate.ContainerSpec) ? taskTemplate.ContainerSpec : {};
	const modeSpec = isRecord(spec.Mode) ? spec.Mode : {};
	const endpointSpec = isRecord(spec.EndpointSpec) ? spec.EndpointSpec : {};
	const endpoint = isRecord(service.Endpoint) ? service.Endpoint : {};
	const placement = isRecord(taskTemplate.Placement) ? taskTemplate.Placement : {};
	const serviceStatus = isRecord(service.ServiceStatus) ? service.ServiceStatus : {};
	const updateStatus = isRecord(service.UpdateStatus) ? service.UpdateStatus : null;
	const id = stringValue(service.ID) ?? '';
	const serviceTasks = tasks.filter((task) => task.serviceId === id);

	let mode: SwarmServiceSummary['mode'] = 'unknown';
	let specDesired: number | null = null;
	if (isRecord(modeSpec.Replicated)) {
		mode = 'replicated';
		specDesired = numberValue(modeSpec.Replicated.Replicas) ?? 0;
	} else if (isRecord(modeSpec.Global)) {
		mode = 'global';
	} else if (isRecord(modeSpec.ReplicatedJob)) {
		mode = 'replicated-job';
	} else if (isRecord(modeSpec.GlobalJob)) {
		mode = 'global-job';
	}

	const desiredTasks = numberValue(serviceStatus.DesiredTasks) ?? specDesired;
	const runningTasks = numberValue(serviceStatus.RunningTasks)
		?? serviceTasks.filter((task) => task.state === 'running').length;
	const completedTasks = numberValue(serviceStatus.CompletedTasks)
		?? serviceTasks.filter((task) => task.state === 'complete').length;

	return {
		id,
		version: versionIndex(service.Version),
		name: stringValue(spec.Name) ?? id,
		image: stringValue(containerSpec.Image),
		mode,
		desiredTasks,
		runningTasks,
		completedTasks,
		labels: stringRecord(spec.Labels),
		constraints: Array.isArray(placement.Constraints)
			? placement.Constraints.filter((item: unknown): item is string => typeof item === 'string')
			: [],
		preferences: Array.isArray(placement.Preferences) ? placement.Preferences : [],
		ports: (Array.isArray(endpointSpec.Ports) ? endpointSpec.Ports : Array.isArray(endpoint.Ports) ? endpoint.Ports : []).map((port: unknown) => {
			const item = isRecord(port) ? port : {};
			return {
				name: stringValue(item.Name),
				protocol: stringValue(item.Protocol),
				targetPort: numberValue(item.TargetPort),
				publishedPort: numberValue(item.PublishedPort),
				publishMode: stringValue(item.PublishMode)
			};
		}),
		updateStatus: updateStatus ? {
			state: stringValue(updateStatus.State),
			message: stringValue(updateStatus.Message),
			startedAt: stringValue(updateStatus.StartedAt),
			completedAt: stringValue(updateStatus.CompletedAt)
		} : undefined,
		createdAt: stringValue(service.CreatedAt),
		updatedAt: stringValue(service.UpdatedAt)
	};
}

function mapSwarmResourceUsage(
	serviceValues: unknown[],
	resourceId: string,
	kind: 'config' | 'secret'
): SwarmResourceUsage[] {
	const idKey = kind === 'config' ? 'ConfigID' : 'SecretID';
	const listKey = kind === 'config' ? 'Configs' : 'Secrets';
	const usage: SwarmResourceUsage[] = [];

	for (const value of serviceValues) {
		const service = isRecord(value) ? value : {};
		const spec = isRecord(service.Spec) ? service.Spec : {};
		const taskTemplate = isRecord(spec.TaskTemplate) ? spec.TaskTemplate : {};
		const containerSpec = isRecord(taskTemplate.ContainerSpec) ? taskTemplate.ContainerSpec : {};
		const references = Array.isArray(containerSpec[listKey]) ? containerSpec[listKey] : [];
		if (!references.some((reference: unknown) => isRecord(reference) && reference[idKey] === resourceId)) continue;

		const serviceId = stringValue(service.ID) ?? '';
		usage.push({
			serviceId,
			serviceName: stringValue(spec.Name) ?? serviceId
		});
	}

	return usage.sort((a, b) => a.serviceName.localeCompare(b.serviceName));
}

function mapSwarmResource(
	value: unknown,
	serviceValues: unknown[],
	kind: 'config' | 'secret'
): SwarmConfigSummary | SwarmSecretSummary {
	const resource = isRecord(value) ? value : {};
	const spec = isRecord(resource.Spec) ? resource.Spec : {};
	const id = stringValue(resource.ID) ?? '';

	// Intentionally map only metadata. In particular, never copy Spec.Data for secrets.
	return {
		id,
		name: stringValue(spec.Name) ?? id,
		createdAt: stringValue(resource.CreatedAt),
		updatedAt: stringValue(resource.UpdatedAt),
		services: mapSwarmResourceUsage(serviceValues, id, kind)
	};
}

export function mapSwarmConfig(value: unknown, serviceValues: unknown[] = []): SwarmConfigSummary {
	return mapSwarmResource(value, serviceValues, 'config');
}

export function mapSwarmSecret(value: unknown, serviceValues: unknown[] = []): SwarmSecretSummary {
	return mapSwarmResource(value, serviceValues, 'secret');
}

export function mapSwarmStacks(services: SwarmServiceSummary[]): SwarmStackSummary[] {
	const grouped = new Map<string, SwarmServiceSummary[]>();
	for (const service of services) {
		const namespace = service.labels['com.docker.stack.namespace'];
		if (!namespace) continue;
		const current = grouped.get(namespace) ?? [];
		current.push(service);
		grouped.set(namespace, current);
	}

	return [...grouped.entries()]
		.map(([name, stackServices]) => ({
			name,
			services: stackServices.sort((a, b) => a.name.localeCompare(b.name)),
			runningTasks: stackServices.reduce((total, service) => total + service.runningTasks, 0),
			desiredTasks: stackServices.some((service) => service.desiredTasks === null)
				? null
				: stackServices.reduce((total, service) => total + (service.desiredTasks ?? 0), 0)
		}))
		.sort((a, b) => a.name.localeCompare(b.name));
}

export function mapSwarmCluster(
	value: unknown,
	nodes: SwarmNodeSummary[],
	services: SwarmServiceSummary[],
	tasks: SwarmTaskSummary[]
): SwarmClusterSummary {
	const cluster = isRecord(value) ? value : {};
	const spec = isRecord(cluster.Spec) ? cluster.Spec : {};
	const orchestration = isRecord(spec.Orchestration) ? spec.Orchestration : {};
	const dispatcher = isRecord(spec.Dispatcher) ? spec.Dispatcher : {};
	const caConfig = isRecord(spec.CAConfig) ? spec.CAConfig : {};
	const raft = isRecord(spec.Raft) ? spec.Raft : {};
	const managers = nodes.filter((node) => node.role === 'manager');

	return {
		id: stringValue(cluster.ID) ?? '',
		version: versionIndex(cluster.Version),
		name: stringValue(spec.Name),
		createdAt: stringValue(cluster.CreatedAt),
		updatedAt: stringValue(cluster.UpdatedAt),
		dataPathPort: numberValue(spec.DataPathPort),
		defaultAddressPool: Array.isArray(spec.DefaultAddrPool)
			? spec.DefaultAddrPool.filter((item: unknown): item is string => typeof item === 'string')
			: undefined,
		subnetSize: numberValue(spec.SubnetSize),
		autoLockManagers: typeof spec.EncryptionConfig?.AutoLockManagers === 'boolean'
			? spec.EncryptionConfig.AutoLockManagers
			: undefined,
		orchestration: { taskHistoryRetentionLimit: numberValue(orchestration.TaskHistoryRetentionLimit) },
		dispatcher: { heartbeatPeriod: numberValue(dispatcher.HeartbeatPeriod) },
		caConfig: { nodeCertExpiry: numberValue(caConfig.NodeCertExpiry) },
		raft: {
			snapshotInterval: numberValue(raft.SnapshotInterval),
			keepOldSnapshots: numberValue(raft.KeepOldSnapshots),
			logEntriesForSlowFollowers: numberValue(raft.LogEntriesForSlowFollowers),
			electionTick: numberValue(raft.ElectionTick),
			heartbeatTick: numberValue(raft.HeartbeatTick)
		},
		health: {
			nodes: nodes.length,
			readyNodes: nodes.filter((node) => node.status === 'ready').length,
			managers: managers.length,
			reachableManagers: managers.filter((node) => node.managerStatus?.reachability === 'reachable').length,
			services: services.length,
			runningTasks: tasks.filter((task) => task.state === 'running').length
		}
	};
}

export async function loadSwarmReadModel(
	capability: SwarmCapability,
	request: (path: string) => Promise<unknown>
): Promise<SwarmReadModel> {
	if (capability.kind !== 'swarm-manager') {
		return {
			capability,
			managerEndpointRequired: capability.kind === 'swarm-worker',
			cluster: null,
			nodes: [],
			services: [],
			tasks: [],
			stacks: [],
			configs: [],
			secrets: []
		};
	}

	const [clusterValue, nodeValues, serviceValues, taskValues, configValues, secretValues] = await Promise.all([
		request('/swarm'),
		request('/nodes'),
		request('/services?status=true'),
		request('/tasks'),
		request('/configs'),
		request('/secrets')
	]);
	const rawServices = Array.isArray(serviceValues) ? serviceValues : [];
	const nodes = Array.isArray(nodeValues) ? nodeValues.map(mapSwarmNode) : [];
	const tasks = Array.isArray(taskValues) ? taskValues.map(mapSwarmTask) : [];
	const services = rawServices.map((service) => mapSwarmService(service, tasks));

	return {
		capability,
		managerEndpointRequired: false,
		cluster: mapSwarmCluster(clusterValue, nodes, services, tasks),
		nodes,
		services,
		tasks,
		stacks: mapSwarmStacks(services),
		configs: Array.isArray(configValues)
			? configValues.map((config) => mapSwarmConfig(config, rawServices))
			: [],
		secrets: Array.isArray(secretValues)
			? secretValues.map((secret) => mapSwarmSecret(secret, rawServices))
			: []
	};
}
