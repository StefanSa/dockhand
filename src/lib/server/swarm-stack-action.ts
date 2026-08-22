import { load as parseYaml } from "js-yaml";
import type { SwarmCapability } from "$lib/types/swarm";

const STACK_NAME_RE = /^[a-z0-9][a-z0-9_-]*$/;

export type SwarmStackAction =
  | { type: "deploy"; name: string; compose: string }
  | { type: "remove"; name: string; deleteFiles?: boolean };

export interface SwarmStackActionResult {
  action: SwarmStackAction["type"];
  name: string;
  filesPreserved: boolean;
  output?: string;
}

type SwarmStackExecutor = (
  action: SwarmStackAction,
) => Promise<SwarmStackActionResult>;

export class SwarmStackActionError extends Error {
  constructor(
    message: string,
    public statusCode: number,
  ) {
    super(message);
    this.name = "SwarmStackActionError";
  }
}

export function validateSwarmStackName(name: string): string {
  const value = name.trim();
  if (!STACK_NAME_RE.test(value)) {
    throw new SwarmStackActionError(
      "Stack name must be lowercase, start with a letter or number, and contain only letters, numbers, hyphens, and underscores",
      400,
    );
  }
  return value;
}

export function requireSwarmStackManager(capability: SwarmCapability): void {
  if (
    capability.kind !== "swarm-manager" ||
    capability.controlAvailable !== true
  ) {
    throw new SwarmStackActionError(
      capability.kind === "swarm-worker"
        ? "Swarm stack actions require a manager endpoint"
        : "Swarm stack actions are only available on an active Swarm manager",
      409,
    );
  }
}

export function validateSwarmStackCompose(compose: string): void {
  if (!compose.trim())
    throw new SwarmStackActionError(
      "A non-empty Compose stack file is required",
      400,
    );
  try {
    const document = parseYaml(compose);
    if (!document || typeof document !== "object" || Array.isArray(document)) {
      throw new Error("The document must be a YAML object");
    }
    const services = (document as Record<string, unknown>).services;
    if (!services || typeof services !== "object" || Array.isArray(services)) {
      throw new Error("The document must define a services map");
    }
  } catch (error) {
    if (error instanceof SwarmStackActionError) throw error;
    throw new SwarmStackActionError(
      `Invalid Compose stack file: ${error instanceof Error ? error.message : "unable to parse YAML"}`,
      400,
    );
  }
}

export async function performSwarmStackAction(
  capability: SwarmCapability,
  action: SwarmStackAction,
  execute: SwarmStackExecutor,
): Promise<SwarmStackActionResult> {
  requireSwarmStackManager(capability);
  const name = validateSwarmStackName(action.name);
  if (action.type === "deploy") validateSwarmStackCompose(action.compose);
  return execute({ ...action, name });
}
