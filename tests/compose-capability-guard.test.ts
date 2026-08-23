import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import {
	assertComposeMutationCapability,
	ComposeCapabilityConflictError,
	requireComposeMutationCapability
} from '../src/lib/server/compose-capability';
import type { SwarmCapability, SwarmCapabilityKind } from '../src/lib/types/swarm';

function capability(kind: SwarmCapabilityKind): SwarmCapability {
	return { kind, detectedAt: '2026-08-23T00:00:00.000Z' };
}

describe('Compose capability guard', () => {
	it('allows standalone Docker and always performs a fresh detection', async () => {
		const calls: Array<[number | null | undefined, boolean]> = [];
		const result = await requireComposeMutationCapability(7, async (environmentId, refresh) => {
			calls.push([environmentId, refresh]);
			return capability('standalone');
		});

		assert.equal(result.kind, 'standalone');
		assert.deepEqual(calls, [[7, true]]);
	});

	it('preserves the legacy omitted-env path for the default local Docker socket', async () => {
		const calls: Array<[number | null | undefined, boolean]> = [];
		const result = await requireComposeMutationCapability(undefined, async (environmentId, refresh) => {
			calls.push([environmentId, refresh]);
			return capability('standalone');
		});

		assert.equal(result.kind, 'standalone');
		assert.deepEqual(calls, [[undefined, true]]);
	});

	it('blocks managers, workers and unresolved capabilities with a conflict', () => {
		for (const kind of ['swarm-manager', 'swarm-worker', 'swarm-unavailable', 'unknown'] as const) {
			assert.throws(
				() => assertComposeMutationCapability(capability(kind)),
				(error: unknown) =>
					error instanceof ComposeCapabilityConflictError &&
					error.statusCode === 409 &&
					error.capabilityKind === kind
			);
		}
	});

	it('directs managers to Swarm Stacks and workers to a manager', () => {
		assert.throws(
			() => assertComposeMutationCapability(capability('swarm-manager')),
			(error: unknown) => error instanceof Error && error.message.includes('Use Swarm Stacks')
		);
		assert.throws(
			() => assertComposeMutationCapability(capability('swarm-worker')),
			(error: unknown) => error instanceof Error && error.message.includes('Connect to a Swarm manager')
		);
	});

	it('rejects an invalid environment before capability detection', async () => {
		let called = false;
		await assert.rejects(
			requireComposeMutationCapability(0, async () => {
				called = true;
				return capability('standalone');
			}),
			/A valid environment ID is required/
		);
		assert.equal(called, false);
	});
});
