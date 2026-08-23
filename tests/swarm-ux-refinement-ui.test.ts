import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { describe, it } from 'node:test';

const swarmPage = readFileSync(new URL('../src/routes/swarm/+page.svelte', import.meta.url), 'utf8');
const stacksPage = readFileSync(new URL('../src/routes/stacks/+page.svelte', import.meta.url), 'utf8');
const templatesPage = readFileSync(new URL('../src/routes/templates/+page.svelte', import.meta.url), 'utf8');
const sidebar = readFileSync(new URL('../src/lib/components/app-sidebar.svelte', import.meta.url), 'utf8');

describe('Swarm UX refinement UI gates', () => {
	it('renders the replicated scale control with decrement, value, increment and Apply/Cancel', () => {
		assert.match(swarmPage, /canScaleSwarmService\(selectedService\.mode\).*?>.*?Scale/s);
		assert.match(swarmPage, /aria-label="Decrease replicas"/);
		assert.match(swarmPage, /aria-label="Desired replicas"/);
		assert.match(swarmPage, /aria-label="Increase replicas"/);
		assert.match(swarmPage, />Cancel<\/Button>/);
		assert.match(swarmPage, /actionType === 'scale' \? 'Apply'/);
	});

	it('explains global mode and does not make it scaleable', () => {
		assert.match(swarmPage, /selectedService\.mode === 'global'.*?One task per eligible node/s);
		assert.doesNotMatch(swarmPage, /canScaleSwarmService\([^)]*\).*?global/);
	});

	it('binds capability warnings and Swarm navigation to the active environment', () => {
		assert.match(stacksPage, /capabilityForEnvironment\(\$swarmCapability, \$currentEnvironment\?\.id\)/);
		assert.ok(stacksPage.indexOf('{#if composeCapabilityLoading}') < stacksPage.indexOf("composeCapability?.kind === 'swarm-manager'"));
		assert.doesNotMatch(templatesPage, /\$swarmCapability\.capability\?\.kind/);
		assert.doesNotMatch(sidebar, /isSwarmEnvironment\(\$swarmCapability\.capability\)/);
	});
});
