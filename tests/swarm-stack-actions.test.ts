import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  performSwarmStackAction,
  SwarmStackActionError,
  validateSwarmStackCompose,
} from "../src/lib/server/swarm-stack-action";
import type { SwarmCapability } from "../src/lib/types/swarm";

const manager: SwarmCapability = {
  kind: "swarm-manager",
  localNodeState: "active",
  controlAvailable: true,
  detectedAt: "2026-08-22T00:00:00.000Z",
};

describe("Swarm stack actions", () => {
  it("deploys a validated stack through the supplied executor", async () => {
    let received: unknown;
    const result = await performSwarmStackAction(
      manager,
      {
        type: "deploy",
        name: "demo_stack",
        compose:
          "services:\n  web:\n    image: nginx:alpine\n    deploy:\n      replicas: 2\n",
      },
      async (action) => {
        received = action;
        return { action: action.type, name: action.name, filesPreserved: true };
      },
    );

    assert.equal(result.action, "deploy");
    assert.deepEqual(received, {
      type: "deploy",
      name: "demo_stack",
      compose:
        "services:\n  web:\n    image: nginx:alpine\n    deploy:\n      replicas: 2\n",
    });
  });

  it("redeploys an existing stack through the same validated action", async () => {
    const compose =
      "services:\n  web:\n    image: nginx:alpine\n    deploy:\n      replicas: 3\n";
    const actions: unknown[] = [];

    const result = await performSwarmStackAction(
      manager,
      { type: "deploy", name: "demo_stack", compose },
      async (action) => {
        actions.push(action);
        return { action: action.type, name: action.name, filesPreserved: true };
      },
    );

    assert.equal(result.action, "deploy");
    assert.deepEqual(actions, [
      { type: "deploy", name: "demo_stack", compose },
    ]);
  });

  it("removes a stack while preserving files by default", async () => {
    const result = await performSwarmStackAction(
      manager,
      { type: "remove", name: "demo" },
      async (action) => ({
        action: action.type,
        name: action.name,
        filesPreserved: action.type === "remove" ? !action.deleteFiles : true,
      }),
    );
    assert.equal(result.filesPreserved, true);
  });

  it("rejects worker and standalone endpoints before executing", async () => {
    for (const capability of [
      { ...manager, kind: "swarm-worker" as const, controlAvailable: false },
      { ...manager, kind: "standalone" as const, controlAvailable: false },
    ]) {
      let executed = false;
      await assert.rejects(
        performSwarmStackAction(
          capability,
          { type: "remove", name: "demo" },
          async () => {
            executed = true;
            return { action: "remove", name: "demo", filesPreserved: true };
          },
        ),
        (error: unknown) =>
          error instanceof SwarmStackActionError && error.statusCode === 409,
      );
      assert.equal(executed, false);
    }
  });

  it("rejects invalid names and invalid stack files", async () => {
    await assert.rejects(
      performSwarmStackAction(
        manager,
        { type: "deploy", name: "../demo", compose: "services: {}" },
        async () => ({ action: "deploy", name: "demo", filesPreserved: true }),
      ),
      (error: unknown) =>
        error instanceof SwarmStackActionError && error.statusCode === 400,
    );
    assert.throws(
      () => validateSwarmStackCompose("services:\n  web: [unterminated"),
      (error: unknown) =>
        error instanceof SwarmStackActionError && error.statusCode === 400,
    );
  });

  it("surfaces Docker or Swarm executor failures without retrying", async () => {
    let calls = 0;
    await assert.rejects(
      performSwarmStackAction(
        manager,
        { type: "remove", name: "demo" },
        async () => {
          calls++;
          throw new SwarmStackActionError("Docker rejected stack removal", 502);
        },
      ),
      (error: unknown) =>
        error instanceof SwarmStackActionError && error.statusCode === 502,
    );
    assert.equal(calls, 1);
  });
});
