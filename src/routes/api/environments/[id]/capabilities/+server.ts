import { json } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import { authorize } from '$lib/server/authorize';
import { getEnvironment } from '$lib/server/db';
import { getSwarmCapability } from '$lib/server/swarm';

/**
 * @openapi
 * summary: Detect Docker and Swarm capabilities for an environment
 * path: id:integer! Environment id (from GET /api/environments)
 * query: refresh:boolean Bypass the short-lived capability cache
 * resp-200: {kind:string!, localNodeState:string, controlAvailable:boolean, nodeId:string, clusterId:string, apiVersion:string}
 * resp-400: Invalid environment ID
 * resp-403: Permission denied, or no access to this environment
 * resp-404: Environment not found
 */
export const GET: RequestHandler = async ({ params, url, cookies }) => {
	const environmentId = Number(params.id);
	if (!Number.isInteger(environmentId) || environmentId <= 0) {
		return json({ error: 'Invalid environment ID' }, { status: 400 });
	}

	const auth = await authorize(cookies);
	if (auth.authEnabled
		&& !await auth.can('environments', 'view', environmentId)
		&& !await auth.can('swarm', 'view', environmentId)) {
		return json({ error: 'Permission denied' }, { status: 403 });
	}
	const accessDenied = await auth.requireEnvAccess(environmentId);
	if (accessDenied) return accessDenied;

	if (!await getEnvironment(environmentId)) {
		return json({ error: 'Environment not found' }, { status: 404 });
	}

	const capability = await getSwarmCapability(
		environmentId,
		url.searchParams.get('refresh') === 'true'
	);
	return json(capability);
};
