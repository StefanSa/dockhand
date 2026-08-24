import type { SwarmCapability } from '$lib/types/swarm';
import type {
	SwarmServiceMount,
	SwarmServiceNetworkAttachment,
	SwarmServicePort,
	SwarmServiceResourceReference,
	SwarmServiceResources,
	SwarmServiceRestartPolicy,
	SwarmServiceUpdateInput,
	SwarmServiceUpdatePolicy
} from '$lib/types/swarm';

export type SwarmServiceAction =
	| { type: 'scale'; replicas: number }
	| { type: 'force-update' }
	| { type: 'update'; spec: SwarmServiceUpdateInput }
	| {
		type: 'replace-config';
		sourceConfigId: string;
		replacementConfigId: string;
		replacementConfigName: string;
	};

export interface SwarmServiceActionResult {
	action: SwarmServiceAction['type'];
	version: number;
	warnings: string[];
}

type SwarmRequest = (path: string, options?: RequestInit) => Promise<unknown>;

export class SwarmServiceActionError extends Error {
	constructor(message: string, public statusCode: number) {
		super(message);
		this.name = 'SwarmServiceActionError';
	}
}

function isRecord(value: unknown): value is Record<string, any> {
	return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function invalid(message: string): never {
	throw new SwarmServiceActionError(message, 400);
}

function finiteNumber(value: unknown, label: string, minimum = 0): number | undefined {
	if (value === undefined || value === null || value === '') return undefined;
	if (typeof value !== 'number' || !Number.isFinite(value) || value < minimum) invalid(`${label} must be at least ${minimum}`);
	return value;
}

function integer(value: unknown, label: string, minimum = 0, maximum = Number.MAX_SAFE_INTEGER): number {
	if (!Number.isSafeInteger(value) || (value as number) < minimum || (value as number) > maximum) {
		invalid(`${label} must be an integer between ${minimum} and ${maximum}`);
	}
	return value as number;
}

function strings(value: unknown, label: string, allowEmpty = false): string[] {
	if (!Array.isArray(value) || value.length > 500) invalid(`${label} must be an array with at most 500 entries`);
	return value.map((item, index) => {
		if (typeof item !== 'string' || (!allowEmpty && !item.trim())) invalid(`${label} entry ${index + 1} is invalid`);
		return item;
	});
}

function stringMap(value: unknown, label: string): Record<string, string> {
	if (!isRecord(value) || Object.keys(value).length > 100) invalid(`${label} must be an object with at most 100 entries`);
	for (const [key, item] of Object.entries(value)) {
		if (!key.trim() || typeof item !== 'string') invalid(`${label} contains an invalid entry`);
	}
	return value as Record<string, string>;
}

function parsePorts(value: unknown): SwarmServicePort[] {
	if (!Array.isArray(value) || value.length > 100) invalid('Ports must be an array with at most 100 entries');
	return value.map((raw, index) => {
		if (!isRecord(raw)) invalid(`Port ${index + 1} is invalid`);
		const protocol = raw.protocol ?? 'tcp';
		const publishMode = raw.publishMode ?? 'ingress';
		if (!['tcp', 'udp', 'sctp'].includes(protocol)) invalid(`Port ${index + 1} has an invalid protocol`);
		if (!['ingress', 'host'].includes(publishMode)) invalid(`Port ${index + 1} has an invalid publish mode`);
		return {
			name: typeof raw.name === 'string' && raw.name.trim() ? raw.name.trim() : undefined,
			protocol,
			targetPort: integer(raw.targetPort, `Port ${index + 1} target`, 1, 65535),
			publishedPort: raw.publishedPort === undefined || raw.publishedPort === null || raw.publishedPort === ''
				? undefined
				: integer(raw.publishedPort, `Port ${index + 1} published value`, 1, 65535),
			publishMode
		} as SwarmServicePort;
	});
}

function parseMounts(value: unknown): SwarmServiceMount[] {
	if (!Array.isArray(value) || value.length > 100) invalid('Mounts must be an array with at most 100 entries');
	return value.map((raw, index) => {
		if (!isRecord(raw) || !['bind', 'volume', 'tmpfs', 'npipe', 'cluster'].includes(raw.type)) {
			invalid(`Mount ${index + 1} has an invalid type`);
		}
		if (typeof raw.target !== 'string' || !raw.target.trim()) invalid(`Mount ${index + 1} requires a target`);
		if (raw.type !== 'tmpfs' && (typeof raw.source !== 'string' || !raw.source.trim())) {
			invalid(`Mount ${index + 1} requires a source`);
		}
		return {
			type: raw.type,
			source: typeof raw.source === 'string' && raw.source.trim() ? raw.source.trim() : undefined,
			target: raw.target.trim(),
			readOnly: raw.readOnly === true
		} as SwarmServiceMount;
	});
}

function parseNetworks(value: unknown): SwarmServiceNetworkAttachment[] {
	if (!Array.isArray(value) || value.length > 100) invalid('Networks must be an array with at most 100 entries');
	const result = value.map((raw, index) => {
		if (!isRecord(raw) || typeof raw.target !== 'string' || !raw.target.trim()) invalid(`Network ${index + 1} requires a target`);
		return {
			target: raw.target.trim(),
			aliases: strings(raw.aliases ?? [], `Network ${index + 1} aliases`),
			driverOpts: stringMap(raw.driverOpts ?? {}, `Network ${index + 1} driver options`)
		};
	});
	if (new Set(result.map((network) => network.target)).size !== result.length) invalid('A network can only be attached once');
	return result;
}

function parseResourceReferences(value: unknown, kind: 'Config' | 'Secret'): SwarmServiceResourceReference[] {
	if (!Array.isArray(value) || value.length > 100) invalid(`${kind}s must be an array with at most 100 entries`);
	const result = value.map((raw, index) => {
		if (!isRecord(raw) || typeof raw.id !== 'string' || !raw.id.trim() || typeof raw.name !== 'string' || !raw.name.trim()) {
			invalid(`${kind} ${index + 1} requires an ID and name`);
		}
		return {
			id: raw.id.trim(),
			name: raw.name.trim(),
			target: typeof raw.target === 'string' && raw.target.trim() ? raw.target.trim() : undefined,
			uid: typeof raw.uid === 'string' && raw.uid.trim() ? raw.uid.trim() : undefined,
			gid: typeof raw.gid === 'string' && raw.gid.trim() ? raw.gid.trim() : undefined,
			mode: raw.mode === undefined || raw.mode === null || raw.mode === ''
				? undefined
				: integer(raw.mode, `${kind} ${index + 1} mode`, 0, 511)
		};
	});
	if (new Set(result.map((reference) => reference.id)).size !== result.length) invalid(`A ${kind} can only be attached once`);
	return result;
}

function parseResources(value: unknown): SwarmServiceResources {
	if (!isRecord(value)) invalid('Resources are invalid');
	const parseLimit = (raw: unknown, label: string) => {
		if (!isRecord(raw)) invalid(`${label} are invalid`);
		return {
			cores: finiteNumber(raw.cores, `${label} CPU`),
			memoryMb: finiteNumber(raw.memoryMb, `${label} memory`)
		};
	};
	return { limits: parseLimit(value.limits ?? {}, 'Resource limits'), reservations: parseLimit(value.reservations ?? {}, 'Resource reservations') };
}

function parseRestartPolicy(value: unknown): SwarmServiceRestartPolicy | undefined {
	if (value === undefined || value === null) return undefined;
	if (!isRecord(value) || !['none', 'on-failure', 'any'].includes(value.condition)) invalid('Restart policy is invalid');
	return {
		condition: value.condition,
		delaySeconds: finiteNumber(value.delaySeconds, 'Restart delay'),
		maxAttempts: value.maxAttempts === undefined || value.maxAttempts === null || value.maxAttempts === ''
			? undefined
			: integer(value.maxAttempts, 'Restart max attempts'),
		windowSeconds: finiteNumber(value.windowSeconds, 'Restart window')
	};
}

function parseUpdatePolicy(value: unknown, label: string): SwarmServiceUpdatePolicy | undefined {
	if (value === undefined || value === null) return undefined;
	if (!isRecord(value) || !['continue', 'pause', 'rollback'].includes(value.failureAction) || !['stop-first', 'start-first'].includes(value.order)) {
		invalid(`${label} is invalid`);
	}
	const maxFailureRatio = finiteNumber(value.maxFailureRatio, `${label} max failure ratio`) ?? 0;
	if (maxFailureRatio > 1) invalid(`${label} max failure ratio cannot exceed 1`);
	return {
		parallelism: integer(value.parallelism, `${label} parallelism`),
		delaySeconds: finiteNumber(value.delaySeconds, `${label} delay`) ?? 0,
		failureAction: value.failureAction,
		monitorSeconds: finiteNumber(value.monitorSeconds, `${label} monitor`) ?? 0,
		maxFailureRatio,
		order: value.order
	};
}

export function parseSwarmServiceUpdateInput(value: unknown): SwarmServiceUpdateInput {
	if (!isRecord(value)) invalid('Service specification is required');
	if (typeof value.image !== 'string' || !value.image.trim()) invalid('Image is required');
	const replicas = value.replicas === null ? null : integer(value.replicas, 'Replicas');
	const environment = strings(value.environment, 'Environment');
	for (const entry of environment) {
		if (!/^[A-Za-z_][A-Za-z0-9_]*=/.test(entry)) invalid(`Environment entry "${entry}" must use KEY=VALUE syntax`);
	}
	const endpointMode = value.endpointMode ?? 'vip';
	if (!['vip', 'dnsrr'].includes(endpointMode)) invalid('Endpoint mode is invalid');
	return {
		image: value.image.trim(),
		replicas,
		command: strings(value.command, 'Command', true),
		args: strings(value.args, 'Arguments', true),
		environment,
		ports: parsePorts(value.ports),
		mounts: parseMounts(value.mounts),
		networks: parseNetworks(value.networks),
		configs: parseResourceReferences(value.configs, 'Config'),
		secrets: parseResourceReferences(value.secrets, 'Secret'),
		constraints: strings(value.constraints, 'Placement constraints'),
		resources: parseResources(value.resources),
		restartPolicy: parseRestartPolicy(value.restartPolicy),
		updatePolicy: parseUpdatePolicy(value.updatePolicy, 'Update policy'),
		rollbackPolicy: parseUpdatePolicy(value.rollbackPolicy, 'Rollback policy'),
		stopGracePeriodSeconds: finiteNumber(value.stopGracePeriodSeconds, 'Stop grace period'),
		endpointMode
	};
}

function serviceVersion(value: unknown): number {
	if (!isRecord(value) || !isRecord(value.Version) || !Number.isSafeInteger(value.Version.Index)) {
		throw new SwarmServiceActionError('Docker returned an invalid service version', 502);
	}
	return value.Version.Index;
}

function serviceSpec(value: unknown): Record<string, any> {
	if (!isRecord(value) || !isRecord(value.Spec)) {
		throw new SwarmServiceActionError('Docker returned an invalid service specification', 502);
	}
	return value.Spec;
}

function nanoseconds(seconds: number | undefined): number | undefined {
	return seconds === undefined ? undefined : Math.round(seconds * 1_000_000_000);
}

function dockerResourceReference(reference: SwarmServiceResourceReference, kind: 'Config' | 'Secret'): Record<string, unknown> {
	return {
		[`${kind}ID`]: reference.id,
		[`${kind}Name`]: reference.name,
		File: {
			Name: reference.target ?? reference.name,
			UID: reference.uid ?? '0',
			GID: reference.gid ?? '0',
			Mode: reference.mode ?? 292
		}
	};
}

function dockerUpdatePolicy(policy: SwarmServiceUpdatePolicy | undefined): Record<string, unknown> | undefined {
	return policy ? {
		Parallelism: policy.parallelism,
		Delay: nanoseconds(policy.delaySeconds),
		FailureAction: policy.failureAction,
		Monitor: nanoseconds(policy.monitorSeconds),
		MaxFailureRatio: policy.maxFailureRatio,
		Order: policy.order
	} : undefined;
}

function prepareEditedServiceSpec(spec: Record<string, any>, input: SwarmServiceUpdateInput): Record<string, any> {
	const mode = isRecord(spec.Mode) ? spec.Mode : {};
	if (isRecord(mode.Replicated)) {
		if (input.replicas === null) throw new SwarmServiceActionError('Replicated services require a replica count', 400);
	} else if (isRecord(mode.Global)) {
		if (input.replicas !== null) throw new SwarmServiceActionError('Global services do not accept a replica count', 400);
	} else {
		throw new SwarmServiceActionError('Service editing is supported for replicated and global services only', 400);
	}

	const taskTemplate = isRecord(spec.TaskTemplate) ? spec.TaskTemplate : {};
	const containerSpec = isRecord(taskTemplate.ContainerSpec) ? taskTemplate.ContainerSpec : {};
	const placement = isRecord(taskTemplate.Placement) ? taskTemplate.Placement : {};
	const resources = isRecord(taskTemplate.Resources) ? taskTemplate.Resources : {};
	const existingMounts = Array.isArray(containerSpec.Mounts) ? containerSpec.Mounts : [];
	const existingNetworks = Array.isArray(taskTemplate.Networks) ? taskTemplate.Networks : [];
	const endpointSpec = isRecord(spec.EndpointSpec) ? spec.EndpointSpec : {};

	const nextMounts = input.mounts.map((mount) => {
		const existing = existingMounts.find((candidate) => isRecord(candidate)
			&& candidate.Type === mount.type
			&& candidate.Source === mount.source
			&& candidate.Target === mount.target);
		return {
			...(isRecord(existing) ? existing : {}),
			Type: mount.type,
			Source: mount.source,
			Target: mount.target,
			ReadOnly: mount.readOnly
		};
	});
	const nextNetworks = input.networks.map((network) => {
		const existing = existingNetworks.find((candidate) => isRecord(candidate) && candidate.Target === network.target);
		return {
			...(isRecord(existing) ? existing : {}),
			Target: network.target,
			Aliases: network.aliases,
			DriverOpts: network.driverOpts
		};
	});
	const nextResources = {
		...resources,
		Limits: {
			...(isRecord(resources.Limits) ? resources.Limits : {}),
			NanoCPUs: input.resources.limits.cores === undefined ? 0 : Math.round(input.resources.limits.cores * 1_000_000_000),
			MemoryBytes: input.resources.limits.memoryMb === undefined ? 0 : Math.round(input.resources.limits.memoryMb * 1024 * 1024)
		},
		Reservations: {
			...(isRecord(resources.Reservations) ? resources.Reservations : {}),
			NanoCPUs: input.resources.reservations.cores === undefined ? 0 : Math.round(input.resources.reservations.cores * 1_000_000_000),
			MemoryBytes: input.resources.reservations.memoryMb === undefined ? 0 : Math.round(input.resources.reservations.memoryMb * 1024 * 1024)
		}
	};
	const restartPolicy = input.restartPolicy ? {
		Condition: input.restartPolicy.condition,
		Delay: nanoseconds(input.restartPolicy.delaySeconds),
		MaxAttempts: input.restartPolicy.maxAttempts,
		Window: nanoseconds(input.restartPolicy.windowSeconds)
	} : undefined;

	return {
		...spec,
		TaskTemplate: {
			...taskTemplate,
			ContainerSpec: {
				...containerSpec,
				Image: input.image,
				Command: input.command,
				Args: input.args,
				Env: input.environment,
				Mounts: nextMounts,
				Configs: input.configs.map((reference) => dockerResourceReference(reference, 'Config')),
				Secrets: input.secrets.map((reference) => dockerResourceReference(reference, 'Secret')),
				StopGracePeriod: nanoseconds(input.stopGracePeriodSeconds)
			},
			Networks: nextNetworks,
			Placement: { ...placement, Constraints: input.constraints },
			Resources: nextResources,
			RestartPolicy: restartPolicy
		},
		Mode: isRecord(mode.Replicated)
			? { ...mode, Replicated: { ...mode.Replicated, Replicas: input.replicas } }
			: mode,
		EndpointSpec: {
			...endpointSpec,
			Mode: input.endpointMode,
			Ports: input.ports.map((port) => ({
				Name: port.name,
				Protocol: port.protocol,
				TargetPort: port.targetPort,
				PublishedPort: port.publishedPort,
				PublishMode: port.publishMode
			}))
		},
		UpdateConfig: dockerUpdatePolicy(input.updatePolicy),
		RollbackConfig: dockerUpdatePolicy(input.rollbackPolicy)
	};
}

function prepareServiceSpec(value: unknown, action: SwarmServiceAction): Record<string, any> {
	const spec = serviceSpec(value);
	const mode = isRecord(spec.Mode) ? spec.Mode : {};
	const labels = isRecord(spec.Labels) ? spec.Labels : {};
	const stackName = typeof labels['com.docker.stack.namespace'] === 'string'
		? labels['com.docker.stack.namespace'].trim()
		: '';
	if (stackName) {
		throw new SwarmServiceActionError(
			`Service is managed by Swarm stack "${stackName}". Update the stored stack definition and redeploy it instead of changing the live service.`,
			409
		);
	}

	if (action.type === 'update') return prepareEditedServiceSpec(spec, action.spec);

	if (action.type === 'replace-config') {
		if (!action.sourceConfigId || !action.replacementConfigId || !action.replacementConfigName.trim()) {
			throw new SwarmServiceActionError('Source and replacement Config metadata are required', 400);
		}
		if (action.sourceConfigId === action.replacementConfigId) {
			throw new SwarmServiceActionError('Replacement Config must differ from the current Config', 400);
		}
		const taskTemplate = isRecord(spec.TaskTemplate) ? spec.TaskTemplate : null;
		const containerSpec = taskTemplate && isRecord(taskTemplate.ContainerSpec)
			? taskTemplate.ContainerSpec
			: null;
		const configs = containerSpec && Array.isArray(containerSpec.Configs)
			? containerSpec.Configs
			: [];
		if (configs.some((config) => isRecord(config) && config.ConfigID === action.replacementConfigId)) {
			throw new SwarmServiceActionError('Service already references the replacement Config', 409);
		}
		let replacements = 0;
		const nextConfigs = configs.map((config) => {
			if (!isRecord(config) || config.ConfigID !== action.sourceConfigId) return config;
			replacements++;
			return {
				...config,
				ConfigID: action.replacementConfigId,
				ConfigName: action.replacementConfigName.trim()
			};
		});
		if (replacements === 0) {
			throw new SwarmServiceActionError('Service no longer references the source Config', 409);
		}
		return {
			...spec,
			TaskTemplate: {
				...taskTemplate,
				ContainerSpec: { ...containerSpec, Configs: nextConfigs }
			}
		};
	}

	if (action.type === 'scale') {
		if (!Number.isSafeInteger(action.replicas) || action.replicas < 0) {
			throw new SwarmServiceActionError('Replicas must be a non-negative integer', 400);
		}
		if (!isRecord(mode.Replicated)) {
			throw new SwarmServiceActionError('Only replicated services can be scaled', 400);
		}
		return {
			...spec,
			Mode: {
				...mode,
				Replicated: { ...mode.Replicated, Replicas: action.replicas }
			}
		};
	}

	if (isRecord(mode.ReplicatedJob) || isRecord(mode.GlobalJob)) {
		throw new SwarmServiceActionError('Force-update is not supported for job services', 400);
	}
	if (!isRecord(mode.Replicated) && !isRecord(mode.Global)) {
		throw new SwarmServiceActionError('Unsupported Swarm service mode', 400);
	}

	const taskTemplate = isRecord(spec.TaskTemplate) ? spec.TaskTemplate : {};
	const currentForceUpdate = Number.isSafeInteger(taskTemplate.ForceUpdate)
		? taskTemplate.ForceUpdate
		: 0;
	if (currentForceUpdate >= Number.MAX_SAFE_INTEGER) {
		throw new SwarmServiceActionError('Service force-update counter cannot be incremented safely', 409);
	}
	return {
		...spec,
		TaskTemplate: { ...taskTemplate, ForceUpdate: currentForceUpdate + 1 }
	};
}

export async function performSwarmServiceAction(
	capability: SwarmCapability,
	serviceId: string,
	action: SwarmServiceAction,
	request: SwarmRequest
): Promise<SwarmServiceActionResult> {
	if (capability.kind !== 'swarm-manager' || capability.controlAvailable !== true) {
		throw new SwarmServiceActionError('Swarm service actions require a manager endpoint', 409);
	}

	const encodedId = encodeURIComponent(serviceId);
	const service = await request(`/services/${encodedId}`);
	const version = serviceVersion(service);
	const spec = prepareServiceSpec(service, action);
	const response = await request(`/services/${encodedId}/update?version=${version}`, {
		method: 'POST',
		body: JSON.stringify(spec)
	});
	const warnings = isRecord(response) && Array.isArray(response.Warnings)
		? response.Warnings.filter((warning: unknown): warning is string => typeof warning === 'string')
		: [];

	return { action: action.type, version, warnings };
}
