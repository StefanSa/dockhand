import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  performSwarmNodeAction,
  SwarmNodeActionError,
  type SwarmNodeAction,
  type SwarmNodeRole,
} from "../src/lib/server/swarm-node";
import type { SwarmCapability } from "../src/lib/types/swarm";

const manager: SwarmCapability = {
  kind: "swarm-manager",
  localNodeState: "active",
  controlAvailable: true,
  detectedAt: "2026-08-22T00:00:00.000Z",
};

function dockerNode(
  role: SwarmNodeRole = "worker",
  availability = "active",
  version = 7,
) {
  return {
    ID: "node-1",
    Version: { Index: version },
    Spec: {
      Name: "node-one",
      Labels: { zone: "lab" },
      Role: role,
      Availability: availability,
    },
  };
}

describe("Swarm node actions", () => {
  it("updates availability to active, pause, and drain using the current version and complete spec", async () => {
    for (const [current, target] of [
      ["drain", "active"],
      ["active", "pause"],
      ["active", "drain"],
    ] as const) {
      const calls: Array<{ path: string; options?: RequestInit }> = [];
      const result = await performSwarmNodeAction(
        manager,
        "node-1",
        { type: "availability", availability: target },
        async (path, options) => {
          calls.push({ path, options });
          return options?.method === "POST"
            ? undefined
            : dockerNode("worker", current);
        },
      );

      assert.equal(result.availability, target);
      assert.equal(calls[1].path, "/nodes/node-1/update?version=7");
      assert.deepEqual(JSON.parse(String(calls[1].options?.body)), {
        Name: "node-one",
        Labels: { zone: "lab" },
        Role: "worker",
        Availability: target,
      });
    }
  });

  it("promotes a worker to manager", async () => {
    let updateRole: unknown;
    const result = await performSwarmNodeAction(
      manager,
      "node-1",
      { type: "role", role: "manager" },
      async (_path, options) => {
        if (options?.method === "POST") {
          updateRole = JSON.parse(String(options.body)).Role;
          return undefined;
        }
        return dockerNode("worker");
      },
    );

    assert.equal(result.role, "manager");
    assert.equal(updateRole, "manager");
  });

  it("demotes a manager when another manager remains", async () => {
    const paths: string[] = [];
    const result = await performSwarmNodeAction(
      manager,
      "node-1",
      { type: "role", role: "worker" },
      async (path) => {
        paths.push(path);
        if (path === "/nodes")
          return [dockerNode("manager"), dockerNode("manager")];
        return dockerNode("manager");
      },
    );

    assert.equal(result.role, "worker");
    assert.deepEqual(paths, [
      "/nodes/node-1",
      "/nodes",
      "/nodes/node-1/update?version=7",
    ]);
  });

  it("blocks demotion of the last manager before issuing an update", async () => {
    const paths: string[] = [];
    await assert.rejects(
      performSwarmNodeAction(
        manager,
        "node-1",
        { type: "role", role: "worker" },
        async (path) => {
          paths.push(path);
          if (path === "/nodes") return [dockerNode("manager")];
          return dockerNode("manager");
        },
      ),
      (error: unknown) =>
        error instanceof SwarmNodeActionError &&
        error.statusCode === 409 &&
        error.message.includes("last Swarm manager"),
    );
    assert.deepEqual(paths, ["/nodes/node-1", "/nodes"]);
  });

  it("rejects worker and standalone endpoints before Docker requests", async () => {
    for (const capability of [
      { ...manager, kind: "swarm-worker" as const, controlAvailable: false },
      { ...manager, kind: "standalone" as const, controlAvailable: false },
    ]) {
      let requested = false;
      await assert.rejects(
        performSwarmNodeAction(
          capability,
          "node-1",
          { type: "availability", availability: "drain" },
          async () => {
            requested = true;
          },
        ),
        (error: unknown) =>
          error instanceof SwarmNodeActionError && error.statusCode === 409,
      );
      assert.equal(requested, false);
    }
  });

  it("surfaces stale-version conflicts and Docker failures without retrying", async () => {
    for (const failure of [
      Object.assign(new Error("update out of sequence"), { statusCode: 409 }),
      Object.assign(new Error("daemon unavailable"), { statusCode: 503 }),
    ]) {
      let calls = 0;
      await assert.rejects(
        performSwarmNodeAction(
          manager,
          "node-1",
          { type: "availability", availability: "drain" },
          async (_path, options) => {
            calls++;
            if (options?.method === "POST") throw failure;
            return dockerNode();
          },
        ),
        (error: unknown) => error === failure,
      );
      assert.equal(calls, 2);
    }
  });

  it("rejects no-op and invalid node actions", async () => {
    for (const action of [
      { type: "availability", availability: "active" },
      { type: "role", role: "worker" },
      { type: "availability", availability: "offline" },
    ] as SwarmNodeAction[]) {
      await assert.rejects(
        performSwarmNodeAction(manager, "node-1", action, async () =>
          dockerNode(),
        ),
        (error: unknown) =>
          error instanceof SwarmNodeActionError &&
          (error.statusCode === 400 || error.statusCode === 409),
      );
    }
  });
});
