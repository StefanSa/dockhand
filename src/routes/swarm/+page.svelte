<svelte:head>
	<title>Swarm - Dockhand</title>
</svelte:head>

<script lang="ts">
	import { onMount } from 'svelte';
	import { Network, RefreshCw, Loader2, TriangleAlert, Server, ShieldAlert, RotateCw, SlidersHorizontal, Layers, Plus, Pencil, Trash2 } from 'lucide-svelte';
	import type { Component } from 'svelte';
	import { toast } from 'svelte-sonner';
	import { Button } from '$lib/components/ui/button';
	import { Badge } from '$lib/components/ui/badge';
	import { Input } from '$lib/components/ui/input';
	import { Label } from '$lib/components/ui/label';
	import { Checkbox } from '$lib/components/ui/checkbox';
	import * as Alert from '$lib/components/ui/alert';
	import * as Card from '$lib/components/ui/card';
	import * as Dialog from '$lib/components/ui/dialog';
	import * as Table from '$lib/components/ui/table';
	import * as Tabs from '$lib/components/ui/tabs';
	import { NoEnvironment } from '$lib/components/ui/empty-state';
	import PageHeader from '$lib/components/PageHeader.svelte';
	import SwarmBadge from '$lib/components/SwarmBadge.svelte';
	import CodeEditor from '$lib/components/CodeEditor.svelte';
	import { currentEnvironment } from '$lib/stores/environment';
	import { canAccess } from '$lib/stores/auth';
	import { swarmCapability } from '$lib/stores/swarm';
	import type { SwarmReadModel, SwarmServiceSummary, SwarmStackSummary } from '$lib/types/swarm';

	const POLL_INTERVAL_MS = 30_000;
	const SwarmIcon = Network as unknown as Component;

	let environmentId = $state<number | null>(null);
	let activeTab = $state('overview');
	let data = $state<SwarmReadModel | null>(null);
	let loading = $state(false);
	let refreshing = $state(false);
	let error = $state<string | null>(null);
	let requestSequence = 0;
	let actionDialogOpen = $state(false);
	let actionService = $state<SwarmServiceSummary | null>(null);
	let actionType = $state<'scale' | 'force-update'>('scale');
	let scaleReplicas = $state('');
	let actionPending = $state(false);
	let actionError = $state<string | null>(null);
	let stackDialogOpen = $state(false);
	let stackEditing = $state(false);
	let stackName = $state('');
	let stackCompose = $state('');
	let stackPending = $state(false);
	let stackError = $state<string | null>(null);
	let removeStackDialogOpen = $state(false);
	let removeStackName = $state('');
	let removeStackFiles = $state(false);

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

	function openScaleDialog(service: SwarmServiceSummary): void {
		actionService = service;
		actionType = 'scale';
		scaleReplicas = String(service.desiredTasks ?? 0);
		actionError = null;
		actionDialogOpen = true;
	}

	function openForceUpdateDialog(service: SwarmServiceSummary): void {
		actionService = service;
		actionType = 'force-update';
		actionError = null;
		actionDialogOpen = true;
	}

	function closeActionDialog(): void {
		if (actionPending) return;
		actionDialogOpen = false;
		actionService = null;
		actionError = null;
	}

	async function confirmServiceAction(): Promise<void> {
		if (!environmentId || !actionService || actionPending) return;
		const replicas = Number(scaleReplicas);
		if (actionType === 'scale' && (!Number.isSafeInteger(replicas) || replicas < 0)) {
			actionError = 'Replicas must be a non-negative integer.';
			return;
		}

		actionPending = true;
		actionError = null;
		try {
			const response = await fetch(`/api/swarm/services/${encodeURIComponent(actionService.id)}?env=${environmentId}`, {
				method: 'POST',
				headers: { 'Content-Type': 'application/json' },
				body: JSON.stringify(actionType === 'scale'
					? { action: 'scale', replicas }
					: { action: 'force-update' })
			});
			const body = await response.json().catch(() => ({}));
			if (!response.ok) throw new Error(body.error || 'Failed to update Swarm service');

			const serviceName = actionService.name;
			actionDialogOpen = false;
			actionService = null;
			toast.success(actionType === 'scale'
				? `${serviceName} desired replicas set to ${replicas}`
				: `${serviceName} restart requested`);
			if (Array.isArray(body.warnings) && body.warnings.length > 0) {
				toast.warning(body.warnings.join(' '));
			}
			await load(true);
		} catch (actionFailure) {
			actionError = actionFailure instanceof Error ? actionFailure.message : 'Failed to update Swarm service';
			toast.error(actionError);
		} finally {
			actionPending = false;
		}
	}

	function openCreateStackDialog(): void {
		stackEditing = false;
		stackName = '';
		stackCompose = 'services:\n  web:\n    image: nginx:alpine\n    deploy:\n      replicas: 1\n';
		stackError = null;
		stackDialogOpen = true;
	}

	async function openEditStackDialog(stack: SwarmStackSummary): Promise<void> {
		if (!environmentId || stackPending) return;
		stackEditing = true;
		stackName = stack.name;
		stackCompose = '';
		stackError = null;
		stackDialogOpen = true;
		stackPending = true;
		try {
			const response = await fetch(`/api/swarm/stacks/${encodeURIComponent(stack.name)}?env=${environmentId}`);
			const body = await response.json().catch(() => ({}));
			if (!response.ok) {
				if (response.status === 404) {
					stackError = 'This stack was discovered from Swarm labels, but Dockhand has no stored file. Paste the complete stack file to adopt and redeploy it.';
					return;
				}
				throw new Error(body.error || 'Failed to load Swarm stack file');
			}
			stackCompose = body.compose;
		} catch (loadFailure) {
			stackError = loadFailure instanceof Error ? loadFailure.message : 'Failed to load Swarm stack file';
		} finally {
			stackPending = false;
		}
	}

	function closeStackDialog(): void {
		if (stackPending) return;
		stackDialogOpen = false;
		stackError = null;
	}

	async function deployStack(): Promise<void> {
		if (!environmentId || stackPending) return;
		stackPending = true;
		stackError = null;
		try {
			const response = await fetch(`/api/swarm/stacks/${encodeURIComponent(stackName.trim())}?env=${environmentId}`, {
				method: 'PUT',
				headers: { 'Content-Type': 'application/json' },
				body: JSON.stringify({ compose: stackCompose })
			});
			const body = await response.json().catch(() => ({}));
			if (!response.ok) throw new Error(body.error || 'Failed to deploy Swarm stack');
			stackDialogOpen = false;
			toast.success(`Swarm stack ${body.name} deployed`);
			await load(true);
			activeTab = 'stacks';
		} catch (deployFailure) {
			stackError = deployFailure instanceof Error ? deployFailure.message : 'Failed to deploy Swarm stack';
			toast.error(stackError);
		} finally {
			stackPending = false;
		}
	}

	function openRemoveStackDialog(stack: SwarmStackSummary): void {
		removeStackName = stack.name;
		removeStackFiles = false;
		stackError = null;
		removeStackDialogOpen = true;
	}

	async function removeStack(): Promise<void> {
		if (!environmentId || !removeStackName || stackPending) return;
		stackPending = true;
		stackError = null;
		try {
			const query = new URLSearchParams({ env: String(environmentId), files: String(removeStackFiles) });
			const response = await fetch(`/api/swarm/stacks/${encodeURIComponent(removeStackName)}?${query}`, { method: 'DELETE' });
			const body = await response.json().catch(() => ({}));
			if (!response.ok) throw new Error(body.error || 'Failed to remove Swarm stack');
			removeStackDialogOpen = false;
			toast.success(body.filesPreserved
				? `Swarm stack ${body.name} removed; its stored file was preserved`
				: `Swarm stack ${body.name} and its Dockhand-managed files were removed`);
			await load(true);
		} catch (removeFailure) {
			stackError = removeFailure instanceof Error ? removeFailure.message : 'Failed to remove Swarm stack';
			toast.error(stackError);
		} finally {
			stackPending = false;
		}
	}

	onMount(() => {
		const unsubscribe = currentEnvironment.subscribe((environment) => {
			const nextId = environment?.id ?? null;
			if (nextId === environmentId) return;
			environmentId = nextId;
			data = null;
			error = null;
			closeActionDialog();
			closeStackDialog();
			removeStackDialogOpen = false;
			requestSequence++;
			if (nextId) void load(true);
		});
		const interval = setInterval(() => {
			if (environmentId && !loading && !refreshing && !actionPending && !stackPending) void load(false);
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
		<div class="flex items-center gap-2">
			{#if data?.capability.kind === 'swarm-manager' && data.capability.controlAvailable && $canAccess('swarm', 'update')}
				<Button size="sm" onclick={openCreateStackDialog} disabled={stackPending}>
					<Plus class="h-4 w-4" /> Deploy stack
				</Button>
			{/if}
			{#if environmentId}
				<Button variant="outline" size="sm" onclick={() => load(true)} disabled={loading || refreshing || stackPending}>
					<RefreshCw class="h-4 w-4 {refreshing ? 'animate-spin' : ''}" />
					Refresh
				</Button>
			{/if}
		</div>
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
				<Tabs.Trigger value="stacks">Swarm Stacks ({data.stacks.length})</Tabs.Trigger>
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
					<Table.Header><Table.Row><Table.Head>Service</Table.Head><Table.Head>Image</Table.Head><Table.Head>Mode</Table.Head><Table.Head>Tasks</Table.Head><Table.Head>Update state</Table.Head><Table.Head>Placement</Table.Head>{#if data.capability.controlAvailable && $canAccess('swarm', 'update')}<Table.Head class="text-right">Actions</Table.Head>{/if}</Table.Row></Table.Header>
					<Table.Body>
						{#each data.services as service (service.id)}
							<Table.Row>
								<Table.Cell><div class="font-medium">{service.name}</div><div class="text-xs text-muted-foreground font-mono">{service.id.slice(0, 12)}</div></Table.Cell>
								<Table.Cell class="max-w-[28rem] truncate font-mono text-xs" title={service.image}>{service.image ?? '—'}</Table.Cell>
								<Table.Cell class="capitalize">{service.mode.replace('-', ' ')}</Table.Cell>
								<Table.Cell>{service.runningTasks} / {service.desiredTasks ?? '—'}{#if service.completedTasks > 0}<div class="text-xs text-muted-foreground">{service.completedTasks} complete</div>{/if}</Table.Cell>
								<Table.Cell class="capitalize">{service.updateStatus?.state ?? '—'}</Table.Cell>
								<Table.Cell class="max-w-[22rem] text-xs">{service.constraints.join(', ') || 'No constraints'}</Table.Cell>
								{#if data.capability.controlAvailable && $canAccess('swarm', 'update')}
									<Table.Cell>
										<div class="flex justify-end gap-2">
											{#if service.mode === 'replicated'}
												<Button variant="outline" size="sm" onclick={() => openScaleDialog(service)} disabled={actionPending}>
													<SlidersHorizontal class="h-4 w-4" /> Scale
												</Button>
											{/if}
											{#if service.mode === 'replicated' || service.mode === 'global'}
												<Button variant="outline" size="sm" onclick={() => openForceUpdateDialog(service)} disabled={actionPending}>
													<RotateCw class="h-4 w-4" /> Restart
												</Button>
											{/if}
										</div>
									</Table.Cell>
								{/if}
							</Table.Row>
						{/each}
					</Table.Body>
				</Table.Root>
			</Tabs.Content>

			<Tabs.Content value="stacks" class="min-h-0 overflow-auto rounded-md border">
				{#if data.stacks.length === 0}
					<div class="flex min-h-40 flex-col items-center justify-center gap-2 text-sm text-muted-foreground">
						<Layers class="h-6 w-6" />
						No Swarm stacks discovered. Stack membership is derived from <code>com.docker.stack.namespace</code> service labels.
					</div>
				{:else}
					<Table.Root>
						<Table.Header><Table.Row><Table.Head>Stack</Table.Head><Table.Head>Services</Table.Head><Table.Head>Tasks</Table.Head>{#if data.capability.controlAvailable && $canAccess('swarm', 'update')}<Table.Head class="text-right">Actions</Table.Head>{/if}</Table.Row></Table.Header>
						<Table.Body>
							{#each data.stacks as stack (stack.name)}
								<Table.Row>
									<Table.Cell><div class="font-medium">{stack.name}</div><div class="text-xs text-muted-foreground">Swarm stack</div></Table.Cell>
									<Table.Cell><div class="flex flex-wrap gap-1">{#each stack.services as service (service.id)}<Badge variant="outline">{service.name}</Badge>{/each}</div></Table.Cell>
									<Table.Cell>{stack.runningTasks} / {stack.desiredTasks ?? '—'}</Table.Cell>
									{#if data.capability.controlAvailable && $canAccess('swarm', 'update')}
										<Table.Cell><div class="flex justify-end gap-2">
											<Button variant="outline" size="sm" onclick={() => openEditStackDialog(stack)} disabled={stackPending}><Pencil class="h-4 w-4" /> Edit / Redeploy</Button>
											<Button variant="destructive" size="sm" onclick={() => openRemoveStackDialog(stack)} disabled={stackPending}><Trash2 class="h-4 w-4" /> Remove</Button>
										</div></Table.Cell>
									{/if}
								</Table.Row>
							{/each}
						</Table.Body>
					</Table.Root>
				{/if}
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

<Dialog.Root bind:open={actionDialogOpen} onOpenChange={(open) => { if (!open) closeActionDialog(); }}>
	<Dialog.Content class="max-w-md">
		<Dialog.Header>
			<Dialog.Title>{actionType === 'scale' ? 'Scale Swarm service' : 'Restart Swarm service'}</Dialog.Title>
			<Dialog.Description>
				{#if actionType === 'scale'}
					Change the desired replica count for <strong>{actionService?.name}</strong>. Swarm will reconcile the service to this value.
				{:else}
					Force-update <strong>{actionService?.name}</strong>? Swarm will replace all current service tasks using the existing service specification.
				{/if}
			</Dialog.Description>
		</Dialog.Header>
		{#if actionType === 'scale'}
			<div class="space-y-2">
				<Label for="swarm-service-replicas">Replicas</Label>
				<Input id="swarm-service-replicas" type="number" min="0" step="1" bind:value={scaleReplicas} disabled={actionPending} />
			</div>
		{/if}
		{#if actionError}
			<Alert.Root variant="destructive">
				<TriangleAlert class="h-4 w-4" />
				<Alert.Description>{actionError}</Alert.Description>
			</Alert.Root>
		{/if}
		<Dialog.Footer>
			<Button variant="outline" onclick={closeActionDialog} disabled={actionPending}>Cancel</Button>
			<Button onclick={confirmServiceAction} disabled={actionPending}>
				{#if actionPending}<Loader2 class="h-4 w-4 animate-spin" />{/if}
				{actionType === 'scale' ? 'Scale service' : 'Restart service'}
			</Button>
		</Dialog.Footer>
	</Dialog.Content>
</Dialog.Root>

<Dialog.Root bind:open={stackDialogOpen} onOpenChange={(open) => { if (!open) closeStackDialog(); }}>
	<Dialog.Content class="flex h-[min(85vh,48rem)] max-w-4xl flex-col">
		<Dialog.Header>
			<Dialog.Title>{stackEditing ? 'Edit and redeploy Swarm stack' : 'Deploy Swarm stack'}</Dialog.Title>
			<Dialog.Description>
				Uses native <code>docker stack deploy</code> semantics. The stored file is separate from normal Docker Compose projects.
			</Dialog.Description>
		</Dialog.Header>
		<div class="space-y-2">
			<Label for="swarm-stack-name">Stack name</Label>
			<Input id="swarm-stack-name" bind:value={stackName} disabled={stackPending || stackEditing} placeholder="my-stack" />
		</div>
		<div class="mt-3 min-h-0 flex-1 space-y-2">
			<Label>Compose / Stack file</Label>
			<div class="h-[calc(100%-1.75rem)] overflow-hidden rounded-md border">
				<CodeEditor value={stackCompose} language="yaml" readonly={stackPending} onchange={(value) => stackCompose = value} class="h-full" />
			</div>
		</div>
		{#if stackError}
			<Alert.Root variant="destructive">
				<TriangleAlert class="h-4 w-4" />
				<Alert.Description>{stackError}</Alert.Description>
			</Alert.Root>
		{/if}
		<Dialog.Footer>
			<Button variant="outline" onclick={closeStackDialog} disabled={stackPending}>Cancel</Button>
			<Button onclick={deployStack} disabled={stackPending || !stackName.trim() || !stackCompose.trim()}>
				{#if stackPending}<Loader2 class="h-4 w-4 animate-spin" />{/if}
				{stackEditing ? 'Save and redeploy' : 'Deploy stack'}
			</Button>
		</Dialog.Footer>
	</Dialog.Content>
</Dialog.Root>

<Dialog.Root bind:open={removeStackDialogOpen} onOpenChange={(open) => { if (!open && !stackPending) removeStackDialogOpen = false; }}>
	<Dialog.Content class="max-w-lg">
		<Dialog.Header>
			<Dialog.Title>Remove Swarm stack “{removeStackName}”?</Dialog.Title>
			<Dialog.Description>
				Swarm will remove every service in this stack. Dockhand preserves the stored stack file by default.
			</Dialog.Description>
		</Dialog.Header>
		<label class="flex items-start gap-3 rounded-md border p-3 text-sm">
			<Checkbox bind:checked={removeStackFiles} disabled={stackPending} />
			<span><strong>Also delete Dockhand-managed stack files</strong><br /><span class="text-muted-foreground">Only files inside Dockhand's guarded stack directory can be deleted.</span></span>
		</label>
		{#if stackError}
			<Alert.Root variant="destructive">
				<TriangleAlert class="h-4 w-4" />
				<Alert.Description>{stackError}</Alert.Description>
			</Alert.Root>
		{/if}
		<Dialog.Footer>
			<Button variant="outline" onclick={() => removeStackDialogOpen = false} disabled={stackPending}>Cancel</Button>
			<Button variant="destructive" onclick={removeStack} disabled={stackPending}>
				{#if stackPending}<Loader2 class="h-4 w-4 animate-spin" />{/if}
				Remove stack
			</Button>
		</Dialog.Footer>
	</Dialog.Content>
</Dialog.Root>
