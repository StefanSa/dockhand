import { json } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import { authorize } from '$lib/server/authorize';
import { getEnvironment } from '$lib/server/db';
import { requireSwarmUpdateAccess } from '$lib/server/swarm-access';
import { createSwarmService } from '$lib/server/swarm';
import { parseSwarmServiceCreateInput, SwarmServiceActionError } from '$lib/server/swarm-service';

/**
 * @openapi
 * summary: Create a standalone Swarm service on a manager
 * query: env:integer! Manager environment ID (from GET /api/environments)
 * body: {name:string!, spec:{image:string!, replicas:integer, command:array<string>, args:array<string>, environment:array<string>, ports:array<object>, mounts:array<object>, networks:array<object>, configs:array<object>, secrets:array<object>, constraints:array<string>, resources:object, restartPolicy:object, updatePolicy:object, rollbackPolicy:object, stopGracePeriodSeconds:number, endpointMode:string}}
 * body-example: {"name":"web","spec":{"image":"nginx:alpine","replicas":1,"command":[],"args":[],"environment":[],"ports":[],"mounts":[],"networks":[],"configs":[],"secrets":[],"constraints":[],"resources":{"limits":{},"reservations":{}},"endpointMode":"vip"}}
 * resp-201: {success:boolean!, id:string!, warnings:array<string>!}
 * resp-400: Invalid service name or ServiceSpec
 * resp-403: Caller lacks swarm:update or environment access
 * resp-404: Environment not found
 * resp-409: Environment is not a controllable Swarm manager, or the name already exists
 * resp-502: Docker rejected or failed the service creation
 */
export const POST: RequestHandler = async ({ request, url, cookies }) => {
	const environmentId = Number(url.searchParams.get('env'));
	if (!Number.isInteger(environmentId) || environmentId <= 0) {
		return json({ error: 'A valid environment ID is required' }, { status: 400 });
	}

	const auth = await authorize(cookies);
	const denied = await requireSwarmUpdateAccess(auth, environmentId);
	if (denied) return json({ error: 'Permission or environment access denied' }, { status: 403 });
	if (!await getEnvironment(environmentId)) return json({ error: 'Environment not found' }, { status: 404 });

	let input;
	try {
		input = parseSwarmServiceCreateInput(await request.json().catch(() => null));
	} catch (error) {
		if (error instanceof SwarmServiceActionError) {
			return json({ error: error.message }, { status: error.statusCode });
		}
		throw error;
	}

	try {
		const result = await createSwarmService(environmentId, input);
		return json({ success: true, ...result }, { status: 201 });
	} catch (error: any) {
		if (error instanceof SwarmServiceActionError) {
			return json({ error: error.message }, { status: error.statusCode });
		}
		if (error?.statusCode === 409) {
			return json({ error: 'A Swarm service with this name already exists' }, { status: 409 });
		}
		console.error('Failed to create Swarm service:', error?.message || error);
		return json({ error: 'Failed to create Swarm service' }, { status: 502 });
	}
};
