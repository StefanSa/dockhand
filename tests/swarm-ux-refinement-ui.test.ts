import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { describe, it } from 'node:test';

const swarmPage = readFileSync(new URL('../src/routes/swarm/+page.svelte', import.meta.url), 'utf8');
const stacksPage = readFileSync(new URL('../src/routes/stacks/+page.svelte', import.meta.url), 'utf8');
const templatesPage = readFileSync(new URL('../src/routes/templates/+page.svelte', import.meta.url), 'utf8');
const sidebar = readFileSync(new URL('../src/lib/components/app-sidebar.svelte', import.meta.url), 'utf8');
const capabilityStore = readFileSync(new URL('../src/lib/stores/swarm-capability.ts', import.meta.url), 'utf8');
const swarmStore = readFileSync(new URL('../src/lib/stores/swarm.ts', import.meta.url), 'utf8');
const serviceEditor = readFileSync(new URL('../src/routes/swarm/SwarmServiceEditorModal.svelte', import.meta.url), 'utf8');

describe('Swarm UX refinement UI gates', () => {
	it('renders direct compact replicated scale controls and an explicit pending target', () => {
		assert.match(swarmPage, /scaleServiceBy\(service, -1\)/);
		assert.match(swarmPage, /scaleServiceBy\(service, 1\)/);
		assert.match(swarmPage, /aria-label={`Scale \$\{service\.name\} down`}/);
		assert.match(swarmPage, /aria-label={`Scale \$\{service\.name\} up`}/);
		assert.match(swarmPage, /Pending target/);
		assert.match(swarmPage, /Reconciling/);
		assert.match(swarmPage, /serviceTaskError\(service\.id\)/);
		assert.match(swarmPage, /serviceTaskError\(selectedService\.id\)/);
	});

	it('explains global mode and does not make it scaleable', () => {
		assert.match(swarmPage, /selectedService\.mode === 'global'.*?One task per eligible node/s);
		assert.doesNotMatch(swarmPage, /canScaleSwarmService\([^)]*\).*?global/);
		assert.match(swarmPage, /no manual scale/);
	});

	it('allows explicit stack-managed edits with a visible source-of-truth drift warning', () => {
		assert.match(swarmPage, /Stack-managed service/);
		assert.match(swarmPage, /stored definition.*?source of truth/s);
		assert.doesNotMatch(swarmPage, /function openServiceEditor\(service[^}]+isStackManagedSwarmService\(service\)/);
		assert.match(serviceEditor, /Live edit may drift from stack/);
		assert.match(serviceEditor, /will not change the stored stack file/);
		assert.match(serviceEditor, /swarmDetailHref\('stack', service\.stackName\)/);
		assert.match(swarmPage, /disabled=\{resourcePending \|\| Boolean\(usage\.stackName\)\}/);
	});

	it('offers the complete ServiceUpdate editor for replicated and global services', () => {
		assert.match(swarmPage, /openServiceEditor\(service/);
		assert.match(serviceEditor, /action: 'update'/);
		for (const label of [
			'Image', 'Desired replicas', 'Command', 'Arguments', 'Environment', 'Service labels', 'Healthcheck', 'Published ports',
			'Overlay networks', 'Mounts', 'Configs', 'Secrets', 'Placement constraints', 'CPU limit',
			'Restart condition', 'Update policy', 'Rollback policy'
		]) assert.match(serviceEditor, new RegExp(label));
		assert.match(serviceEditor, /serviceMode === 'replicated'/);
		assert.match(serviceEditor, /bind:value=\{serviceMode\}/);
		assert.match(serviceEditor, /Docker Engine cannot change a service mode through ServiceUpdate/);
		assert.match(serviceEditor, /Read-only/);
		assert.match(serviceEditor, /<Command\.Input placeholder="Search networks\.\.\."/);
		assert.match(serviceEditor, /Aliases for/);
		assert.match(serviceEditor, /<Command\.Input placeholder="Search Configs\.\.\."/);
		assert.match(serviceEditor, /<Command\.Input placeholder="Search Secrets\.\.\."/);
		assert.match(serviceEditor, /Assigned networks/);
		assert.match(serviceEditor, /Assigned Configs/);
		assert.match(serviceEditor, /Assigned Secrets/);
		assert.doesNotMatch(serviceEditor, /toggleNetwork|toggleResource/);
		assert.doesNotMatch(serviceEditor, /secret\.data|secretValue|Spec\.Data/);
	});

	it('keeps the shared service editor interactive for proxied read-model data', () => {
		assert.doesNotMatch(serviceEditor, /structuredClone/);
		assert.match(serviceEditor, /current\.ports\.map\(\(port\) => \(\{ \.\.\.port \}\)\)/);
		assert.match(serviceEditor, /<Tabs\.Root bind:value=\{activeTab\}/);
		assert.match(serviceEditor, /<Dialog\.Root bind:open>/);
		assert.match(serviceEditor, /onclick=\{\(\) => open = false\}[^>]*>Cancel/);
	});

	it('offers manager-only standalone service creation through the shared editor', () => {
		assert.match(swarmPage, /capability\.kind === 'swarm-manager'[\s\S]*?\$canAccess\('swarm', 'update'\)[\s\S]*?Create service/);
		assert.match(swarmPage, /openCreateServiceEditor/);
		assert.match(serviceEditor, /mode === 'create'/);
		assert.match(serviceEditor, /\/api\/swarm\/services\?env=/);
		assert.match(serviceEditor, /Service name/);
		assert.match(serviceEditor, /value="global">Global/);
		assert.match(swarmPage, /openDeleteServiceDialog\(service\)/);
		assert.match(swarmPage, /if \(isStackManagedSwarmService\(service\)\) return/);
	});

	it('uses real anchors for Service to Task to Node deep links', () => {
		assert.match(swarmPage, /href=\{detailHref\('task', task\.id\)\}/);
		assert.match(swarmPage, /href=\{detailHref\('node', task\.nodeId\)\}/);
		assert.match(swarmPage, /href=\{detailHref\('service', selectedTaskService\.id\)\}/);
		assert.match(swarmPage, /href=\{detailHref\('node', selectedTaskNode\.id\)\}/);
		assert.match(swarmPage, /Networks \(\{selectedService\.networks\.length\}\)/);
		assert.match(swarmPage, /serviceNetworkName\(network\.target\)/);
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
