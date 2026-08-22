<svelte:head>
	<title>Swarm - Dockhand</title>
</svelte:head>

<script lang="ts">
	import { onMount } from 'svelte';
	import { Network, RefreshCw, Loader2, TriangleAlert, Server, ShieldAlert } from 'lucide-svelte';
	import type { Component } from 'svelte';
	import { Button } from '$lib/components/ui/button';
	import { Badge } from '$lib/components/ui/badge';
	import * as Alert from '$lib/components/ui/alert';
	import * as Card from '$lib/components/ui/card';
	import * as Table from '$lib/components/ui/table';
	import * as Tabs from '$lib/components/ui/tabs';
	import { NoEnvironment } from '$lib/components/ui/empty-state';
	import PageHeader from '$lib/components/PageHeader.svelte';
	import SwarmBadge from '$lib/components/SwarmBadge.svelte';
	import { currentEnvironment } from '$lib/stores/environment';
	import { swarmCapability } from '$lib/stores/swarm';
	import type { SwarmReadModel } from '$lib/types/swarm';

	const POLL_INTERVAL_MS = 30_000;
	const SwarmIcon = Network as unknown as Component;

	let environmentId = $state<number | null>(null);
	let activeTab = $state('overview');
	let data = $state<SwarmReadModel | null>(null);
	let loading = $state(false);
	let refreshing = $state(false);
	let error = $state<string | null>(null);
	let requestSequence = 0;

	async function load(refresh = false): Promise<void> {
		if (!environmentId) return;
		const requestId = ++requestSequence;
		if (data) refreshing = true;
		else loading = true;
		error = null;

		try {
			const query = new URLSearchParams({ env: String(environmentId) });
			if (refresh) query.set('refresh', 'true');
			const response = await fetch(`/api/swarm?${query}`);
			const body = await response.json();
			if (!response.ok) throw new Error(body.error || 'Failed to load Swarm data');
			if (requestId !== requestSequence) return;
			data = body;
			swarmCapability.setCapability(environmentId, body.capability);
		} catch (loadError) {
			if (requestId !== requestSequence) return;
			error = loadError instanceof Error ? loadError.message : 'Failed to load Swarm data';
		} finally {
			if (requestId === requestSequence) {
				loading = false;
				refreshing = false;
			}
		}
	}

	function formatBytes(value: number | undefined): string {
		if (!value) return '—';
		const units = ['B', 'KB', 'MB', 'GB', 'TB'];
		let size = value;
		let unit = 0;
		while (size >= 1024 && unit < units.length - 1) {
			size /= 1024;
			unit++;
		}
		return `${size.toFixed(unit === 0 ? 0 : 1)} ${units[unit]}`;
	}

	function formatCpu(nanoCpus: number | undefined): string {
		return nanoCpus ? `${(nanoCpus / 1_000_000_000).toFixed(1)} CPU` : '—';
	}

	function serviceName(serviceId: string | undefined): string {
		return data?.services.find((service) => service.id === serviceId)?.name ?? serviceId?.slice(0, 12) ?? '—';
	}

	function nodeName(nodeId: string | undefined): string {
		return data?.nodes.find((node) => node.id === nodeId)?.hostname ?? nodeId?.slice(0, 12) ?? 'Unassigned';
	}

	onMount(() => {
		const unsubscribe = currentEnvironment.subscribe((environment) => {
			const nextId = environment?.id ?? null;
			if (nextId === environmentId) return;
			environmentId = nextId;
			data = null;
			error = null;
			requestSequence++;
			if (nextId) void load(true);
		});
		const interval = setInterval(() => {
			if (environmentId && !loading && !refreshing) void load(false);
		}, POLL_INTERVAL_MS);

		return () => {
			unsubscribe();
			clearInterval(interval);
			requestSequence++;
		};
	});
</script>

<div class="h-full min-h-0 flex flex-col gap-4 p-4 md:p-6">
	<div class="flex items-center justify-between gap-3">
		<PageHeader icon={SwarmIcon} title="Docker Swarm" showConnection={false}>
			{#if data?.capability}
				<SwarmBadge capability={data.capability} />
			{/if}
		</PageHeader>
		{#if environmentId}
			<Button variant="outline" size="sm" onclick={() => load(true)} disabled={loading || refreshing}>
				<RefreshCw class="h-4 w-4 {refreshing ? 'animate-spin' : ''}" />
				Refresh
			</Button>
		{/if}
	</div>

	{#if !environmentId}
		<NoEnvironment />
	{:else if loading && !data}
		<div class="flex flex-1 items-center justify-center text-muted-foreground">
			<Loader2 class="mr-2 h-5 w-5 animate-spin" /> Detecting Swarm capability…
		</div>
	{:else if error && !data}
		<Alert.Root variant="destructive">
			<TriangleAlert class="h-4 w-4" />
			<Alert.Title>Unable to load Swarm data</Alert.Title>
			<Alert.Description>{error}</Alert.Description>
		</Alert.Root>
	{:else if data?.capability.kind === 'swarm-worker'}
		<Alert.Root>
			<ShieldAlert class="h-4 w-4" />
			<Alert.Title>Manager endpoint required</Alert.Title>
			<Alert.Description>
				This environment is connected to a Swarm worker. Dockhand will not offer cluster reads through a worker or redirect to an advertised manager. Add a manager as a separate environment to view nodes, services, and tasks.
			</Alert.Description>
		</Alert.Root>
		<Card.Root>
			<Card.Header>
				<Card.Title class="text-base">Worker identity</Card.Title>
			</Card.Header>
			<Card.Content class="grid gap-3 text-sm sm:grid-cols-2">
				<div><span class="text-muted-foreground">Node ID</span><p class="font-mono break-all">{data.capability.nodeId ?? 'Unavailable'}</p></div>
				<div><span class="text-muted-foreground">Node address</span><p>{data.capability.nodeAddress ?? 'Unavailable'}</p></div>
				<div class="sm:col-span-2"><span class="text-muted-foreground">Advertised managers</span><p>{data.capability.managerAddresses?.join(', ') || 'Unavailable'}</p></div>
			</Card.Content>
		</Card.Root>
	{:else if data?.capability.kind === 'standalone'}
		<Alert.Root>
			<Network class="h-4 w-4" />
			<Alert.Title>Standalone Docker environment</Alert.Title>
			<Alert.Description>This Engine is not participating in a Swarm. Existing Containers and Compose Stacks remain available in their current views.</Alert.Description>
		</Alert.Root>
	{:else if data?.capability.kind === 'swarm-unavailable'}
		<Alert.Root variant="destructive">
			<TriangleAlert class="h-4 w-4" />
			<Alert.Title>Swarm is unavailable</Alert.Title>
			<Alert.Description>Local node state: {data.capability.localNodeState ?? 'unknown'}. {data.capability.error ?? ''}</Alert.Description>
		</Alert.Root>
	{:else if data?.capability.kind === 'unknown'}
		<Alert.Root variant="destructive">
			<TriangleAlert class="h-4 w-4" />
			<Alert.Title>Swarm capability is unknown</Alert.Title>
			<Alert.Description>{data.capability.error ?? 'Docker did not return enough information to classify this environment.'}</Alert.Description>
		</Alert.Root>
	{:else if data?.capability.kind === 'swarm-manager' && data.cluster}
		{#if error}
			<Alert.Root variant="destructive">
				<TriangleAlert class="h-4 w-4" />
				<Alert.Description>{error}. Showing the last successful response.</Alert.Description>
			</Alert.Root>
		{/if}

		<Tabs.Root value={activeTab} onValueChange={(value) => activeTab = value} class="flex min-h-0 flex-1 flex-col gap-3">
			<Tabs.List class="w-fit">
				<Tabs.Trigger value="overview">Overview</Tabs.Trigger>
				<Tabs.Trigger value="nodes">Nodes ({data.nodes.length})</Tabs.Trigger>
				<Tabs.Trigger value="services">Services ({data.services.length})</Tabs.Trigger>
				<Tabs.Trigger value="tasks">Tasks ({data.tasks.length})</Tabs.Trigger>
			</Tabs.List>

			<Tabs.Content value="overview" class="space-y-4 overflow-auto">
				<div class="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
					<Card.Root><Card.Header class="pb-2"><Card.Description>Nodes ready</Card.Description><Card.Title>{data.cluster.health.readyNodes} / {data.cluster.health.nodes}</Card.Title></Card.Header></Card.Root>
					<Card.Root><Card.Header class="pb-2"><Card.Description>Managers reachable</Card.Description><Card.Title>{data.cluster.health.reachableManagers} / {data.cluster.health.managers}</Card.Title></Card.Header></Card.Root>
					<Card.Root><Card.Header class="pb-2"><Card.Description>Services</Card.Description><Card.Title>{data.cluster.health.services}</Card.Title></Card.Header></Card.Root>
					<Card.Root><Card.Header class="pb-2"><Card.Description>Running tasks</Card.Description><Card.Title>{data.cluster.health.runningTasks}</Card.Title></Card.Header></Card.Root>
				</div>
				<Card.Root>
					<Card.Header><Card.Title class="text-base">Cluster information</Card.Title></Card.Header>
					<Card.Content class="grid gap-3 text-sm sm:grid-cols-2 xl:grid-cols-3">
						<div><span class="text-muted-foreground">Cluster ID</span><p class="font-mono break-all">{data.cluster.id}</p></div>
						<div><span class="text-muted-foreground">Name</span><p>{data.cluster.name ?? 'Unnamed cluster'}</p></div>
						<div><span class="text-muted-foreground">API version</span><p>{data.capability.apiVersion ?? 'Unknown'}</p></div>
						<div><span class="text-muted-foreground">Node ID</span><p class="font-mono break-all">{data.capability.nodeId ?? 'Unknown'}</p></div>
						<div><span class="text-muted-foreground">Node address</span><p>{data.capability.nodeAddress ?? 'Unknown'}</p></div>
						<div><span class="text-muted-foreground">Data path port</span><p>{data.cluster.dataPathPort ?? 'Default'}</p></div>
					</Card.Content>
				</Card.Root>
			</Tabs.Content>

			<Tabs.Content value="nodes" class="min-h-0 overflow-auto rounded-md border">
				<Table.Root>
					<Table.Header><Table.Row><Table.Head>Node</Table.Head><Table.Head>Role</Table.Head><Table.Head>Availability</Table.Head><Table.Head>Status</Table.Head><Table.Head>Manager</Table.Head><Table.Head>Engine</Table.Head><Table.Head>Resources</Table.Head></Table.Row></Table.Header>
					<Table.Body>
						{#each data.nodes as node (node.id)}
							<Table.Row>
								<Table.Cell><div class="font-medium">{node.hostname}</div><div class="text-xs text-muted-foreground font-mono">{node.address ?? node.id.slice(0, 12)}</div></Table.Cell>
								<Table.Cell class="capitalize">{node.role}</Table.Cell>
								<Table.Cell><Badge variant="outline" class="capitalize">{node.availability}</Badge></Table.Cell>
								<Table.Cell><Badge variant={node.status === 'ready' ? 'secondary' : 'destructive'} class="capitalize">{node.status}</Badge></Table.Cell>
								<Table.Cell>{node.managerStatus?.leader ? 'Leader' : node.managerStatus?.reachability ?? '—'}</Table.Cell>
								<Table.Cell>{node.engineVersion ?? '—'}<div class="text-xs text-muted-foreground">{node.platform?.os ?? ''} {node.platform?.architecture ?? ''}</div></Table.Cell>
								<Table.Cell>{formatCpu(node.resources?.nanoCpus)}<div class="text-xs text-muted-foreground">{formatBytes(node.resources?.memoryBytes)}</div></Table.Cell>
							</Table.Row>
						{/each}
					</Table.Body>
				</Table.Root>
			</Tabs.Content>

			<Tabs.Content value="services" class="min-h-0 overflow-auto rounded-md border">
				<Table.Root>
					<Table.Header><Table.Row><Table.Head>Service</Table.Head><Table.Head>Image</Table.Head><Table.Head>Mode</Table.Head><Table.Head>Tasks</Table.Head><Table.Head>Update state</Table.Head><Table.Head>Placement</Table.Head></Table.Row></Table.Header>
					<Table.Body>
						{#each data.services as service (service.id)}
							<Table.Row>
								<Table.Cell><div class="font-medium">{service.name}</div><div class="text-xs text-muted-foreground font-mono">{service.id.slice(0, 12)}</div></Table.Cell>
								<Table.Cell class="max-w-[28rem] truncate font-mono text-xs" title={service.image}>{service.image ?? '—'}</Table.Cell>
								<Table.Cell class="capitalize">{service.mode.replace('-', ' ')}</Table.Cell>
								<Table.Cell>{service.runningTasks} / {service.desiredTasks ?? '—'}{#if service.completedTasks > 0}<div class="text-xs text-muted-foreground">{service.completedTasks} complete</div>{/if}</Table.Cell>
								<Table.Cell class="capitalize">{service.updateStatus?.state ?? '—'}</Table.Cell>
								<Table.Cell class="max-w-[22rem] text-xs">{service.constraints.join(', ') || 'No constraints'}</Table.Cell>
							</Table.Row>
						{/each}
					</Table.Body>
				</Table.Root>
			</Tabs.Content>

			<Tabs.Content value="tasks" class="min-h-0 overflow-auto rounded-md border">
				<Table.Root>
					<Table.Header><Table.Row><Table.Head>Task</Table.Head><Table.Head>Service</Table.Head><Table.Head>Node</Table.Head><Table.Head>Desired</Table.Head><Table.Head>Current</Table.Head><Table.Head>Message</Table.Head></Table.Row></Table.Header>
					<Table.Body>
						{#each data.tasks as task (task.id)}
							<Table.Row>
								<Table.Cell><div class="font-medium">{task.name ?? task.id.slice(0, 12)}</div>{#if task.slot}<div class="text-xs text-muted-foreground">Slot {task.slot}</div>{/if}</Table.Cell>
								<Table.Cell>{serviceName(task.serviceId)}</Table.Cell>
								<Table.Cell>{nodeName(task.nodeId)}</Table.Cell>
								<Table.Cell class="capitalize">{task.desiredState ?? '—'}</Table.Cell>
								<Table.Cell><Badge variant={task.state === 'running' ? 'secondary' : 'outline'} class="capitalize">{task.state ?? 'unknown'}</Badge></Table.Cell>
								<Table.Cell class="max-w-[28rem] text-xs"><span class={task.error ? 'text-destructive' : 'text-muted-foreground'}>{task.error || task.message || '—'}</span></Table.Cell>
							</Table.Row>
						{/each}
					</Table.Body>
				</Table.Root>
			</Tabs.Content>
		</Tabs.Root>
	{:else}
		<div class="flex flex-1 items-center justify-center text-muted-foreground">
			<Server class="mr-2 h-5 w-5" /> No Swarm data available.
		</div>
	{/if}
</div>
