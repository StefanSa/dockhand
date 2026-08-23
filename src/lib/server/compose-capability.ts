import { json } from '@sveltejs/kit';
import type { SwarmCapability, SwarmCapabilityKind } from '$lib/types/swarm';

export const COMPOSE_CAPABILITY_CONFLICT_CODE = 'compose_stack_capability_conflict';

type CapabilityDetector = (environmentId: number | null | undefined, refresh: boolean) => Promise<SwarmCapability>;

const detectCurrentCapability: CapabilityDetector = async (environmentId, refresh) => {
	const { getSwarmCapability } = await import('./swarm');
	return getSwarmCapability(environmentId, refresh);
};

export class ComposeCapabilityConflictError extends Error {
	readonly statusCode = 409;

	constructor(
		message: string,
		readonly capabilityKind: SwarmCapabilityKind
	) {
		super(message);
		this.name = 'ComposeCapabilityConflictError';
	}
}

export function assertComposeMutationCapability(capability: SwarmCapability): void {
	if (capability.kind === 'standalone') return;

	if (capability.kind === 'swarm-manager') {
		throw new ComposeCapabilityConflictError(
			'Compose stack mutations are unavailable on a Swarm manager. Use Swarm Stacks instead.',
			capability.kind
		);
	}

	if (capability.kind === 'swarm-worker') {
		throw new ComposeCapabilityConflictError(
			'Stack mutations are unavailable on a Swarm worker. Connect to a Swarm manager for Swarm Stack management.',
			capability.kind
		);
	}

	throw new ComposeCapabilityConflictError(
		'Compose stack mutations are unavailable until the current Docker capability can be confirmed as standalone.',
		capability.kind
	);
}

/**
 * Authoritative backend gate for normal Compose stack mutations.
 * The refresh flag is deliberately always true so a recent environment role
 * change cannot reuse the short-lived navigation/read-model cache.
 */
export async function requireComposeMutationCapability(
	environmentId: number | null | undefined,
	detectCapability: CapabilityDetector = detectCurrentCapability
): Promise<SwarmCapability> {
	if (environmentId != null && (!Number.isInteger(environmentId) || environmentId <= 0)) {
		throw new Error('A valid environment ID is required for Compose stack mutations');
	}

	const capability = await detectCapability(environmentId, true);
	assertComposeMutationCapability(capability);
	return capability;
}

/**
 * Route helper used after the existing stacks:* RBAC/environment checks and
 * before parsing or writing any Compose stack payload.
 */
export async function composeMutationGuardResponse(
	environmentId: number | null | undefined
): Promise<Response | null> {
	if (environmentId != null && (!Number.isInteger(environmentId) || environmentId <= 0)) {
		return json({ error: 'Environment ID must be a positive integer' }, { status: 400 });
	}

	try {
		await requireComposeMutationCapability(environmentId);
		return null;
	} catch (error) {
		if (!(error instanceof ComposeCapabilityConflictError)) throw error;
		return json(
			{
				error: error.message,
				code: COMPOSE_CAPABILITY_CONFLICT_CODE,
				capability: error.capabilityKind
			},
			{ status: error.statusCode }
		);
	}
}
