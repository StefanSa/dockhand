import { describe, expect, it } from 'bun:test';
import { existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import {
	renameEnvironmentDirectories,
	rewriteEnvironmentPath
} from '../src/lib/server/environment-rename';

describe('environment rename keeps stored stack paths usable', () => {
	it('moves stack files, rewrites Compose and Swarm sources, and rolls back on persistence failure', async () => {
		const root = mkdtempSync(join(tmpdir(), 'dockhand-env-rename-'));
		try {
			const oldBase = join(root, 'stacks', 'old-env');
			const newBase = join(root, 'stacks', 'new-env');
			const compose = join(oldBase, 'compose-stack', 'compose.yaml');
			const swarm = join(oldBase, 'swarm-stack', 'compose.yaml');
			mkdirSync(join(oldBase, 'compose-stack'), { recursive: true });
			mkdirSync(join(oldBase, 'swarm-stack'), { recursive: true });
			writeFileSync(compose, 'services:\n  web:\n    image: nginx:alpine\n');
			writeFileSync(swarm, 'services:\n  api:\n    image: alpine:3.21\n');
			const rewrites = [{ from: oldBase, to: newBase }];
			let sources = [
				{ sourceType: 'internal', composePath: compose, envPath: join(oldBase, 'compose-stack', '.env') },
				{ sourceType: 'swarm', composePath: swarm, envPath: null }
			];

			await renameEnvironmentDirectories(rewrites, async () => {
				sources = sources.map((source) => ({
					...source,
					composePath: rewriteEnvironmentPath(source.composePath, rewrites)!,
					envPath: rewriteEnvironmentPath(source.envPath, rewrites)
				}));
			});

			expect(existsSync(oldBase)).toBe(false);
			expect(sources.map((source) => source.composePath)).toEqual([
				join(newBase, 'compose-stack', 'compose.yaml'),
				join(newBase, 'swarm-stack', 'compose.yaml')
			]);
			expect(sources[0].envPath).toBe(join(newBase, 'compose-stack', '.env'));
			for (const source of sources) {
				expect(readFileSync(source.composePath, 'utf8')).toContain('services:');
			}

			await expect(renameEnvironmentDirectories(
				[{ from: newBase, to: oldBase }],
				async () => { throw new Error('database failed'); }
			)).rejects.toThrow('database failed');
			expect(existsSync(newBase)).toBe(true);
			expect(existsSync(oldBase)).toBe(false);
		} finally {
			rmSync(root, { recursive: true, force: true });
		}
	});
});
