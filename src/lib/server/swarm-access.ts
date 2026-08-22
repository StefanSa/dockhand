interface SwarmReadAuthorization {
	requirePermission(resource: 'swarm', action: 'view', environmentId: number): Promise<Response | null>;
	requireEnvAccess(environmentId: number): Promise<Response | null>;
}

export async function requireSwarmReadAccess(
	auth: SwarmReadAuthorization,
	environmentId: number
): Promise<Response | null> {
	return (await auth.requirePermission('swarm', 'view', environmentId))
		?? (await auth.requireEnvAccess(environmentId));
}
