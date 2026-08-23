import type { SwarmCapability } from '$lib/types/swarm';

export type SwarmServiceAction =
	| { type: 'scale'; replicas: number }
	| { type: 'force-update' }
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

function prepareServiceSpec(value: unknown, action: SwarmServiceAction): Record<string, any> {
	const spec = serviceSpec(value);
	const mode = isRecord(spec.Mode) ? spec.Mode : {};

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
