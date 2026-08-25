import type { ContainerInfo } from "$lib/types";
import type { SwarmEnvironmentNode } from "$lib/environment-grouping";

export type ContainerNodeRole = "manager" | "worker";

export interface SwarmContainerInfo extends ContainerInfo {
  environmentId: number;
  nodeId?: string;
  nodeName: string;
  nodeRole: ContainerNodeRole;
}

export interface SwarmContainerNodeIssue {
  nodeId?: string;
  nodeName: string;
  nodeRole: ContainerNodeRole;
  environmentId?: number;
  kind: "unregistered" | "unreachable";
}

export interface SwarmTopologyNode {
  id: string;
  hostname?: string;
  role?: ContainerNodeRole;
}

export interface SwarmContainerAggregation {
  containers: SwarmContainerInfo[];
  issues: SwarmContainerNodeIssue[];
}

export interface SwarmContainerFetchResponse {
  ok: boolean;
  json(): Promise<unknown>;
}

export type SwarmContainerFetcher = (
  environmentId: number,
) => Promise<SwarmContainerFetchResponse>;

function nodeRole(
  node: SwarmEnvironmentNode | SwarmTopologyNode,
): ContainerNodeRole {
  return node.role === "manager" ? "manager" : "worker";
}

export async function aggregateSwarmContainers(
  registeredNodes: SwarmEnvironmentNode[],
  topologyNodes: SwarmTopologyNode[],
  fetchContainers: SwarmContainerFetcher,
): Promise<SwarmContainerAggregation> {
  const results = await Promise.all(
    registeredNodes.map(async (node) => {
      try {
        const response = await fetchContainers(node.environment.id);
        if (!response.ok) throw new Error("unreachable");
        const body = await response.json();
        if (!Array.isArray(body)) throw new Error("invalid response");
        return {
          containers: (body as ContainerInfo[]).map(
            (container) =>
              ({
                ...container,
                environmentId: node.environment.id,
                nodeId: node.capability.nodeId,
                nodeName: node.name,
                nodeRole: node.role,
              }) satisfies SwarmContainerInfo,
          ),
          issue: null,
        };
      } catch {
        return {
          containers: [],
          issue: {
            nodeId: node.capability.nodeId,
            nodeName: node.name,
            nodeRole: node.role,
            environmentId: node.environment.id,
            kind: "unreachable",
          } satisfies SwarmContainerNodeIssue,
        };
      }
    }),
  );

  const registeredNodeIds = new Set(
    registeredNodes.flatMap((node) =>
      node.capability.nodeId ? [node.capability.nodeId] : [],
    ),
  );
  const unregistered = topologyNodes
    .filter((node) => !registeredNodeIds.has(node.id))
    .map((node) => ({
      nodeId: node.id,
      nodeName: node.hostname?.trim() || node.id.slice(0, 12),
      nodeRole: nodeRole(node),
      kind: "unregistered" as const,
    }));

  return {
    containers: results.flatMap((result) => result.containers),
    issues: [
      ...results.flatMap((result) => (result.issue ? [result.issue] : [])),
      ...unregistered,
    ],
  };
}

export function containerEnvironmentId(
  container: ContainerInfo | SwarmContainerInfo,
  fallbackEnvironmentId: number | null,
): number | null {
  return "environmentId" in container
    ? container.environmentId
    : fallbackEnvironmentId;
}

export function matchesContainerNode(
  container: SwarmContainerInfo,
  selectedEnvironmentIds: number[],
): boolean {
  return (
    selectedEnvironmentIds.length === 0 ||
    selectedEnvironmentIds.includes(container.environmentId)
  );
}

export function matchesContainerSearch(
  container: ContainerInfo | SwarmContainerInfo,
  search: string,
): boolean {
  const query = search.trim().toLowerCase();
  if (!query) return true;
  return (
    container.name.toLowerCase().includes(query) ||
    container.image.toLowerCase().includes(query) ||
    (container.labels?.["com.docker.compose.project"] || "")
      .toLowerCase()
      .includes(query) ||
    ("nodeName" in container &&
      container.nodeName.toLowerCase().includes(query))
  );
}

export function compareContainerNodes(
  left: SwarmContainerInfo,
  right: SwarmContainerInfo,
): number {
  return (
    left.nodeName.localeCompare(right.nodeName) ||
    left.nodeRole.localeCompare(right.nodeRole)
  );
}
