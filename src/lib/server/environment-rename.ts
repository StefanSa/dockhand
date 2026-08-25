import { existsSync, renameSync } from 'fs';

export interface EnvironmentPathRewrite {
	from: string;
	to: string;
}

export function rewriteEnvironmentPath(
	path: string | null,
	rewrites: EnvironmentPathRewrite[]
): string | null {
	if (!path) return path;
	for (const rewrite of rewrites) {
		if (path === rewrite.from || path.startsWith(`${rewrite.from}/`)) {
			return `${rewrite.to}${path.slice(rewrite.from.length)}`;
		}
	}
	return path;
}

export async function renameEnvironmentDirectories<T>(
	renames: EnvironmentPathRewrite[],
	persist: () => Promise<T>
): Promise<T> {
	const moved: EnvironmentPathRewrite[] = [];
	try {
		for (const rename of renames) {
			if (!existsSync(rename.from)) continue;
			renameSync(rename.from, rename.to);
			moved.push(rename);
		}
		return await persist();
	} catch (error) {
		for (const rename of moved.reverse()) {
			if (existsSync(rename.to) && !existsSync(rename.from)) {
				renameSync(rename.to, rename.from);
			}
		}
		throw error;
	}
}
