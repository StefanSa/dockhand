interface SwarmAuthorization {
	requirePermission(resource: 'swarm', action: string, environmentId: number): Promise<Response | null>;
	requireEnvAccess(environmentId: number): Promise<Response | null>;
}

async function requireSwarmAccess(
	auth: SwarmAuthorization,
	action: 'view' | 'update',
	environmentId: number
): Promise<Response | null> {
	return (await auth.requirePermission('swarm', action, environmentId))
		?? (await auth.requireEnvAccess(environmentId));
}

export async function requireSwarmReadAccess(
	auth: SwarmAuthorization,
	environmentId: number
): Promise<Response | null> {
	return requireSwarmAccess(auth, 'view', environmentId);
}

export async function requireSwarmUpdateAccess(
	auth: SwarmAuthorization,
	environmentId: number
): Promise<Response | null> {
	return requireSwarmAccess(auth, 'update', environmentId);
}
