import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { isKnownBuildFailure, parseBuildFailure } from '../scripts/swarm-regression-gate';

describe('Swarm regression gate baseline classification', () => {
	it('recognizes the confirmed origin/main registry parser blocker', () => {
		const failure = parseBuildFailure(`
error during build:
src/routes/registry/+page.svelte (151:58): Expected ',', got '?' (Note that you need plugins to import files that are not JavaScript)
file: /tmp/baseline/src/routes/registry/+page.svelte:151:58
		`);
		assert.deepEqual(failure, {
			file: 'src/routes/registry/+page.svelte',
			line: 151,
			column: 58,
			message: "Expected ',', got '?'"
		});
		assert.equal(isKnownBuildFailure(failure!, '6da5dfe17ba3102eac4a4aad47a6818dfaad69fb5c0e432d79d09f81ff0e4aea'), true);
	});

	it('rejects changed files, locations and messages', () => {
		assert.equal(isKnownBuildFailure({
			file: 'src/routes/swarm/+page.svelte',
			line: 151,
			column: 58,
			message: "Expected ',', got '?'"
		}, '6da5dfe17ba3102eac4a4aad47a6818dfaad69fb5c0e432d79d09f81ff0e4aea'), false);
	});
});
