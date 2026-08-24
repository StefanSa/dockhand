import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { describe, it } from 'node:test';

const source = (path: string) => readFileSync(new URL(path, import.meta.url), 'utf8');

const badge = source('../src/lib/components/SwarmBadge.svelte');
const dashboard = source('../src/routes/+page.svelte');
const dashboardStream = source('../src/routes/api/dashboard/stats/stream/+server.ts');
const dashboardTile = source('../src/routes/dashboard/EnvironmentTile.svelte');
const dashboardList = source('../src/routes/dashboard/EnvironmentListView.svelte');
const environmentsTab = source('../src/routes/settings/environments/EnvironmentsTab.svelte');

describe('environment capability and connection feedback UI', () => {
	it('labels manager, worker, and standalone from detected capability data', () => {
		assert.match(badge, /capability\?\.kind === 'swarm-manager'.*?'Swarm Manager'/s);
		assert.match(badge, /capability\?\.kind === 'swarm-worker'.*?'Swarm Worker'/s);
		assert.match(badge, /capability\?\.kind === 'standalone'.*?'Standalone Docker'/s);
		assert.doesNotMatch(badge, /environment.*name/i);
	});

	it('shows capability badges in dashboard cards, dashboard list, and environment settings', () => {
		assert.match(dashboardTile, /<SwarmBadge capability=\{stats\.swarm\} compact \/>/);
		assert.match(dashboardList, /<SwarmBadge capability=\{s\.swarm\} \/>/);
		assert.match(environmentsTab, /<SwarmBadge capability=\{swarmCapabilities\[env\.id\]\} \/>/);
	});

	it('refreshes dashboard and settings capabilities from live detection', () => {
		assert.match(dashboardStream, /getSwarmCapability\(env\.id, refreshCapabilities\)/);
		assert.match(dashboard, /stats\/stream\?refreshCapabilities=true/);
		assert.match(environmentsTab, /capabilities\?refresh=\$\{refresh\}/);
		assert.match(environmentsTab, /onclick=\{\(\) => fetchEnvironments\(true\)\}/);
	});

	it('reports explicit connection tests while keeping automatic tests silent', () => {
		assert.match(environmentsTab, /toast\.success\(`\$\{environmentName\} connected`\)/);
		assert.match(environmentsTab, /toast\.success\(`\$\{connected\}\/\$\{environments\.length\} environments connected`\)/);
		assert.match(environmentsTab, /toast\.error\(`\$\{connected\}\/\$\{environments\.length\} environments connected; \$\{environments\.length - connected\} failed`\)/);
		assert.match(environmentsTab, /testConnection\(id, false\)/);
		assert.match(environmentsTab, /testAllConnections\(false\)/);
	});
});
