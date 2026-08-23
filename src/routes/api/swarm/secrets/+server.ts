import { json } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import { authorize } from '$lib/server/authorize';
import { getEnvironment } from '$lib/server/db';
import { createSwarmResource, getSwarmResourceList } from '$lib/server/swarm';
import { requireSwarmReadAccess, requireSwarmUpdateAccess } from '$lib/server/swarm-access';
import { SwarmResourceActionError } from '$lib/server/swarm-resource';

/**
 * @openapi
 * summary: List only Swarm secret metadata and service usage on a manager environment
 * query: env:integer! Manager environment ID (from GET /api/environments)
 * query: refresh:boolean Refresh the environment capability before reading secret metadata
 * resp-200: {capability:{}, managerEndpointRequired:boolean!, resources:array}
 * resp-400: A valid environment ID is required
 * resp-403: Permission denied, or no access to this environment
 * resp-404: Environment not found
 * resp-502: Docker rejected or failed the Swarm secret request
 */
export const GET: RequestHandler = async ({ url, cookies }) => {
	const envId = Number(url.searchParams.get('env'));
	if (!Number.isInteger(envId) || envId <= 0) return json({ error: 'A valid environment ID is required' }, { status: 400 });
	const auth = await authorize(cookies);
	const denied = await requireSwarmReadAccess(auth, envId);
	if (denied) return json({ error: 'Permission or environment access denied' }, { status: 403 });
	if (!await getEnvironment(envId)) return json({ error: 'Environment not found' }, { status: 404 });

	try {
		return json(await getSwarmResourceList(envId, 'secret', url.searchParams.get('refresh') === 'true'));
	} catch {
		console.error('Failed to list Swarm secret metadata');
		return json({ error: 'Failed to list Swarm secret metadata' }, { status: 502 });
	}
};

/**
 * @openapi
 * summary: Create an immutable Swarm secret without returning its value
 * query: env:integer! Manager environment ID (from GET /api/environments)
 * body: {name:string!, value:string!}
 * resp-201: {success:boolean!, id:string!, name:string!}
 * resp-400: Invalid environment, name, or value
 * resp-403: Permission denied, or no access to this environment
 * resp-404: Environment not found
 * resp-409: Manager endpoint required, or secret name conflict
 * resp-502: Docker rejected or failed the Swarm secret request
 */
export const POST: RequestHandler = async ({ request, url, cookies }) => {
	const envId = Number(url.searchParams.get('env'));
	if (!Number.isInteger(envId) || envId <= 0) return json({ error: 'A valid environment ID is required' }, { status: 400 });
	const auth = await authorize(cookies);
	const denied = await requireSwarmUpdateAccess(auth, envId);
	if (denied) return json({ error: 'Permission or environment access denied' }, { status: 403 });
	if (!await getEnvironment(envId)) return json({ error: 'Environment not found' }, { status: 404 });
	const body = await request.json().catch(() => null);

	try {
		const result = await createSwarmResource(envId, 'secret', body?.name, body?.value);
		return json({ success: true, ...result }, { status: 201 });
	} catch (error: any) {
		if (error instanceof SwarmResourceActionError) {
			return json({ error: error.message }, { status: error.statusCode });
		}
		if (error?.statusCode === 400) return json({ error: 'Docker rejected the Swarm secret name or metadata' }, { status: 400 });
		if (error?.statusCode === 409) return json({ error: 'A Swarm secret with this name already exists or Docker reported a conflict' }, { status: 409 });
		// Do not include the Docker error object: it can retain the submitted request body.
		console.error('Failed to create Swarm secret');
		return json({ error: 'Failed to create Swarm secret' }, { status: 502 });
	}
};
