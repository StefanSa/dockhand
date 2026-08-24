import { json } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import { authorize } from '$lib/server/authorize';
import { getEnvironment } from '$lib/server/db';
import { validateDockerIdParam } from '$lib/server/docker-validation';
import { requireSwarmUpdateAccess } from '$lib/server/swarm-access';
import { updateSwarmService } from '$lib/server/swarm';
import { SwarmServiceActionError, type SwarmServiceAction } from '$lib/server/swarm-service';

/**
 * @openapi
 * summary: Scale, restart, or replace a Config reference on an existing Swarm service
 * path: id:string! Swarm service ID (from GET /api/swarm)
 * query: env:integer! Manager environment ID (from GET /api/environments)
 * body: {action:string!, replicas:integer, sourceConfigId:string, replacementConfigId:string, replacementConfigName:string}
 * body-example: {"action":"scale","replicas":3}
 * resp-200: {success:boolean!, action:string!, version:integer!, warnings:array<string>!}
 * resp-400: Invalid action, replica count, service ID, or unsupported service mode
 * resp-403: Permission denied, or no access to this environment
 * resp-404: Environment or service not found
 * resp-409: The environment is not a Swarm manager, the service changed concurrently, or the service is stack-managed
 * resp-502: The Docker endpoint rejected or failed the service update
 */
export const POST: RequestHandler = async ({ params, request, url, cookies }) => {
	const invalid = validateDockerIdParam(params.id, 'service');
	if (invalid) return invalid;

	const environmentId = Number(url.searchParams.get('env'));
	if (!Number.isInteger(environmentId) || environmentId <= 0) {
		return json({ error: 'A valid environment ID is required' }, { status: 400 });
	}

	const auth = await authorize(cookies);
	const denied = await requireSwarmUpdateAccess(auth, environmentId);
	if (denied) return json({ error: 'Permission or environment access denied' }, { status: 403 });

	if (!await getEnvironment(environmentId)) {
		return json({ error: 'Environment not found' }, { status: 404 });
	}

	const body = await request.json().catch(() => null);
	let action: SwarmServiceAction;
	if (body?.action === 'scale') {
		if (!Number.isSafeInteger(body.replicas) || body.replicas < 0) {
			return json({ error: 'Replicas must be a non-negative integer' }, { status: 400 });
		}
		action = { type: 'scale', replicas: body.replicas };
	} else if (body?.action === 'force-update') {
		action = { type: 'force-update' };
	} else if (body?.action === 'replace-config') {
		const invalidSource = validateDockerIdParam(body.sourceConfigId, 'source Config');
		if (invalidSource) return invalidSource;
		const invalidReplacement = validateDockerIdParam(body.replacementConfigId, 'replacement Config');
		if (invalidReplacement) return invalidReplacement;
		if (typeof body.replacementConfigName !== 'string' || !body.replacementConfigName.trim()) {
			return json({ error: 'A replacement Config name is required' }, { status: 400 });
		}
		action = {
			type: 'replace-config',
			sourceConfigId: body.sourceConfigId,
			replacementConfigId: body.replacementConfigId,
			replacementConfigName: body.replacementConfigName
		};
	} else {
		return json({ error: 'Action must be scale, force-update, or replace-config' }, { status: 400 });
	}

	try {
		const result = await updateSwarmService(environmentId, params.id, action);
		return json({ success: true, ...result });
	} catch (error: any) {
		if (error instanceof SwarmServiceActionError) {
			return json({ error: error.message }, { status: error.statusCode });
		}
		if (error?.statusCode === 404) {
			return json({ error: 'Swarm service not found' }, { status: 404 });
		}
		if (error?.statusCode === 409) {
			return json({ error: 'The service changed concurrently; refresh and try again' }, { status: 409 });
		}
		console.error('Failed to update Swarm service:', error?.message || error);
		return json({ error: 'Failed to update Swarm service' }, { status: 502 });
	}
};
