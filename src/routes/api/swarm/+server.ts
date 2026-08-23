import { json } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import { authorize } from '$lib/server/authorize';
import { getEnvironment } from '$lib/server/db';
import { getSwarmReadModel } from '$lib/server/swarm';
import { requireSwarmReadAccess } from '$lib/server/swarm-access';

/**
 * @openapi
 * summary: Get a read-only Swarm overview including config and secret metadata
 * query: env:integer! Environment id (from GET /api/environments)
 * query: refresh:boolean Refresh the environment capability before reading Swarm data
 * resp-200: {capability:{}, managerEndpointRequired:boolean!, cluster:{}, nodes:array, services:array, tasks:array, stacks:array, configs:array, secrets:array}
 * resp-400: A valid environment ID is required
 * resp-403: Permission denied, or no access to this environment
 * resp-404: Environment not found
 * resp-502: The Docker endpoint rejected or failed a Swarm API request
 */
export const GET: RequestHandler = async ({ url, cookies }) => {
	const environmentId = Number(url.searchParams.get('env'));
	if (!Number.isInteger(environmentId) || environmentId <= 0) {
		return json({ error: 'A valid environment ID is required' }, { status: 400 });
	}

	const auth = await authorize(cookies);
	const denied = await requireSwarmReadAccess(auth, environmentId);
	if (denied) return json({ error: 'Permission or environment access denied' }, { status: 403 });

	if (!await getEnvironment(environmentId)) {
		return json({ error: 'Environment not found' }, { status: 404 });
	}

	try {
		return json(await getSwarmReadModel(
			environmentId,
			url.searchParams.get('refresh') === 'true'
		));
	} catch (error: any) {
		if (error?.statusCode === 403) {
			return json({ error: 'The Docker endpoint denied access to Swarm resources' }, { status: 502 });
		}
		if (error?.statusCode === 503) {
			return json({ error: 'The Docker endpoint is not currently a Swarm manager' }, { status: 502 });
		}
		console.error('Failed to read Swarm resources:', error?.message || error);
		return json({ error: 'Failed to read Swarm resources' }, { status: 502 });
	}
};
