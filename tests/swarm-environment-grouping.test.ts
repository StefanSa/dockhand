import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { describe, it } from 'node:test';
import {
	enrichCapabilitiesWithManagerTopology,
	environmentGroupForId,
	environmentGroupMatches,
	groupEnvironments,
	swarmManagerEnvironmentId
} from '../src/lib/environment-grouping';
import type { Environment } from '../src/lib/stores/environment';
import type { SwarmCapability } from '../src/lib/types/swarm';

const detectedAt = '2026-08-25T00:00:00.000Z';
const environments: Environment[] = [
	{ id: 1, name: 'Home Lab Swarm' },
	{ id: 2, name: 'Worker endpoint' },
	{ id: 3, name: 'Standalone 01' },
	{ id: 4, name: 'Docker Standalone 02' }
];

describe('Swarm environment grouping', () => {
	it('represents one real cluster and two standalone environments without top-level node duplicates', () => {
		const rawCapabilities: Record<number, SwarmCapability> = {
			1: { kind: 'swarm-manager', clusterId: 'cluster-a', nodeId: 'node-manager', controlAvailable: true, detectedAt },
			2: { kind: 'swarm-worker', nodeId: 'node-worker', controlAvailable: false, detectedAt },
			3: { kind: 'standalone', detectedAt },
			4: { kind: 'standalone', detectedAt }
		};
		const capabilities = enrichCapabilitiesWithManagerTopology(rawCapabilities, [{
			clusterId: 'cluster-a',
			nodes: [
				{ id: 'node-manager', hostname: 'swarm-mgr01', role: 'manager' },
				{ id: 'node-worker', hostname: 'swarm-wrk02', role: 'worker' }
			]
		}]);
		const groups = groupEnvironments(environments, capabilities);

		assert.equal(groups.length, 3);
		assert.deepEqual(groups.map((group) => group.name), [
			'Home Lab Swarm',
			'Standalone 01',
			'Docker Standalone 02'
		]);
		const cluster = groups[0];
		assert.equal(cluster.kind, 'swarm-cluster');
		if (cluster.kind !== 'swarm-cluster') return;
		assert.equal(cluster.managerEnvironmentId, 1);
		assert.deepEqual(cluster.nodes.map((node) => [node.name, node.role]), [
			['swarm-mgr01', 'manager'],
			['swarm-wrk02', 'worker']
		]);
		assert.equal(environmentGroupForId(groups, 2), cluster);
		assert.equal(swarmManagerEnvironmentId(groups, 1), 1);
		assert.equal(swarmManagerEnvironmentId(groups, 2), 1);
		assert.equal(swarmManagerEnvironmentId(groups, 3), 3);
		assert.equal(environmentGroupMatches(cluster, 'Home Lab'), true);
		assert.equal(environmentGroupMatches(cluster, 'swarm-wrk02'), false);
	});

	it('does not group environments by similar names', () => {
		const groups = groupEnvironments([
			{ id: 10, name: 'lab-manager' },
			{ id: 11, name: 'lab-manager-worker' }
		], {
			10: { kind: 'standalone', detectedAt },
			11: { kind: 'standalone', detectedAt }
		});
		assert.equal(groups.length, 2);
		assert.ok(groups.every((group) => group.kind === 'environment'));
	});
});

describe('cluster navigation wiring', () => {
	it('groups dashboard and selector entries while keeping node links in manager context', () => {
		const selector = readFileSync(new URL('../src/lib/components/host-info.svelte', import.meta.url), 'utf8');
		const dashboard = readFileSync(new URL('../src/routes/+page.svelte', import.meta.url), 'utf8');
		const swarmPage = readFileSync(new URL('../src/routes/swarm/+page.svelte', import.meta.url), 'utf8');
		const swarmStore = readFileSync(new URL('../src/lib/stores/swarm.ts', import.meta.url), 'utf8');
		const sidebar = readFileSync(new URL('../src/lib/components/app-sidebar.svelte', import.meta.url), 'utf8');

		assert.match(selector, /groupEnvironments\(envList, \$swarmEnvironmentCapabilities\.capabilities\)/);
		assert.doesNotMatch(selector, /openSwarmNode/);
		assert.doesNotMatch(selector, /#each group\.nodes as node/);
		assert.doesNotMatch(selector, /switchEnvironment\(node\.environment\.id\)/);
		assert.doesNotMatch(selector, /endpoint for node-local Docker views/);
		assert.match(dashboard, /goto\(tile\.cluster \? '\/swarm\?tab=overview'/);
		assert.match(dashboard, /const displayTiles[^=]*= \$derived\.by/);
		assert.match(swarmPage, /swarmManagerEnvironmentId\(environmentGroups, selectedId\)/);
		assert.match(swarmPage, /if \(nextId === environmentId\) return/);
		assert.match(swarmPage, /title=\{activeCluster\?\.name \?\? 'Docker Swarm'\}/);
		assert.match(swarmPage, /#each visibleNodes as node/);
		assert.match(swarmPage, /href=\{detailHref\('node', node\.id\)\}/);
		assert.match(swarmStore, /fetch\(`\/api\/swarm\?env=\$\{environmentId\}`\)/);
		assert.match(swarmStore, /if \(requestId !== requestSequence\) return/);
		assert.match(swarmStore, /swarmManagerEnvironmentId\([\s\S]*selected\?\.id/);
		assert.match(swarmStore, /currentEnvironment\.set\(\{ id: logicalEnvironment\.id, name: logicalEnvironment\.name \}\)/);
		assert.match(sidebar, /activeEnvironmentGroup\?\.kind === 'swarm-cluster'/);
	});
});
