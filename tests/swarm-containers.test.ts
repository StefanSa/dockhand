import { describe, expect, test } from "bun:test";
import { readFileSync } from "node:fs";
import type { ContainerInfo } from "../src/lib/types";
import type { SwarmEnvironmentNode } from "../src/lib/environment-grouping";
import {
  aggregateSwarmContainers,
  compareContainerNodes,
  containerEnvironmentId,
  matchesContainerNode,
  matchesContainerSearch,
} from "../src/lib/swarm-containers";

function container(id: string, name: string): ContainerInfo {
  return {
    id,
    name,
    image: `${name}:latest`,
    state: "running",
  } as ContainerInfo;
}

const registeredNodes: SwarmEnvironmentNode[] = [
  {
    environment: { id: 11, name: "Home Lab Swarm" },
    capability: { kind: "swarm-manager", nodeId: "manager-id" } as any,
    name: "manager-01",
    role: "manager",
  },
  {
    environment: { id: 12, name: "Worker 01" },
    capability: { kind: "swarm-worker", nodeId: "worker-id" } as any,
    name: "worker-01",
    role: "worker",
  },
];

describe("Swarm container aggregation", () => {
  test("combines task and local containers from every reachable registered node", async () => {
    const responses = new Map<number, ContainerInfo[]>([
      [
        11,
        [
          container("task-manager", "api.1"),
          container("hawser-manager", "hawser"),
        ],
      ],
      [
        12,
        [
          container("task-worker", "api.2"),
          container("manual-worker", "debug-shell"),
        ],
      ],
    ]);
    const result = await aggregateSwarmContainers(
      registeredNodes,
      [],
      async (environmentId) => ({
        ok: true,
        json: async () => responses.get(environmentId) ?? [],
      }),
    );

    expect(
      result.containers.map((item) => [
        item.name,
        item.environmentId,
        item.nodeName,
        item.nodeRole,
      ]),
    ).toEqual([
      ["api.1", 11, "manager-01", "manager"],
      ["hawser", 11, "manager-01", "manager"],
      ["api.2", 12, "worker-01", "worker"],
      ["debug-shell", 12, "worker-01", "worker"],
    ]);
    expect(result.issues).toEqual([]);
  });

  test("reports unreachable and unregistered nodes without inventing container data", async () => {
    const result = await aggregateSwarmContainers(
      registeredNodes,
      [
        { id: "manager-id", hostname: "manager-01", role: "manager" },
        { id: "worker-id", hostname: "worker-01", role: "worker" },
        { id: "missing-id", hostname: "worker-02", role: "worker" },
      ],
      async (environmentId) =>
        environmentId === 11
          ? {
              ok: true,
              json: async () => [container("manager-only", "hawser")],
            }
          : { ok: false, json: async () => ({ error: "offline" }) },
    );

    expect(result.containers.map((item) => item.name)).toEqual(["hawser"]);
    expect(result.issues).toHaveLength(2);
    expect(result.issues[0]).toMatchObject({
      nodeName: "worker-01",
      environmentId: 12,
      kind: "unreachable",
    });
    expect(result.issues[1]).toMatchObject({
      nodeName: "worker-02",
      kind: "unregistered",
    });
    expect(result.issues[1].environmentId).toBeUndefined();
  });
});

describe("Swarm container node filter and routing", () => {
  const workerContainer = {
    ...container("worker-container", "manual-worker"),
    environmentId: 12,
    nodeName: "worker-01",
    nodeRole: "worker" as const,
  };
  const managerContainer = {
    ...container("manager-container", "api.1"),
    environmentId: 11,
    nodeName: "manager-01",
    nodeRole: "manager" as const,
  };

  test("filters and searches by node name and sorts by node", () => {
    expect(matchesContainerNode(workerContainer, [])).toBe(true);
    expect(matchesContainerNode(workerContainer, [11])).toBe(false);
    expect(matchesContainerNode(workerContainer, [12])).toBe(true);
    expect(matchesContainerSearch(workerContainer, "WORKER-01")).toBe(true);
    expect(matchesContainerSearch(workerContainer, "manual")).toBe(true);
    expect(
      [workerContainer, managerContainer]
        .sort(compareContainerNodes)
        .map((item) => item.nodeName),
    ).toEqual(["manager-01", "worker-01"]);
  });

  test("routes cluster containers to their own endpoint and standalone to the selected endpoint", () => {
    expect(containerEnvironmentId(workerContainer, 11)).toBe(12);
    expect(
      containerEnvironmentId(container("standalone", "standalone"), 21),
    ).toBe(21);
  });

  test("wires lifecycle actions and container tools through the resolved node environment", () => {
    const page = readFileSync(
      new URL("../src/routes/containers/+page.svelte", import.meta.url),
      "utf8",
    );
    for (const operation of ["start", "stop", "pause", "unpause", "restart"]) {
      expect(page).toContain(
        `appendEnvParam(\`/api/containers/\${id}/${operation}\`, targetEnvironmentId(container))`,
      );
    }
    expect(page).toContain(
      "appendEnvParam(`/api/containers/${id}?force=true`, targetEnvironmentId(container))",
    );
    expect(page).toContain("envId={activeLog.environmentId}");
    expect(page).toContain("envId={activeTerminal.environmentId}");
    expect(page).toContain("environmentId={inspectContainerEnvironmentId}");
    expect(page).toContain("environmentId={editContainerEnvironmentId}");
    expect(page).toContain("envId={fileBrowserEnvironmentId ?? undefined}");
  });
});
