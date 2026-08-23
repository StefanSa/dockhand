import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = fileURLToPath(new URL('..', import.meta.url));

function source(path: string): string {
	return readFileSync(resolve(root, path), 'utf8');
}

describe('Compose mutation entrypoint coverage', () => {
	it('uses the shared route guard for every normal Compose mutation API', () => {
		const routes = [
			'src/routes/api/batch/+server.ts',
			'src/routes/api/git/repositories/[id]/deploy/+server.ts',
			'src/routes/api/git/stacks/+server.ts',
			'src/routes/api/git/stacks/[id]/+server.ts',
			'src/routes/api/git/stacks/[id]/deploy/+server.ts',
			'src/routes/api/git/stacks/[id]/deploy-stream/+server.ts',
			'src/routes/api/git/stacks/[id]/sync/+server.ts',
			'src/routes/api/git/stacks/[id]/webhook/+server.ts',
			'src/routes/api/git/webhook/[id]/+server.ts',
			'src/routes/api/stacks/+server.ts',
			'src/routes/api/stacks/[name]/+server.ts',
			'src/routes/api/stacks/[name]/compose/+server.ts',
			'src/routes/api/stacks/[name]/deploy/+server.ts',
			'src/routes/api/stacks/[name]/down/+server.ts',
			'src/routes/api/stacks/[name]/env/+server.ts',
			'src/routes/api/stacks/[name]/env/raw/+server.ts',
			'src/routes/api/stacks/[name]/relocate/+server.ts',
			'src/routes/api/stacks/[name]/restart/+server.ts',
			'src/routes/api/stacks/[name]/start/+server.ts',
			'src/routes/api/stacks/[name]/stop/+server.ts',
			'src/routes/api/stacks/adopt/+server.ts'
		];

		for (const route of routes) {
			assert.match(source(route), /composeMutationGuardResponse\(/, `${route} must use the shared guard`);
		}
		assert.equal(source('src/routes/api/git/stacks/[id]/+server.ts').match(/composeMutationGuardResponse\(/g)?.length, 2);
		assert.equal(source('src/routes/api/git/stacks/[id]/webhook/+server.ts').match(/composeMutationGuardResponse\(/g)?.length, 2);
		assert.equal(source('src/routes/api/git/webhook/[id]/+server.ts').match(/composeMutationGuardResponse\(/g)?.length, 2);
	});

	it('keeps a shared guard in non-route mutation paths used by schedules and restores', () => {
		for (const path of [
			'src/lib/server/stacks.ts',
			'src/lib/server/git.ts',
			'src/lib/server/stack-scanner.ts'
		]) {
			assert.match(source(path), /requireComposeMutationCapability\(/, `${path} must use the shared guard`);
		}
	});
});
