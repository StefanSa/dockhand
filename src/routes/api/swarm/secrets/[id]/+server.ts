import { json } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import { authorize } from '$lib/server/authorize';
import { getEnvironment } from '$lib/server/db';
import { validateDockerIdParam } from '$lib/server/docker-validation';
import { deleteSwarmResource } from '$lib/server/swarm';
import { requireSwarmUpdateAccess } from '$lib/server/swarm-access';
import { SwarmResourceActionError } from '$lib/server/swarm-resource';

/**
 * @openapi
 * summary: Delete unused Swarm secret metadata from a manager environment
 * path: id:string! Swarm secret ID (from GET /api/swarm/secrets)
 * query: env:integer! Manager environment ID (from GET /api/environments)
 * resp-200: {success:boolean!, id:string!}
 * resp-400: Invalid secret or environment ID
 * resp-403: Permission denied, or no access to this environment
 * resp-404: Environment or secret not found
 * resp-409: Secret is in use, manager endpoint required, or Docker conflict
 * resp-502: Docker rejected or failed the Swarm secret request
 */
export const DELETE: RequestHandler = async ({ params, url, cookies }) => {
	const invalid = validateDockerIdParam(params.id, 'secret');
	if (invalid) return invalid;
	const envId = Number(url.searchParams.get('env'));
	if (!Number.isInteger(envId) || envId <= 0) return json({ error: 'A valid environment ID is required' }, { status: 400 });
	const auth = await authorize(cookies);
	const denied = await requireSwarmUpdateAccess(auth, envId);
	if (denied) return json({ error: 'Permission or environment access denied' }, { status: 403 });
	if (!await getEnvironment(envId)) return json({ error: 'Environment not found' }, { status: 404 });

	try {
		return json({ success: true, ...await deleteSwarmResource(envId, 'secret', params.id) });
	} catch (error: any) {
		if (error instanceof SwarmResourceActionError) return json({ error: error.message }, { status: error.statusCode });
		if (error?.statusCode === 404) return json({ error: 'Swarm secret not found' }, { status: 404 });
		if (error?.statusCode === 409) return json({ error: error.message || 'Swarm secret is still in use' }, { status: 409 });
		console.error('Failed to delete Swarm secret');
		return json({ error: 'Failed to delete Swarm secret' }, { status: 502 });
	}
};
