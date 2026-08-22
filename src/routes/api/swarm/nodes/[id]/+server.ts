import { json } from "@sveltejs/kit";
import type { RequestHandler } from "./$types";
import { authorize } from "$lib/server/authorize";
import { getEnvironment } from "$lib/server/db";
import { validateDockerIdParam } from "$lib/server/docker-validation";
import { requireSwarmUpdateAccess } from "$lib/server/swarm-access";
import { updateSwarmNode } from "$lib/server/swarm";
import {
  SwarmNodeActionError,
  type SwarmNodeAction,
  type SwarmNodeAvailability,
  type SwarmNodeRole,
} from "$lib/server/swarm-node";

const AVAILABILITIES = new Set<SwarmNodeAvailability>([
  "active",
  "pause",
  "drain",
]);
const ROLES = new Set<SwarmNodeRole>(["worker", "manager"]);

/**
 * @openapi
 * summary: Change availability or role for an existing Swarm node
 * path: id:string! Swarm node ID (from GET /api/swarm)
 * query: env:integer! Manager environment ID (from GET /api/environments)
 * body: {action:string!, availability:string, role:string}
 * body-example: {"action":"availability","availability":"drain"}
 * resp-200: {success:boolean!, action:string!, version:integer!, role:string!, availability:string!}
 * resp-400: Invalid action, availability, role, node ID, or environment ID
 * resp-403: Permission denied, or no access to this environment
 * resp-404: Environment or node not found
 * resp-409: Manager endpoint required, last-manager protection, invalid state, or stale node version
 * resp-502: Docker endpoint rejected or failed the node update
 */
export const POST: RequestHandler = async ({
  params,
  request,
  url,
  cookies,
}) => {
  const invalid = validateDockerIdParam(params.id, "node");
  if (invalid) return invalid;

  const environmentId = Number(url.searchParams.get("env"));
  if (!Number.isInteger(environmentId) || environmentId <= 0) {
    return json(
      { error: "A valid environment ID is required" },
      { status: 400 },
    );
  }

  const auth = await authorize(cookies);
  const denied = await requireSwarmUpdateAccess(auth, environmentId);
  if (denied)
    return json(
      { error: "Permission or environment access denied" },
      { status: 403 },
    );

  if (!(await getEnvironment(environmentId))) {
    return json({ error: "Environment not found" }, { status: 404 });
  }

  const body = await request.json().catch(() => null);
  let action: SwarmNodeAction;
  if (
    body?.action === "availability" &&
    AVAILABILITIES.has(body.availability)
  ) {
    action = { type: "availability", availability: body.availability };
  } else if (body?.action === "role" && ROLES.has(body.role)) {
    action = { type: "role", role: body.role };
  } else {
    return json(
      {
        error:
          "Action must set availability (active, pause, drain) or role (worker, manager)",
      },
      { status: 400 },
    );
  }

  try {
    const result = await updateSwarmNode(environmentId, params.id, action);
    return json({ success: true, ...result });
  } catch (error: any) {
    if (error instanceof SwarmNodeActionError) {
      return json({ error: error.message }, { status: error.statusCode });
    }
    if (error?.statusCode === 404) {
      return json({ error: "Swarm node not found" }, { status: 404 });
    }
    if (error?.statusCode === 400 || error?.statusCode === 409) {
      return json(
        {
          error:
            error?.message ||
            "The node changed concurrently; refresh and try again",
        },
        { status: 409 },
      );
    }
    console.error("Failed to update Swarm node:", error?.message || error);
    return json({ error: "Failed to update Swarm node" }, { status: 502 });
  }
};
