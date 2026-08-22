import type { SwarmCapability } from "$lib/types/swarm";

export type SwarmNodeAvailability = "active" | "pause" | "drain";
export type SwarmNodeRole = "worker" | "manager";

export type SwarmNodeAction =
  | { type: "availability"; availability: SwarmNodeAvailability }
  | { type: "role"; role: SwarmNodeRole };

export interface SwarmNodeActionResult {
  action: SwarmNodeAction["type"];
  version: number;
  role: SwarmNodeRole;
  availability: SwarmNodeAvailability;
}

type SwarmRequest = (path: string, options?: RequestInit) => Promise<unknown>;

export class SwarmNodeActionError extends Error {
  constructor(
    message: string,
    public statusCode: number,
  ) {
    super(message);
    this.name = "SwarmNodeActionError";
  }
}

function isRecord(value: unknown): value is Record<string, any> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function nodeVersion(value: unknown): number {
  if (
    !isRecord(value) ||
    !isRecord(value.Version) ||
    !Number.isSafeInteger(value.Version.Index)
  ) {
    throw new SwarmNodeActionError(
      "Docker returned an invalid node version",
      502,
    );
  }
  return value.Version.Index;
}

function nodeSpec(value: unknown): Record<string, any> {
  if (!isRecord(value) || !isRecord(value.Spec)) {
    throw new SwarmNodeActionError(
      "Docker returned an invalid node specification",
      502,
    );
  }
  return value.Spec;
}

function nodeRole(spec: Record<string, any>): SwarmNodeRole {
  if (spec.Role === "worker" || spec.Role === "manager") return spec.Role;
  throw new SwarmNodeActionError("Docker returned an invalid node role", 502);
}

function nodeAvailability(spec: Record<string, any>): SwarmNodeAvailability {
  if (
    spec.Availability === "active" ||
    spec.Availability === "pause" ||
    spec.Availability === "drain"
  ) {
    return spec.Availability;
  }
  throw new SwarmNodeActionError(
    "Docker returned an invalid node availability",
    502,
  );
}

function countManagers(value: unknown): number {
  if (!Array.isArray(value)) {
    throw new SwarmNodeActionError("Docker returned an invalid node list", 502);
  }
  return value.filter((node) => {
    const spec = isRecord(node) && isRecord(node.Spec) ? node.Spec : null;
    return spec?.Role === "manager";
  }).length;
}

export async function performSwarmNodeAction(
  capability: SwarmCapability,
  nodeId: string,
  action: SwarmNodeAction,
  request: SwarmRequest,
): Promise<SwarmNodeActionResult> {
  if (
    capability.kind !== "swarm-manager" ||
    capability.controlAvailable !== true
  ) {
    throw new SwarmNodeActionError(
      "Swarm node actions require a manager endpoint",
      409,
    );
  }

  const encodedId = encodeURIComponent(nodeId);
  const node = await request(`/nodes/${encodedId}`);
  const version = nodeVersion(node);
  const spec = nodeSpec(node);
  const currentRole = nodeRole(spec);
  const currentAvailability = nodeAvailability(spec);

  let nextRole = currentRole;
  let nextAvailability = currentAvailability;
  if (action.type === "availability") {
    if (!["active", "pause", "drain"].includes(action.availability)) {
      throw new SwarmNodeActionError(
        "Availability must be active, pause, or drain",
        400,
      );
    }
    if (action.availability === currentAvailability) {
      throw new SwarmNodeActionError(
        `Node availability is already ${currentAvailability}`,
        409,
      );
    }
    nextAvailability = action.availability;
  } else {
    if (!["worker", "manager"].includes(action.role)) {
      throw new SwarmNodeActionError("Role must be worker or manager", 400);
    }
    if (action.role === currentRole) {
      throw new SwarmNodeActionError(
        `Node role is already ${currentRole}`,
        409,
      );
    }
    if (currentRole === "manager" && action.role === "worker") {
      const nodes = await request("/nodes");
      if (countManagers(nodes) <= 1) {
        throw new SwarmNodeActionError(
          "The last Swarm manager cannot be demoted",
          409,
        );
      }
    }
    nextRole = action.role;
  }

  await request(`/nodes/${encodedId}/update?version=${version}`, {
    method: "POST",
    body: JSON.stringify({
      ...spec,
      Role: nextRole,
      Availability: nextAvailability,
    }),
  });

  return {
    action: action.type,
    version,
    role: nextRole,
    availability: nextAvailability,
  };
}
