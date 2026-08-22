import { execFile } from "node:child_process";
import {
  existsSync,
  mkdirSync,
  mkdtempSync,
  readFileSync,
  rmSync,
  writeFileSync,
} from "node:fs";
import { homedir } from "node:os";
import { join, resolve } from "node:path";
import { promisify } from "node:util";
import {
  getEnvironment,
  getStackSource,
  deleteStackEnvVars,
  deleteStackSource,
} from "./db";
import { cleanPem } from "$lib/utils/pem";
import {
  deleteManagedStackFiles,
  getStackComposeFile,
  getStackDir,
  saveStackComposeFile,
} from "./stacks";
import type { SwarmCapability } from "$lib/types/swarm";
import {
  performSwarmStackAction,
  SwarmStackActionError,
  validateSwarmStackName,
  type SwarmStackActionResult,
} from "./swarm-stack-action";

export {
  performSwarmStackAction,
  requireSwarmStackManager,
  SwarmStackActionError,
  validateSwarmStackCompose,
  validateSwarmStackName,
  type SwarmStackAction,
  type SwarmStackActionResult,
} from "./swarm-stack-action";

const execFileAsync = promisify(execFile);
const STACK_COMMAND_TIMEOUT_MS = 15 * 60 * 1000;
function readDockerCliConfig(): Record<string, any> {
  const configDir = process.env.DOCKER_CONFIG || join(homedir(), ".docker");
  const configPath = join(configDir, "config.json");
  if (!existsSync(configPath)) return {};
  try {
    const parsed = JSON.parse(readFileSync(configPath, "utf8"));
    return parsed && typeof parsed === "object" && !Array.isArray(parsed)
      ? parsed
      : {};
  } catch {
    return {};
  }
}

async function runDockerStackCli(
  environmentId: number,
  command: string[],
): Promise<string> {
  const environment = await getEnvironment(environmentId);
  if (!environment)
    throw new SwarmStackActionError("Environment not found", 404);
  if (environment.connectionType === "hawser-edge") {
    throw new SwarmStackActionError(
      "Swarm stack actions are not supported through Hawser Edge",
      409,
    );
  }

  const dataDir = resolve(process.env.DATA_DIR || "./data");
  const tempRoot = join(dataDir, "tmp");
  mkdirSync(tempRoot, { recursive: true, mode: 0o700 });
  const tempDir = mkdtempSync(join(tempRoot, "swarm-stack-"));
  const cliConfig = readDockerCliConfig();
  const cliArgs: string[] = ["--config", tempDir];
  const spawnEnv: Record<string, string> = {
    PATH: process.env.PATH || "/usr/local/bin:/usr/bin:/bin",
    HOME: process.env.HOME || "/root",
    DOCKER_CONFIG: tempDir,
  };

  try {
    let dockerHost: string;
    if (
      !environment.connectionType ||
      environment.connectionType === "socket"
    ) {
      dockerHost = `unix://${environment.socketPath || "/var/run/docker.sock"}`;
    } else {
      if (!environment.host)
        throw new SwarmStackActionError("Docker host is not configured", 400);
      dockerHost = `tcp://${environment.host}:${environment.port || 2375}`;
    }

    if (environment.connectionType === "hawser-standard") {
      if (!environment.hawserToken)
        throw new SwarmStackActionError("Hawser token is not configured", 400);
      cliConfig.HttpHeaders = {
        ...(cliConfig.HttpHeaders && typeof cliConfig.HttpHeaders === "object"
          ? cliConfig.HttpHeaders
          : {}),
        "X-Hawser-Token": environment.hawserToken,
      };
    }

    if (environment.protocol === "https") {
      cliArgs.push("--tls");
      if (environment.tlsCa) {
        const path = join(tempDir, "ca.pem");
        const pem = cleanPem(environment.tlsCa);
        if (!pem)
          throw new SwarmStackActionError("Docker TLS CA is invalid", 400);
        writeFileSync(path, pem, { mode: 0o600 });
        cliArgs.push("--tlscacert", path);
      }
      if (environment.tlsCert) {
        const path = join(tempDir, "cert.pem");
        const pem = cleanPem(environment.tlsCert);
        if (!pem)
          throw new SwarmStackActionError(
            "Docker TLS certificate is invalid",
            400,
          );
        writeFileSync(path, pem, { mode: 0o600 });
        cliArgs.push("--tlscert", path);
      }
      if (environment.tlsKey) {
        const path = join(tempDir, "key.pem");
        const pem = cleanPem(environment.tlsKey);
        if (!pem)
          throw new SwarmStackActionError("Docker TLS key is invalid", 400);
        writeFileSync(path, pem, { mode: 0o600 });
        cliArgs.push("--tlskey", path);
      }
      if (!environment.tlsSkipVerify) cliArgs.push("--tlsverify");
    }

    writeFileSync(join(tempDir, "config.json"), JSON.stringify(cliConfig), {
      mode: 0o600,
    });
    cliArgs.push("-H", dockerHost, ...command);
    if (process.env.DOCKER_API_VERSION)
      spawnEnv.DOCKER_API_VERSION = process.env.DOCKER_API_VERSION;

    try {
      const { stdout, stderr } = await execFileAsync("docker", cliArgs, {
        env: spawnEnv,
        timeout: STACK_COMMAND_TIMEOUT_MS,
        maxBuffer: 4 * 1024 * 1024,
      });
      return (stdout || stderr || "").trim();
    } catch (error: any) {
      const message = String(
        error?.stderr ||
          error?.stdout ||
          error?.message ||
          "Docker stack command failed",
      ).trim();
      throw new SwarmStackActionError(
        message || "Docker stack command failed",
        502,
      );
    }
  } finally {
    rmSync(tempDir, { recursive: true, force: true });
  }
}

export async function deploySwarmStack(
  environmentId: number,
  capability: SwarmCapability,
  name: string,
  compose: string,
): Promise<SwarmStackActionResult> {
  return performSwarmStackAction(
    capability,
    { type: "deploy", name, compose },
    async (action) => {
      if (action.type !== "deploy")
        throw new SwarmStackActionError("Invalid stack action", 400);
      const existing = await getStackSource(action.name, environmentId);
      if (existing && existing.sourceType !== "swarm") {
        throw new SwarmStackActionError(
          `A Compose stack named "${action.name}" already uses this environment`,
          409,
        );
      }

      const stackDir = await getStackDir(action.name, environmentId);
      const composePath = join(stackDir, "compose.yaml");
      const saved = await saveStackComposeFile(
        action.name,
        action.compose,
        false,
        environmentId,
        {
          composePath,
          sourceType: "swarm",
        },
      );
      if (!saved.success)
        throw new SwarmStackActionError(
          saved.error || "Failed to save stack file",
          500,
        );

      await runDockerStackCli(environmentId, [
        "stack",
        "config",
        "--compose-file",
        composePath,
      ]);
      const output = await runDockerStackCli(environmentId, [
        "stack",
        "deploy",
        "--detach=false",
        "--prune",
        "--resolve-image",
        "changed",
        "--with-registry-auth",
        "--compose-file",
        composePath,
        action.name,
      ]);
      return {
        action: "deploy",
        name: action.name,
        filesPreserved: true,
        output,
      };
    },
  );
}

export async function removeSwarmStack(
  environmentId: number,
  capability: SwarmCapability,
  name: string,
  deleteFiles = false,
): Promise<SwarmStackActionResult> {
  return performSwarmStackAction(
    capability,
    { type: "remove", name, deleteFiles },
    async (action) => {
      if (action.type !== "remove")
        throw new SwarmStackActionError("Invalid stack action", 400);
      const existing = await getStackSource(action.name, environmentId);
      if (existing && existing.sourceType !== "swarm") {
        throw new SwarmStackActionError(
          `"${action.name}" is a Compose stack, not a Swarm stack`,
          409,
        );
      }

      const output = await runDockerStackCli(environmentId, [
        "stack",
        "rm",
        "--detach=false",
        action.name,
      ]);
      if (action.deleteFiles)
        await deleteManagedStackFiles(action.name, environmentId);
      await Promise.all([
        deleteStackEnvVars(action.name, environmentId),
        deleteStackSource(action.name, environmentId),
      ]);
      return {
        action: "remove",
        name: action.name,
        filesPreserved: !action.deleteFiles,
        output,
      };
    },
  );
}

export async function getSwarmStackCompose(
  environmentId: number,
  name: string,
): Promise<{ compose: string; managed: boolean }> {
  const stackName = validateSwarmStackName(name);
  const source = await getStackSource(stackName, environmentId);
  if (!source || source.sourceType !== "swarm") {
    throw new SwarmStackActionError(
      "Dockhand does not have a stored file for this Swarm stack",
      404,
    );
  }
  const result = await getStackComposeFile(stackName, environmentId);
  if (!result.success || !result.content) {
    throw new SwarmStackActionError(
      result.error || "Stored Swarm stack file is unavailable",
      404,
    );
  }
  return { compose: result.content, managed: true };
}
