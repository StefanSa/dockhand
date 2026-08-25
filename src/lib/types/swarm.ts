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
	command: string[];
	args: string[];
	environment: string[];
	healthcheck?: SwarmServiceHealthcheck;
	mode: 'replicated' | 'global' | 'replicated-job' | 'global-job' | 'unknown';
	desiredTasks: number | null;
	runningTasks: number;
	completedTasks: number;
	healthState: 'healthy' | 'converging' | 'degraded' | 'updating' | 'idle' | 'unknown';
	labels: Record<string, string>;
	stackName?: string;
	constraints: string[];
	preferences: unknown[];
	mounts: SwarmServiceMount[];
	networks: SwarmServiceNetworkAttachment[];
	configs: SwarmServiceResourceReference[];
	secrets: SwarmServiceResourceReference[];
	ports: SwarmServicePort[];
	resources: SwarmServiceResources;
	restartPolicy?: SwarmServiceRestartPolicy;
	updatePolicy?: SwarmServiceUpdatePolicy;
	rollbackPolicy?: SwarmServiceUpdatePolicy;
	stopGracePeriodSeconds?: number;
	endpointMode?: 'vip' | 'dnsrr';
	updateStatus?: { state?: string; message?: string; startedAt?: string; completedAt?: string };
	createdAt?: string;
	updatedAt?: string;
}

export interface SwarmServiceResourceReference {
	id: string;
	name: string;
	target?: string;
	uid?: string;
	gid?: string;
	mode?: number;
}

export interface SwarmServicePort {
	name?: string;
	protocol: 'tcp' | 'udp' | 'sctp';
	targetPort: number;
	publishedPort?: number;
	publishMode: 'ingress' | 'host';
}

export interface SwarmServiceMount {
	type: 'bind' | 'volume' | 'tmpfs' | 'npipe' | 'cluster';
	source?: string;
	target: string;
	readOnly: boolean;
}

export interface SwarmServiceNetworkAttachment {
	target: string;
	aliases: string[];
	driverOpts: Record<string, string>;
}

export interface SwarmServiceResourceLimit {
	cores?: number;
	memoryMb?: number;
}

export interface SwarmServiceResources {
	limits: SwarmServiceResourceLimit;
	reservations: SwarmServiceResourceLimit;
}

export interface SwarmServiceRestartPolicy {
	condition: 'none' | 'on-failure' | 'any';
	delaySeconds?: number;
	maxAttempts?: number;
	windowSeconds?: number;
}

export interface SwarmServiceHealthcheck {
	test: string[];
	intervalSeconds?: number;
	timeoutSeconds?: number;
	retries?: number;
	startPeriodSeconds?: number;
}

export interface SwarmServiceUpdatePolicy {
	parallelism: number;
	delaySeconds: number;
	failureAction: 'continue' | 'pause' | 'rollback';
	monitorSeconds: number;
	maxFailureRatio: number;
	order: 'stop-first' | 'start-first';
}

export interface SwarmServiceUpdateInput {
	image: string;
	mode: 'replicated' | 'global';
	replicas: number | null;
	command: string[];
	args: string[];
	environment: string[];
	labels: Record<string, string>;
	healthcheck?: SwarmServiceHealthcheck;
	ports: SwarmServicePort[];
	mounts: SwarmServiceMount[];
	networks: SwarmServiceNetworkAttachment[];
	configs: SwarmServiceResourceReference[];
	secrets: SwarmServiceResourceReference[];
	constraints: string[];
	resources: SwarmServiceResources;
	restartPolicy?: SwarmServiceRestartPolicy;
	updatePolicy?: SwarmServiceUpdatePolicy;
	rollbackPolicy?: SwarmServiceUpdatePolicy;
	stopGracePeriodSeconds?: number;
	endpointMode?: 'vip' | 'dnsrr';
}

export interface SwarmNetworkSummary {
	id: string;
	name: string;
	driver?: string;
	scope?: string;
	attachable: boolean;
	internal: boolean;
	ingress: boolean;
	labels: Record<string, string>;
}

export interface SwarmResourceUsage {
	serviceId: string;
	serviceName: string;
	stackName?: string;
}

export interface SwarmConfigSummary {
	id: string;
	version: number;
	name: string;
	labels: Record<string, string>;
	data?: string;
	createdAt?: string;
	updatedAt?: string;
	services: SwarmResourceUsage[];
	stackNames: string[];
}

export interface SwarmSecretSummary {
	id: string;
	version: number;
	name: string;
	labels: Record<string, string>;
	createdAt?: string;
	updatedAt?: string;
	services: SwarmResourceUsage[];
	stackNames: string[];
}

export interface SwarmStackSummary {
	name: string;
	services: SwarmServiceSummary[];
	runningTasks: number;
	desiredTasks: number | null;
	managed: boolean;
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
	networks: SwarmNetworkSummary[];
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

function mapServiceResourceReferences(
	containerSpec: Record<string, unknown>,
	kind: 'config' | 'secret'
): SwarmServiceResourceReference[] {
	const listKey = kind === 'config' ? 'Configs' : 'Secrets';
	const idKey = kind === 'config' ? 'ConfigID' : 'SecretID';
	const nameKey = kind === 'config' ? 'ConfigName' : 'SecretName';
	const references = Array.isArray(containerSpec[listKey]) ? containerSpec[listKey] : [];

	return references.flatMap((value: unknown) => {
		if (!isRecord(value)) return [];
		const id = stringValue(value[idKey]) ?? '';
		const name = stringValue(value[nameKey]) ?? id;
		if (!id && !name) return [];
		const file = isRecord(value.File) ? value.File : {};
		const reference: SwarmServiceResourceReference = { id, name };
		const target = stringValue(file.Name);
		const uid = stringValue(file.UID);
		const gid = stringValue(file.GID);
		const mode = numberValue(file.Mode);
		if (target !== undefined) reference.target = target;
		if (uid !== undefined) reference.uid = uid;
		if (gid !== undefined) reference.gid = gid;
		if (mode !== undefined) reference.mode = mode;
		return [reference];
	});
}

function stringArray(value: unknown): string[] {
	return Array.isArray(value)
		? value.filter((item: unknown): item is string => typeof item === 'string')
		: [];
}

function secondsFromNanoseconds(value: unknown): number | undefined {
	const nanoseconds = numberValue(value);
	return nanoseconds === undefined ? undefined : nanoseconds / 1_000_000_000;
}

function mapServicePolicy(value: unknown): SwarmServiceUpdatePolicy | undefined {
	if (!isRecord(value)) return undefined;
	const failureAction = stringValue(value.FailureAction);
	const order = stringValue(value.Order);
	return {
		parallelism: numberValue(value.Parallelism) ?? 1,
		delaySeconds: secondsFromNanoseconds(value.Delay) ?? 0,
		failureAction: failureAction === 'continue' || failureAction === 'rollback' ? failureAction : 'pause',
		monitorSeconds: secondsFromNanoseconds(value.Monitor) ?? 5,
		maxFailureRatio: numberValue(value.MaxFailureRatio) ?? 0,
		order: order === 'start-first' ? 'start-first' : 'stop-first'
	};
}

export function mapSwarmNetwork(value: unknown): SwarmNetworkSummary {
	const network = isRecord(value) ? value : {};
	return {
		id: stringValue(network.Id) ?? stringValue(network.ID) ?? '',
		name: stringValue(network.Name) ?? stringValue(network.Id) ?? '',
		driver: stringValue(network.Driver),
		scope: stringValue(network.Scope),
		attachable: network.Attachable === true,
		internal: network.Internal === true,
		ingress: network.Ingress === true,
		labels: stringRecord(network.Labels)
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
	const resources = isRecord(taskTemplate.Resources) ? taskTemplate.Resources : {};
	const limits = isRecord(resources.Limits) ? resources.Limits : {};
	const reservations = isRecord(resources.Reservations) ? resources.Reservations : {};
	const restartPolicy = isRecord(taskTemplate.RestartPolicy) ? taskTemplate.RestartPolicy : null;
	const healthcheck = isRecord(containerSpec.Healthcheck) ? containerSpec.Healthcheck : null;
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
	const activeTasks = serviceTasks.filter((task) => task.desiredState !== 'shutdown');
	const updateState = stringValue(updateStatus?.State);
	let healthState: SwarmServiceSummary['healthState'] = 'unknown';
	if (updateState === 'updating' || updateState === 'rollback_started') healthState = 'updating';
	else if (desiredTasks === 0) healthState = 'idle';
	else if (activeTasks.some((task) => ['failed', 'rejected', 'orphaned'].includes(task.state ?? ''))) healthState = 'degraded';
	else if (desiredTasks !== null && runningTasks >= desiredTasks) healthState = 'healthy';
	else if (desiredTasks !== null) healthState = 'converging';
	const labels = stringRecord(spec.Labels);

	return {
		id,
		version: versionIndex(service.Version),
		name: stringValue(spec.Name) ?? id,
		image: stringValue(containerSpec.Image),
		command: stringArray(containerSpec.Command),
		args: stringArray(containerSpec.Args),
		environment: stringArray(containerSpec.Env),
		healthcheck: healthcheck && stringArray(healthcheck.Test).length > 0 ? {
			test: stringArray(healthcheck.Test),
			intervalSeconds: secondsFromNanoseconds(healthcheck.Interval),
			timeoutSeconds: secondsFromNanoseconds(healthcheck.Timeout),
			retries: numberValue(healthcheck.Retries),
			startPeriodSeconds: secondsFromNanoseconds(healthcheck.StartPeriod)
		} : undefined,
		mode,
		desiredTasks,
		runningTasks,
		completedTasks,
		healthState,
		labels,
		stackName: labels['com.docker.stack.namespace'],
		constraints: Array.isArray(placement.Constraints)
			? placement.Constraints.filter((item: unknown): item is string => typeof item === 'string')
			: [],
		preferences: Array.isArray(placement.Preferences) ? placement.Preferences : [],
		mounts: (Array.isArray(containerSpec.Mounts) ? containerSpec.Mounts : []).flatMap((value: unknown) => {
			const mount = isRecord(value) ? value : {};
			const type = stringValue(mount.Type);
			const target = stringValue(mount.Target);
			if (!target || !['bind', 'volume', 'tmpfs', 'npipe', 'cluster'].includes(type ?? '')) return [];
			return [{
				type: type as SwarmServiceMount['type'],
				source: stringValue(mount.Source),
				target,
				readOnly: mount.ReadOnly === true
			}];
		}),
		networks: (Array.isArray(taskTemplate.Networks) ? taskTemplate.Networks : []).flatMap((value: unknown) => {
			const network = isRecord(value) ? value : {};
			const target = stringValue(network.Target);
			if (!target) return [];
			return [{
				target,
				aliases: stringArray(network.Aliases),
				driverOpts: stringRecord(network.DriverOpts)
			}];
		}),
		configs: mapServiceResourceReferences(containerSpec, 'config'),
		secrets: mapServiceResourceReferences(containerSpec, 'secret'),
		ports: (Array.isArray(endpointSpec.Ports) ? endpointSpec.Ports : Array.isArray(endpoint.Ports) ? endpoint.Ports : []).flatMap((port: unknown) => {
			const item = isRecord(port) ? port : {};
			const targetPort = numberValue(item.TargetPort);
			if (!targetPort) return [];
			return [{
				name: stringValue(item.Name),
				protocol: ['udp', 'sctp'].includes(stringValue(item.Protocol) ?? '')
					? stringValue(item.Protocol) as 'udp' | 'sctp'
					: 'tcp',
				targetPort,
				publishedPort: numberValue(item.PublishedPort),
				publishMode: stringValue(item.PublishMode) === 'host' ? 'host' : 'ingress'
			}];
		}),
		resources: {
			limits: {
				cores: numberValue(limits.NanoCPUs) === undefined ? undefined : (numberValue(limits.NanoCPUs) ?? 0) / 1_000_000_000,
				memoryMb: numberValue(limits.MemoryBytes) === undefined ? undefined : (numberValue(limits.MemoryBytes) ?? 0) / 1024 / 1024
			},
			reservations: {
				cores: numberValue(reservations.NanoCPUs) === undefined ? undefined : (numberValue(reservations.NanoCPUs) ?? 0) / 1_000_000_000,
				memoryMb: numberValue(reservations.MemoryBytes) === undefined ? undefined : (numberValue(reservations.MemoryBytes) ?? 0) / 1024 / 1024
			}
		},
		restartPolicy: restartPolicy ? {
			condition: ['none', 'on-failure'].includes(stringValue(restartPolicy.Condition) ?? '')
				? stringValue(restartPolicy.Condition) as 'none' | 'on-failure'
				: 'any',
			delaySeconds: secondsFromNanoseconds(restartPolicy.Delay),
			maxAttempts: numberValue(restartPolicy.MaxAttempts),
			windowSeconds: secondsFromNanoseconds(restartPolicy.Window)
		} : undefined,
		updatePolicy: mapServicePolicy(spec.UpdateConfig),
		rollbackPolicy: mapServicePolicy(spec.RollbackConfig),
		stopGracePeriodSeconds: secondsFromNanoseconds(containerSpec.StopGracePeriod),
		endpointMode: stringValue(endpointSpec.Mode) === 'dnsrr' ? 'dnsrr' : 'vip',
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
			serviceName: stringValue(spec.Name) ?? serviceId,
			stackName: stringRecord(spec.Labels)['com.docker.stack.namespace']
		});
	}

	return usage.sort((a, b) => a.serviceName.localeCompare(b.serviceName));
}

function decodeConfigData(value: unknown): string | undefined {
	if (typeof value !== 'string') return undefined;
	try {
		const binary = atob(value);
		const bytes = Uint8Array.from(binary, (character) => character.charCodeAt(0));
		return new TextDecoder().decode(bytes);
	} catch {
		return undefined;
	}
}

function mapSwarmResource(
	value: unknown,
	serviceValues: unknown[],
	kind: 'config' | 'secret'
): SwarmConfigSummary | SwarmSecretSummary {
	const resource = isRecord(value) ? value : {};
	const spec = isRecord(resource.Spec) ? resource.Spec : {};
	const id = stringValue(resource.ID) ?? '';
	const services = mapSwarmResourceUsage(serviceValues, id, kind);
	const base = {
		id,
		version: versionIndex(resource.Version),
		name: stringValue(spec.Name) ?? id,
		labels: stringRecord(spec.Labels),
		createdAt: stringValue(resource.CreatedAt),
		updatedAt: stringValue(resource.UpdatedAt),
		services,
		stackNames: [...new Set(services.flatMap((usage) => usage.stackName ? [usage.stackName] : []))].sort()
	};

	if (kind === 'config') return { ...base, data: decodeConfigData(spec.Data) };
	// Secrets intentionally use an explicit allowlist. Never copy, decode, or retain Spec.Data.
	return base;
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
				: stackServices.reduce((total, service) => total + (service.desiredTasks ?? 0), 0),
			managed: false
		}))
		.sort((a, b) => a.name.localeCompare(b.name));
}

export async function markManagedSwarmStacks(
	stacks: SwarmStackSummary[],
	hasStoredFile: (name: string) => Promise<boolean>
): Promise<SwarmStackSummary[]> {
	return Promise.all(stacks.map(async (stack) => ({
		...stack,
		managed: await hasStoredFile(stack.name)
	})));
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
			secrets: [],
			networks: []
		};
	}

	const [clusterValue, nodeValues, serviceValues, taskValues, configValues, secretValues, networkValues] = await Promise.all([
		request('/swarm'),
		request('/nodes'),
		request('/services?status=true'),
		request('/tasks'),
		request('/configs'),
		request('/secrets'),
		request('/networks')
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
			: [],
		networks: Array.isArray(networkValues)
			? networkValues.map(mapSwarmNetwork).filter((network) => network.scope === 'swarm' && !network.ingress)
			: []
	};
}
