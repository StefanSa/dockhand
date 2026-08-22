import { json } from "@sveltejs/kit";
import type { RequestHandler } from "./$types";
import { auditStack } from "$lib/server/audit";
import { authorize } from "$lib/server/authorize";
import { getEnvironment } from "$lib/server/db";
import {
  requireSwarmReadAccess,
  requireSwarmUpdateAccess,
} from "$lib/server/swarm-access";
import { getSwarmCapability } from "$lib/server/swarm";
import {
  deploySwarmStack,
  getSwarmStackCompose,
  removeSwarmStack,
  SwarmStackActionError,
} from "$lib/server/swarm-stack";

function environmentIdFrom(queryValue: string | null): number | null {
  const value = Number(queryValue);
  return Number.isInteger(value) && value > 0 ? value : null;
}

/**
 * @openapi
 * summary: Read Dockhand's stored Compose file for a Swarm stack
 * path: name:string! Swarm stack namespace
 * query: env:integer! Manager environment ID
 * resp-200: {compose:string!, managed:boolean!}
 * resp-400: Invalid environment ID
 * resp-403: Permission or environment access denied
 * resp-404: Stored Swarm stack file not found
 * resp-502: Failed to read the stored Swarm stack file
 */
export const GET: RequestHandler = async ({ params, url, cookies }) => {
  const environmentId = environmentIdFrom(url.searchParams.get("env"));
  if (!environmentId)
    return json(
      { error: "A valid environment ID is required" },
      { status: 400 },
    );
  const auth = await authorize(cookies);
  if (await requireSwarmReadAccess(auth, environmentId)) {
    return json(
      { error: "Permission or environment access denied" },
      { status: 403 },
    );
  }
  if (!(await getEnvironment(environmentId)))
    return json({ error: "Environment not found" }, { status: 404 });

  try {
    return json(
      await getSwarmStackCompose(
        environmentId,
        decodeURIComponent(params.name),
      ),
    );
  } catch (error) {
    if (error instanceof SwarmStackActionError && error.statusCode === 404) {
      return json({ error: error.message }, { status: 404 });
    }
    console.error(
      "Failed to read Swarm stack file",
      error instanceof Error ? error.message : error,
    );
    return json({ error: "Failed to read Swarm stack file" }, { status: 502 });
  }
};

/**
 * @openapi
 * summary: Deploy or update a Swarm stack from a Compose file
 * path: name:string! Swarm stack namespace
 * query: env:integer! Manager environment ID
 * body: {compose:string!}
 * resp-200: {success:boolean!, action:string!, name:string!, filesPreserved:boolean!}
 * resp-400: Invalid stack name or Compose file
 * resp-403: Permission or environment access denied
 * resp-404: Environment not found
 * resp-409: Manager endpoint required, or name belongs to a Compose stack
 * resp-500: Failed to persist the managed stack file
 * resp-502: Docker stack validation/deploy failed
 */
export const PUT: RequestHandler = async (event) => {
  const { params, request, url, cookies } = event;
  const environmentId = environmentIdFrom(url.searchParams.get("env"));
  if (!environmentId)
    return json(
      { error: "A valid environment ID is required" },
      { status: 400 },
    );
  const auth = await authorize(cookies);
  if (await requireSwarmUpdateAccess(auth, environmentId)) {
    return json(
      { error: "Permission or environment access denied" },
      { status: 403 },
    );
  }
  if (!(await getEnvironment(environmentId)))
    return json({ error: "Environment not found" }, { status: 404 });

  let body: { compose?: unknown };
  try {
    body = await request.json();
  } catch {
    return json({ error: "Invalid JSON body" }, { status: 400 });
  }
  if (typeof body.compose !== "string")
    return json({ error: "A Compose stack file is required" }, { status: 400 });

  const name = decodeURIComponent(params.name);
  try {
    const result = await deploySwarmStack(
      environmentId,
      await getSwarmCapability(environmentId, true),
      name,
      body.compose,
    );
    await auditStack(event, "deploy", result.name, environmentId, {
      orchestrator: "swarm",
    });
    return json({ success: true, ...result });
  } catch (error) {
    if (error instanceof SwarmStackActionError) {
      if (error.statusCode === 400)
        return json({ error: error.message }, { status: 400 });
      if (error.statusCode === 409)
        return json({ error: error.message }, { status: 409 });
      if (error.statusCode === 500)
        return json({ error: error.message }, { status: 500 });
    }
    console.error(
      "Failed to deploy Swarm stack",
      error instanceof Error ? error.message : error,
    );
    return json({ error: "Failed to deploy Swarm stack" }, { status: 502 });
  }
};

/**
 * @openapi
 * summary: Remove a Swarm stack while preserving its stored file by default
 * path: name:string! Swarm stack namespace
 * query: env:integer! Manager environment ID
 * query: files:boolean Also delete Dockhand-managed stack files (default false)
 * resp-200: {success:boolean!, action:string!, name:string!, filesPreserved:boolean!}
 * resp-400: Invalid environment ID or stack name
 * resp-403: Permission or environment access denied
 * resp-404: Environment not found
 * resp-409: Manager endpoint required, or name belongs to a Compose stack
 * resp-500: Failed to clean up the managed stack source or files
 * resp-502: Docker stack removal failed
 */
export const DELETE: RequestHandler = async (event) => {
  const { params, url, cookies } = event;
  const environmentId = environmentIdFrom(url.searchParams.get("env"));
  if (!environmentId)
    return json(
      { error: "A valid environment ID is required" },
      { status: 400 },
    );
  const auth = await authorize(cookies);
  if (await requireSwarmUpdateAccess(auth, environmentId)) {
    return json(
      { error: "Permission or environment access denied" },
      { status: 403 },
    );
  }
  if (!(await getEnvironment(environmentId)))
    return json({ error: "Environment not found" }, { status: 404 });

  const name = decodeURIComponent(params.name);
  try {
    const result = await removeSwarmStack(
      environmentId,
      await getSwarmCapability(environmentId, true),
      name,
      url.searchParams.get("files") === "true",
    );
    await auditStack(event, "delete", result.name, environmentId, {
      orchestrator: "swarm",
      files: !result.filesPreserved,
    });
    return json({ success: true, ...result });
  } catch (error) {
    if (error instanceof SwarmStackActionError) {
      if (error.statusCode === 400)
        return json({ error: error.message }, { status: 400 });
      if (error.statusCode === 409)
        return json({ error: error.message }, { status: 409 });
      if (error.statusCode === 500)
        return json({ error: error.message }, { status: 500 });
    }
    console.error(
      "Failed to remove Swarm stack",
      error instanceof Error ? error.message : error,
    );
    return json({ error: "Failed to remove Swarm stack" }, { status: 502 });
  }
};
