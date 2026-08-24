import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { describe, it } from 'node:test';

const swarmPage = readFileSync(new URL('../src/routes/swarm/+page.svelte', import.meta.url), 'utf8');
const stacksPage = readFileSync(new URL('../src/routes/stacks/+page.svelte', import.meta.url), 'utf8');
const templatesPage = readFileSync(new URL('../src/routes/templates/+page.svelte', import.meta.url), 'utf8');
const sidebar = readFileSync(new URL('../src/lib/components/app-sidebar.svelte', import.meta.url), 'utf8');
const capabilityStore = readFileSync(new URL('../src/lib/stores/swarm-capability.ts', import.meta.url), 'utf8');
const swarmStore = readFileSync(new URL('../src/lib/stores/swarm.ts', import.meta.url), 'utf8');

describe('Swarm UX refinement UI gates', () => {
	it('renders direct compact replicated scale controls and an explicit pending target', () => {
		assert.match(swarmPage, /scaleServiceBy\(service, -1\)/);
		assert.match(swarmPage, /scaleServiceBy\(service, 1\)/);
		assert.match(swarmPage, /aria-label={`Scale \$\{service\.name\} down`}/);
		assert.match(swarmPage, /aria-label={`Scale \$\{service\.name\} up`}/);
		assert.match(swarmPage, /Pending target/);
		assert.match(swarmPage, /Reconciling/);
	});

	it('explains global mode and does not make it scaleable', () => {
		assert.match(swarmPage, /selectedService\.mode === 'global'.*?One task per eligible node/s);
		assert.doesNotMatch(swarmPage, /canScaleSwarmService\([^)]*\).*?global/);
		assert.match(swarmPage, /no manual scale/);
	});

	it('keeps stack-managed services read-only and directs mutations to the stack source of truth', () => {
		assert.match(swarmPage, /Stack-managed service/);
		assert.match(swarmPage, /stored definition.*?source of truth/s);
		assert.match(swarmPage, /!isStackManagedSwarmService\(service\)/);
		assert.match(swarmPage, /disabled=\{resourcePending \|\| Boolean\(usage\.stackName\)\}/);
	});

	it('uses real anchors for Service to Task to Node deep links', () => {
		assert.match(swarmPage, /href=\{detailHref\('task', task\.id\)\}/);
		assert.match(swarmPage, /href=\{detailHref\('node', task\.nodeId\)\}/);
		assert.match(swarmPage, /href=\{detailHref\('service', selectedTaskService\.id\)\}/);
		assert.match(swarmPage, /href=\{detailHref\('node', selectedTaskNode\.id\)\}/);
	});

	it('binds capability warnings and Swarm navigation to the active environment', () => {
		assert.match(stacksPage, /capabilityForEnvironment\(\$swarmCapability, \$currentEnvironment\?\.id\)/);
		assert.ok(stacksPage.indexOf('{#if composeCapabilityLoading}') < stacksPage.indexOf("composeCapability?.kind === 'swarm-manager'"));
		assert.doesNotMatch(templatesPage, /\$swarmCapability\.capability\?\.kind/);
		assert.doesNotMatch(sidebar, /isSwarmEnvironment\(\$swarmCapability\.capability\)/);
		assert.doesNotMatch(capabilityStore, /state\.loading \|\| state\.environmentId/);
		assert.match(swarmStore, /dockhand:swarm-capability:v1:/);
	});
});
