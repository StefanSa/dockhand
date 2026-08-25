#!/usr/bin/env bun

import { createHash } from 'node:crypto';
import { existsSync, readFileSync, writeFileSync } from 'node:fs';
import { spawnSync } from 'node:child_process';
import { parse } from 'svelte/compiler';
import baseline from './swarm-gate-baseline.json';

interface CommandResult {
	status: number;
	output: string;
}

export interface BuildFailure {
	file: string;
	line: number;
	column: number;
	message: string;
}

interface GateOptions {
	base: string;
	head?: string;
	tests: string[];
	build: boolean;
}

function run(command: string, args: string[], inherit = false): CommandResult {
	const result = spawnSync(command, args, {
		cwd: process.cwd(),
		encoding: 'utf8',
		stdio: inherit ? 'inherit' : ['ignore', 'pipe', 'pipe'],
		maxBuffer: 64 * 1024 * 1024
	});
	return {
		status: result.status ?? 1,
		output: inherit ? '' : `${result.stdout ?? ''}${result.stderr ?? ''}`
	};
}

function git(args: string[]): CommandResult {
	return run('git', args);
}

function argumentValues(name: string): string[] {
	const values: string[] = [];
	for (let index = 0; index < process.argv.length; index++) {
		if (process.argv[index] === name && process.argv[index + 1]) values.push(process.argv[index + 1]);
	}
	return values;
}

function options(): GateOptions {
	return {
		base: argumentValues('--base')[0] ?? 'HEAD',
		head: argumentValues('--head')[0],
		tests: argumentValues('--test').flatMap((value) => value.split(',')).filter(Boolean),
		build: process.argv.includes('--build')
	};
}

function changedFiles(base: string, head?: string): string[] {
	const args = ['diff', '--name-only', '--diff-filter=ACMR', base];
	if (head) args.push(head);
	args.push('--');
	const changed = git(args).output.trim().split('\n').filter(Boolean);
	if (!head) {
		changed.push(...git(['ls-files', '--others', '--exclude-standard']).output.trim().split('\n').filter(Boolean));
	}
	return [...new Set(changed)].sort();
}

function sourceFor(file: string, head?: string): string {
	if (!head) return readFileSync(file, 'utf8');
	const result = git(['show', `${head}:${file}`]);
	if (result.status !== 0) throw new Error(`Cannot read ${file} from ${head}`);
	return result.output;
}

export function parseBuildFailure(output: string): BuildFailure | null {
	const match = output.match(/(?:file:\s+[^\n]*\/)?(src\/[^\s]+\.svelte)(?:\s+|:|\s*\()(\d+):(\d+)\)?:\s+(Expected [^\n]+)/);
	if (!match) return null;
	return {
		file: match[1],
		line: Number(match[2]),
		column: Number(match[3]),
		message: match[4].replace(/\s+\(Note.*$/, '').trim()
	};
}

export function isKnownBuildFailure(
	failure: BuildFailure,
	fileHash: string
): boolean {
	return baseline.knownBuildBlockers.some((blocker) =>
		blocker.file === failure.file
		&& blocker.line === failure.line
		&& blocker.column === failure.column
		&& blocker.message === failure.message
		&& blocker.sha256 === fileHash
	);
}

function sha256(content: string): string {
	return createHash('sha256').update(content).digest('hex');
}

function assertBaselineAndToolchain(): void {
	const baselineRef = git(['rev-parse', baseline.baselineRef]);
	if (baselineRef.status !== 0 || baselineRef.output.trim() !== baseline.baselineCommit) {
		throw new Error(`${baseline.baselineRef} moved; recapture and review the baseline before running Swarm gates`);
	}
	const actual = {
		node: run('node', ['--version']).output.trim(),
		npm: run('npm', ['--version']).output.trim(),
		bun: run('bun', ['--version']).output.trim(),
		vite: run('npx', ['vite', '--version']).output.match(/vite\/(\S+)/)?.[1] ?? '',
		svelteCheck: run('npx', ['svelte-check', '--version']).output.match(/svelte-check,\s*(\S+)/)?.[1] ?? ''
	};
	const mismatches = Object.entries(baseline.toolchain).filter(([name, expected]) =>
		actual[name as keyof typeof actual] !== expected
	);
	if (mismatches.length) {
		throw new Error(`Toolchain differs from baseline:\n${mismatches.map(([name, expected]) =>
			`${name}: expected ${expected}, got ${actual[name as keyof typeof actual] || 'unknown'}`
		).join('\n')}`);
	}
	console.log(`PASS baseline-toolchain (${baseline.baselineCommit.slice(0, 7)})`);
}

function assertDiffCheck(base: string, head?: string): void {
	const args = ['diff', '--check', base];
	if (head) args.push(head);
	args.push('--');
	const result = git(args);
	if (result.status !== 0) throw new Error(`git diff --check failed:\n${result.output.trim()}`);
	console.log('PASS diff-check');
}

function assertProtectedFilesUntouched(files: string[]): void {
	const protectedChanges = files.filter((file) => baseline.protectedFiles.includes(file));
	if (protectedChanges.length) {
		throw new Error(`Protected baseline/toolchain files changed:\n${protectedChanges.join('\n')}`);
	}
	console.log('PASS protected-files');
}

function assertSvelteParses(files: string[], head?: string): void {
	const failures: string[] = [];
	for (const file of files.filter((candidate) => candidate.endsWith('.svelte'))) {
		try {
			parse(sourceFor(file, head), { filename: file });
		} catch (error) {
			failures.push(`${file}: ${error instanceof Error ? error.message : String(error)}`);
		}
	}
	if (failures.length) throw new Error(`Changed Svelte files do not parse:\n${failures.join('\n')}`);
	console.log('PASS changed-svelte-parse');
}

function diagnosticFiles(output: string): string[] {
	return output.split('\n').flatMap((line) => {
		const match = line.match(/\bERROR\s+"([^"]+)"/);
		return match ? [match[1].replaceAll('\\\\', '/')] : [];
	});
}

function assertNoChangedFileDiagnostics(files: string[]): void {
	const checkable = new Set(files.filter((file) => /\.(?:[cm]?[jt]s|svelte)$/.test(file)));
	if (!checkable.size) {
		console.log('PASS changed-file-diagnostics (no checkable files)');
		return;
	}
	const result = run('npx', ['svelte-check', '--tsconfig', './tsconfig.json', '--threshold', 'error', '--output', 'machine']);
	const newDiagnostics = [...new Set(diagnosticFiles(result.output).filter((file) => checkable.has(file)))];
	if (newDiagnostics.length) {
		throw new Error(`Changed files have diagnostics:\n${newDiagnostics.join('\n')}`);
	}
	console.log(`PASS changed-file-diagnostics (${checkable.size} files; unchanged baseline diagnostics ignored)`);
}

function runFocusedTests(tests: string[]): void {
	if (!tests.length) throw new Error('At least one focused test is required; pass --test <file>');
	const result = run('bun', ['test', ...tests], true);
	if (result.status !== 0) throw new Error('Focused tests failed');
	console.log(`PASS focused-tests (${tests.join(', ')})`);
}

function buildReceiptPath(): string {
	const result = git(['rev-parse', '--git-path', 'swarm-gate-build.json']);
	if (result.status !== 0) throw new Error('Cannot resolve git receipt path');
	return result.output.trim();
}

function buildFingerprint(base: string): string {
	const head = git(['rev-parse', 'HEAD']).output.trim();
	return sha256(`${baseline.baselineCommit}\n${base}\n${head}`);
}

function runOverallBuildOnce(base: string): void {
	const status = git(['status', '--porcelain']);
	if (status.output.trim()) throw new Error('Overall build requires a clean worktree');
	const receiptPath = buildReceiptPath();
	const fingerprint = buildFingerprint(base);
	if (existsSync(receiptPath)) {
		const receipt = JSON.parse(readFileSync(receiptPath, 'utf8')) as { fingerprint?: string; result?: string };
		if (receipt.fingerprint === fingerprint) {
			console.log(`PASS overall-build (reused receipt: ${receipt.result})`);
			return;
		}
	}

	const result = run('npm', ['run', 'build']);
	if (result.status === 0) {
		writeFileSync(receiptPath, JSON.stringify({ fingerprint, result: 'PASS' }, null, 2));
		console.log('PASS overall-build');
		return;
	}

	const failure = parseBuildFailure(result.output);
	if (!failure) throw new Error(`Overall build failed with an unclassified error:\n${result.output.slice(-4000)}`);
	const source = readFileSync(failure.file, 'utf8');
	if (!isKnownBuildFailure(failure, sha256(source))) {
		throw new Error(`Overall build has a new failure: ${failure.file}:${failure.line}:${failure.column} ${failure.message}`);
	}
	writeFileSync(receiptPath, JSON.stringify({
		fingerprint,
		result: 'PASS_WITH_KNOWN_UPSTREAM_BASELINE_BLOCKER',
		failure
	}, null, 2));
	console.log(`PASS overall-build with known upstream baseline blocker (${failure.file}:${failure.line}:${failure.column})`);
}

export function main(): void {
	const gate = options();
	assertBaselineAndToolchain();
	const files = changedFiles(gate.base, gate.head);
	if (!files.length) throw new Error(`No changed files found from ${gate.base}${gate.head ? ` to ${gate.head}` : ''}`);
	console.log(`Gate range: ${gate.base}${gate.head ? `..${gate.head}` : '..WORKTREE'}`);
	console.log(`Changed files: ${files.length}`);
	assertProtectedFilesUntouched(files);
	assertDiffCheck(gate.base, gate.head);
	assertSvelteParses(files, gate.head);
	assertNoChangedFileDiagnostics(files);
	runFocusedTests(gate.tests);
	if (gate.build) runOverallBuildOnce(gate.base);
	console.log('PASS swarm regression gate');
}

if (import.meta.main) {
	try {
		main();
	} catch (error) {
		console.error(`FAIL swarm regression gate: ${error instanceof Error ? error.message : String(error)}`);
		process.exit(1);
	}
}
