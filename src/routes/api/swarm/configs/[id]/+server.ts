import { json } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import { authorize } from '$lib/server/authorize';
import { getEnvironment } from '$lib/server/db';
import { validateDockerIdParam } from '$lib/server/docker-validation';
import { deleteSwarmResource, updateSwarmResourceLabels } from '$lib/server/swarm';
import { requireSwarmUpdateAccess } from '$lib/server/swarm-access';
import { SwarmResourceActionError } from '$lib/server/swarm-resource';

/**
 * @openapi
 * summary: Update only the labels of an immutable Swarm config
 * path: id:string! Swarm config ID (from GET /api/swarm/configs)
 * query: env:integer! Manager environment ID (from GET /api/environments)
 * body: {labels:object!}
 * resp-200: {success:boolean!, id:string!, name:string!, labels:object!}
 * resp-400: Invalid config, environment ID, or labels
 * resp-403: Permission denied, or no access to this environment
 * resp-404: Environment or config not found
 * resp-409: Manager endpoint required or concurrent Docker update
 * resp-502: Docker rejected or failed the Swarm config update
 */
export const PATCH: RequestHandler = async ({ params, request, url, cookies }) => {
	const invalid = validateDockerIdParam(params.id, 'config');
	if (invalid) return invalid;
	const envId = Number(url.searchParams.get('env'));
	if (!Number.isInteger(envId) || envId <= 0) return json({ error: 'A valid environment ID is required' }, { status: 400 });
	const auth = await authorize(cookies);
	const denied = await requireSwarmUpdateAccess(auth, envId);
	if (denied) return json({ error: 'Permission or environment access denied' }, { status: 403 });
	if (!await getEnvironment(envId)) return json({ error: 'Environment not found' }, { status: 404 });

	let body: { labels?: unknown };
	try {
		body = await request.json();
	} catch {
		return json({ error: 'A JSON body is required' }, { status: 400 });
	}
	try {
		return json({ success: true, ...await updateSwarmResourceLabels(envId, 'config', params.id, body.labels) });
	} catch (error: any) {
		if (error instanceof SwarmResourceActionError) return json({ error: error.message }, { status: error.statusCode });
		if (error?.statusCode === 404) return json({ error: 'Swarm config not found' }, { status: 404 });
		if (error?.statusCode === 409) return json({ error: error.message || 'Swarm config changed concurrently' }, { status: 409 });
		console.error('Failed to update Swarm config labels');
		return json({ error: 'Failed to update Swarm config labels' }, { status: 502 });
	}
};

/**
 * @openapi
 * summary: Delete an unused immutable Swarm config from a manager environment
 * path: id:string! Swarm config ID (from GET /api/swarm/configs)
 * query: env:integer! Manager environment ID (from GET /api/environments)
 * resp-200: {success:boolean!, id:string!}
 * resp-400: Invalid config or environment ID
 * resp-403: Permission denied, or no access to this environment
 * resp-404: Environment or config not found
 * resp-409: Config is in use, manager endpoint required, or Docker conflict
 * resp-502: Docker rejected or failed the Swarm config request
 */
export const DELETE: RequestHandler = async ({ params, url, cookies }) => {
	const invalid = validateDockerIdParam(params.id, 'config');
	if (invalid) return invalid;
	const envId = Number(url.searchParams.get('env'));
	if (!Number.isInteger(envId) || envId <= 0) return json({ error: 'A valid environment ID is required' }, { status: 400 });
	const auth = await authorize(cookies);
	const denied = await requireSwarmUpdateAccess(auth, envId);
	if (denied) return json({ error: 'Permission or environment access denied' }, { status: 403 });
	if (!await getEnvironment(envId)) return json({ error: 'Environment not found' }, { status: 404 });

	try {
		return json({ success: true, ...await deleteSwarmResource(envId, 'config', params.id) });
	} catch (error: any) {
		if (error instanceof SwarmResourceActionError) return json({ error: error.message }, { status: error.statusCode });
		if (error?.statusCode === 404) return json({ error: 'Swarm config not found' }, { status: 404 });
		if (error?.statusCode === 409) return json({ error: error.message || 'Swarm config is still in use' }, { status: 409 });
		console.error('Failed to delete Swarm config');
		return json({ error: 'Failed to delete Swarm config' }, { status: 502 });
	}
};
