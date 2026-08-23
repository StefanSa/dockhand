import type { SwarmReadModel } from '$lib/types/swarm';

export type SwarmTab = 'overview' | 'nodes' | 'services' | 'tasks' | 'stacks' | 'configs' | 'secrets';
export type SwarmDetailKind = 'node' | 'service' | 'task' | 'stack' | 'config' | 'secret';

export interface SwarmDetailLocation {
	kind: SwarmDetailKind;
	id: string;
	tab: SwarmTab;
}

export const SWARM_TABS: SwarmTab[] = ['overview', 'nodes', 'services', 'tasks', 'stacks', 'configs', 'secrets'];

const DETAIL_TABS: Record<SwarmDetailKind, SwarmTab> = {
	node: 'nodes',
	service: 'services',
	task: 'tasks',
	stack: 'stacks',
	config: 'configs',
	secret: 'secrets'
};

export function swarmTabHref(tab: SwarmTab): string {
	return `/swarm?${new URLSearchParams({ tab })}`;
}

export function swarmDetailHref(kind: SwarmDetailKind, id: string): string {
	return `/swarm?${new URLSearchParams({ tab: DETAIL_TABS[kind], resource: kind, id })}`;
}

export function parseSwarmDetail(searchParams: URLSearchParams): SwarmDetailLocation | null {
	const kind = searchParams.get('resource');
	const id = searchParams.get('id')?.trim();
	if (!id || !kind || !(kind in DETAIL_TABS)) return null;
	return { kind: kind as SwarmDetailKind, id, tab: DETAIL_TABS[kind as SwarmDetailKind] };
}

export function isSwarmDetailAvailable(model: SwarmReadModel, detail: SwarmDetailLocation): boolean {
	switch (detail.kind) {
		case 'node': return model.nodes.some((node) => node.id === detail.id);
		case 'service': return model.services.some((service) => service.id === detail.id);
		case 'task': return model.tasks.some((task) => task.id === detail.id);
		case 'stack': return model.stacks.some((stack) => stack.name === detail.id);
		case 'config': return model.configs.some((config) => config.id === detail.id);
		case 'secret': return model.secrets.some((secret) => secret.id === detail.id);
	}
}
