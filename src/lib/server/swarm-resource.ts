import type { SwarmCapability } from '$lib/types/swarm';

export type SwarmResourceKind = 'config' | 'secret';

export interface SwarmResourceCreateResult {
	id: string;
	name: string;
}

export interface SwarmResourceDeleteResult {
	id: string;
	name?: string;
}

export class SwarmResourceActionError extends Error {
	constructor(message: string, public statusCode: number) {
		super(message);
		this.name = 'SwarmResourceActionError';
	}
}

type SwarmResourceRequest = (path: string, options?: RequestInit) => Promise<unknown>;

function isRecord(value: unknown): value is Record<string, unknown> {
	return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function resourceLabel(kind: SwarmResourceKind): string {
	return kind === 'config' ? 'Config' : 'Secret';
}

function resourcePath(kind: SwarmResourceKind): string {
	return kind === 'config' ? 'configs' : 'secrets';
}

function assertManager(capability: SwarmCapability): void {
	if (capability.kind !== 'swarm-manager' || capability.controlAvailable !== true) {
		throw new SwarmResourceActionError('Swarm Config and Secret mutations require a manager endpoint', 409);
	}
}

function validateName(name: unknown): string {
	if (typeof name !== 'string') throw new SwarmResourceActionError('Name is required', 400);
	const normalized = name.trim();
	if (!normalized) throw new SwarmResourceActionError('Name is required', 400);
	if (normalized.length > 255 || /[\0\r\n]/.test(normalized)) {
		throw new SwarmResourceActionError('Name must be at most 255 characters and contain no line breaks', 400);
	}
	return normalized;
}

export function findSwarmResourceUsage(
	serviceValues: unknown,
	kind: SwarmResourceKind,
	resourceId: string
): string[] {
	if (!Array.isArray(serviceValues)) return [];
	const listKey = kind === 'config' ? 'Configs' : 'Secrets';
	const idKey = kind === 'config' ? 'ConfigID' : 'SecretID';
	const names = new Set<string>();

	for (const value of serviceValues) {
		if (!isRecord(value)) continue;
		const spec = isRecord(value.Spec) ? value.Spec : {};
		const taskTemplate = isRecord(spec.TaskTemplate) ? spec.TaskTemplate : {};
		const containerSpec = isRecord(taskTemplate.ContainerSpec) ? taskTemplate.ContainerSpec : {};
		const references = Array.isArray(containerSpec[listKey]) ? containerSpec[listKey] : [];
		if (!references.some((reference) => isRecord(reference) && reference[idKey] === resourceId)) continue;
		const serviceName = typeof spec.Name === 'string' && spec.Name ? spec.Name : String(value.ID ?? 'unknown service');
		names.add(serviceName);
	}

	return [...names].sort((a, b) => a.localeCompare(b));
}

export async function performSwarmResourceCreate(
	capability: SwarmCapability,
	kind: SwarmResourceKind,
	name: unknown,
	value: unknown,
	request: SwarmResourceRequest
): Promise<SwarmResourceCreateResult> {
	assertManager(capability);
	const normalizedName = validateName(name);
	if (typeof value !== 'string') throw new SwarmResourceActionError('Value is required', 400);

	const response = await request(`/${resourcePath(kind)}/create`, {
		method: 'POST',
		headers: { 'Content-Type': 'application/json' },
		body: JSON.stringify({ Name: normalizedName, Data: Buffer.from(value, 'utf8').toString('base64') })
	});
	const id = isRecord(response) && typeof response.ID === 'string' ? response.ID : '';
	if (!id) throw new SwarmResourceActionError(`Docker did not return a ${resourceLabel(kind)} ID`, 502);
	return { id, name: normalizedName };
}

export async function performSwarmResourceDelete(
	capability: SwarmCapability,
	kind: SwarmResourceKind,
	resourceId: string,
	request: SwarmResourceRequest
): Promise<SwarmResourceDeleteResult> {
	assertManager(capability);
	if (!resourceId) throw new SwarmResourceActionError(`${resourceLabel(kind)} ID is required`, 400);

	const serviceValues = await request('/services');
	const usedBy = findSwarmResourceUsage(serviceValues, kind, resourceId);
	if (usedBy.length > 0) {
		throw new SwarmResourceActionError(
			`${resourceLabel(kind)} is used by ${usedBy.length === 1 ? 'service' : 'services'}: ${usedBy.join(', ')}`,
			409
		);
	}

	await request(`/${resourcePath(kind)}/${encodeURIComponent(resourceId)}`, { method: 'DELETE' });
	return { id: resourceId };
}
