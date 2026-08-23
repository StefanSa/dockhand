<svelte:head>
	<title>Swarm - Dockhand</title>
</svelte:head>

<script lang="ts">
	import { onMount } from 'svelte';
	import { page } from '$app/stores';
	import { Network, RefreshCw, Loader2, TriangleAlert, Server, ShieldAlert, RotateCw, SlidersHorizontal, Layers, Plus, Pencil, Trash2, Wrench, Search, FileCog, KeyRound } from 'lucide-svelte';
	import type { Component } from 'svelte';
	import { toast } from 'svelte-sonner';
	import { Button } from '$lib/components/ui/button';
	import { Badge } from '$lib/components/ui/badge';
	import { Input } from '$lib/components/ui/input';
	import { Label } from '$lib/components/ui/label';
	import { Textarea } from '$lib/components/ui/textarea';
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
	import type { SwarmConfigSummary, SwarmNodeSummary, SwarmReadModel, SwarmSecretSummary, SwarmServiceSummary, SwarmStackSummary } from '$lib/types/swarm';
	import { filterSwarmTasks, isFailedSwarmTask, SWARM_TASK_FILTERS, swarmTaskCounts, type SwarmTaskFilter } from '$lib/swarm-tasks';

	type NodeDialogAction =
		| { type: 'availability'; availability: 'active' | 'pause' | 'drain' }
		| { type: 'role'; role: 'worker' | 'manager' };
	type SwarmResourceKind = 'config' | 'secret';
	type SwarmResourceSummary = SwarmConfigSummary | SwarmSecretSummary;

	const POLL_INTERVAL_MS = 30_000;
	const SwarmIcon = Network as unknown as Component;

	let environmentId = $state<number | null>(null);
	let activeTab = $state('overview');
	let taskFilter = $state<SwarmTaskFilter>('active');
	let taskSearch = $state('');
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
	let nodeDialogOpen = $state(false);
	let actionNode = $state<SwarmNodeSummary | null>(null);
	let nodeAction = $state<NodeDialogAction | null>(null);
	let nodeActionPending = $state(false);
	let nodeActionError = $state<string | null>(null);
	let resourceDialogOpen = $state(false);
	let resourceKind = $state<SwarmResourceKind>('config');
	let resourceName = $state('');
	let resourceValue = $state('');
	let resourcePending = $state(false);
	let resourceError = $state<string | null>(null);
	let deleteResourceDialogOpen = $state(false);
	let deleteResource = $state<SwarmResourceSummary | null>(null);
	const taskCounts = $derived(swarmTaskCounts(data?.tasks ?? []));
	const visibleTasks = $derived(filterSwarmTasks(
		data?.tasks ?? [],
		taskFilter,
		taskSearch,
		data?.services ?? [],
		data?.nodes ?? []
	));

	$effect(() => {
		const requestedTab = $page.url.searchParams.get('tab');
		if (requestedTab && ['overview', 'nodes', 'services', 'stacks', 'tasks', 'configs', 'secrets'].includes(requestedTab)) {
			activeTab = requestedTab;
		}
	});

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

	function formatDate(value: string | undefined): string {
		if (!value) return '—';
		const date = new Date(value);
		return Number.isNaN(date.getTime()) ? value : date.toLocaleString();
	}

	function resourceLabel(kind: SwarmResourceKind): string {
		return kind === 'config' ? 'Config' : 'Secret';
	}

	function resourceApiPath(kind: SwarmResourceKind): string {
		return kind === 'config' ? 'configs' : 'secrets';
	}

	function openCreateResourceDialog(kind: SwarmResourceKind): void {
		resourceKind = kind;
		resourceName = '';
		resourceValue = '';
		resourceError = null;
		resourceDialogOpen = true;
	}

	function closeResourceDialog(): void {
		if (resourcePending) return;
		resourceDialogOpen = false;
		resourceName = '';
		resourceValue = '';
		resourceError = null;
	}

	async function createResource(): Promise<void> {
		if (!environmentId || resourcePending || !resourceName.trim()) return;
		const submittedValue = resourceValue;
		const submittedName = resourceName.trim();
		const submittedKind = resourceKind;
		// Clear immediately. Secret input is never restored, even if Docker rejects the request.
		resourceValue = '';
		resourcePending = true;
		resourceError = null;
		try {
			const response = await fetch(`/api/swarm/${resourceApiPath(submittedKind)}?env=${environmentId}`, {
				method: 'POST',
				headers: { 'Content-Type': 'application/json' },
				body: JSON.stringify({ name: submittedName, value: submittedValue })
			});
			const body = await response.json().catch(() => ({}));
			if (!response.ok) throw new Error(body.error || `Failed to create Swarm ${submittedKind}`);
			resourceDialogOpen = false;
			resourceName = '';
			toast.success(`${resourceLabel(submittedKind)} ${body.name} created`);
			await load(true);
			activeTab = resourceApiPath(submittedKind);
		} catch (createFailure) {
			resourceError = createFailure instanceof Error ? createFailure.message : `Failed to create Swarm ${submittedKind}`;
			toast.error(resourceError);
		} finally {
			resourcePending = false;
		}
	}

	function openDeleteResourceDialog(kind: SwarmResourceKind, resource: SwarmResourceSummary): void {
		resourceKind = kind;
		deleteResource = resource;
		resourceError = null;
		deleteResourceDialogOpen = true;
	}

	async function confirmDeleteResource(): Promise<void> {
		if (!environmentId || !deleteResource || resourcePending) return;
		const resource = deleteResource;
		const kind = resourceKind;
		resourcePending = true;
		resourceError = null;
		try {
			const response = await fetch(`/api/swarm/${resourceApiPath(kind)}/${encodeURIComponent(resource.id)}?env=${environmentId}`, { method: 'DELETE' });
			const body = await response.json().catch(() => ({}));
			if (!response.ok) throw new Error(body.error || `Failed to delete Swarm ${kind}`);
			deleteResourceDialogOpen = false;
			deleteResource = null;
			toast.success(`${resourceLabel(kind)} ${resource.name} deleted`);
			await load(true);
		} catch (deleteFailure) {
			resourceError = deleteFailure instanceof Error ? deleteFailure.message : `Failed to delete Swarm ${kind}`;
			toast.error(resourceError);
		} finally {
			resourcePending = false;
		}
	}

	function serviceName(serviceId: string | undefined): string {
		return data?.services.find((service) => service.id === serviceId)?.name ?? serviceId?.slice(0, 12) ?? '—';
	}

	function nodeName(nodeId: string | undefined): string {
		return data?.nodes.find((node) => node.id === nodeId)?.hostname ?? nodeId?.slice(0, 12) ?? 'Unassigned';
	}

	function taskStateVariant(task: SwarmReadModel['tasks'][number]): 'secondary' | 'destructive' | 'outline' {
		if (isFailedSwarmTask(task)) return 'destructive';
		return task.state === 'running' ? 'secondary' : 'outline';
	}

	function openNodeActionDialog(node: SwarmNodeSummary, action: NodeDialogAction): void {
		actionNode = node;
		nodeAction = action;
		nodeActionError = null;
		nodeDialogOpen = true;
	}

	function closeNodeActionDialog(): void {
		if (nodeActionPending) return;
		nodeDialogOpen = false;
		actionNode = null;
		nodeAction = null;
		nodeActionError = null;
	}

	async function confirmNodeAction(): Promise<void> {
		if (!environmentId || !actionNode || !nodeAction || nodeActionPending) return;
		nodeActionPending = true;
		nodeActionError = null;
		try {
			const response = await fetch(`/api/swarm/nodes/${encodeURIComponent(actionNode.id)}?env=${environmentId}`, {
				method: 'POST',
				headers: { 'Content-Type': 'application/json' },
				body: JSON.stringify(nodeAction.type === 'availability'
					? { action: 'availability', availability: nodeAction.availability }
					: { action: 'role', role: nodeAction.role })
			});
			const body = await response.json().catch(() => ({}));
			if (!response.ok) throw new Error(body.error || 'Failed to update Swarm node');

			const hostname = actionNode.hostname;
			const description = nodeAction.type === 'availability'
				? `availability set to ${nodeAction.availability}`
				: `role set to ${nodeAction.role}`;
			nodeDialogOpen = false;
			actionNode = null;
			nodeAction = null;
			toast.success(`${hostname} ${description}`);
			await load(true);
			activeTab = 'nodes';
		} catch (actionFailure) {
			nodeActionError = actionFailure instanceof Error ? actionFailure.message : 'Failed to update Swarm node';
			toast.error(nodeActionError);
		} finally {
			nodeActionPending = false;
		}
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
			closeNodeActionDialog();
			closeStackDialog();
			closeResourceDialog();
			removeStackDialogOpen = false;
			deleteResourceDialogOpen = false;
			deleteResource = null;
			requestSequence++;
			if (nextId) void load(true);
		});
		const interval = setInterval(() => {
			if (environmentId && !loading && !refreshing && !actionPending && !nodeActionPending && !stackPending && !resourcePending) void load(false);
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
				This environment is connected to a Swarm worker. Docker's cluster Config and Secret endpoints require a manager, so Dockhand will not redirect through an advertised manager. Add a manager as a separate environment to view nodes, services, tasks, configs, and secret metadata.
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
				<Tabs.Trigger value="stacks">Swarm Stacks ({data.stacks.length})</Tabs.Trigger>
				<Tabs.Trigger value="configs">Configs ({data.configs.length})</Tabs.Trigger>
				<Tabs.Trigger value="secrets">Secrets ({data.secrets.length})</Tabs.Trigger>
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
					<Table.Header><Table.Row><Table.Head>Node</Table.Head><Table.Head>Role</Table.Head><Table.Head>Availability</Table.Head><Table.Head>Status</Table.Head><Table.Head>Manager</Table.Head><Table.Head>Engine</Table.Head><Table.Head>Resources</Table.Head>{#if data.capability.controlAvailable && $canAccess('swarm', 'update')}<Table.Head class="text-right">Actions</Table.Head>{/if}</Table.Row></Table.Header>
					<Table.Body>
						{#each data.nodes as node (node.id)}
							<Table.Row>
								<Table.Cell><div class="font-medium">{node.hostname}</div><div class="text-xs text-muted-foreground font-mono">{node.address ?? node.id.slice(0, 12)}</div></Table.Cell>
								<Table.Cell><Badge variant={node.role === 'manager' ? 'secondary' : 'outline'} class="capitalize">{node.role}</Badge></Table.Cell>
								<Table.Cell><Badge variant={node.availability === 'active' ? 'secondary' : node.availability === 'drain' ? 'destructive' : 'outline'} class="capitalize">{node.availability}</Badge></Table.Cell>
								<Table.Cell><Badge variant={node.status === 'ready' ? 'secondary' : 'destructive'} class="capitalize">{node.status}</Badge></Table.Cell>
								<Table.Cell>{node.managerStatus?.leader ? 'Leader' : node.managerStatus?.reachability ?? '—'}</Table.Cell>
								<Table.Cell>{node.engineVersion ?? '—'}<div class="text-xs text-muted-foreground">{node.platform?.os ?? ''} {node.platform?.architecture ?? ''}</div></Table.Cell>
								<Table.Cell>{formatCpu(node.resources?.nanoCpus)}<div class="text-xs text-muted-foreground">{formatBytes(node.resources?.memoryBytes)}</div></Table.Cell>
								{#if data.capability.controlAvailable && $canAccess('swarm', 'update')}
									<Table.Cell>
										<div class="flex flex-wrap justify-end gap-1">
											<Button size="sm" variant="outline" onclick={() => openNodeActionDialog(node, { type: 'availability', availability: 'active' })} disabled={nodeActionPending || node.availability === 'active'}>Active</Button>
											<Button size="sm" variant="outline" onclick={() => openNodeActionDialog(node, { type: 'availability', availability: 'pause' })} disabled={nodeActionPending || node.availability === 'pause'}>Pause</Button>
											<Button size="sm" variant="destructive" onclick={() => openNodeActionDialog(node, { type: 'availability', availability: 'drain' })} disabled={nodeActionPending || node.availability === 'drain'}>Drain</Button>
											<Button size="sm" variant="outline" onclick={() => openNodeActionDialog(node, { type: 'role', role: node.role === 'manager' ? 'worker' : 'manager' })} disabled={nodeActionPending}>
												<Wrench class="h-4 w-4" /> {node.role === 'manager' ? 'Demote' : 'Promote'}
											</Button>
										</div>
									</Table.Cell>
								{/if}
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
				<div class="sticky top-0 z-10 flex flex-wrap items-center gap-2 border-b bg-background p-2">
					<div class="flex flex-wrap items-center gap-1">
						{#each SWARM_TASK_FILTERS as filter (filter.value)}
							<Button
								size="sm"
								variant={taskFilter === filter.value ? 'secondary' : 'ghost'}
								class="h-7 gap-1.5 px-2 text-xs"
								onclick={() => taskFilter = filter.value}
							>
								{filter.label}
								<Badge variant="outline" class="h-4 min-w-4 px-1 text-2xs">{taskCounts[filter.value]}</Badge>
							</Button>
						{/each}
					</div>
					<div class="relative ml-auto min-w-52 flex-1 sm:max-w-xs">
						<Search class="absolute left-2 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-muted-foreground" />
						<Input
							type="search"
							placeholder="Search service, node, image or task…"
							class="h-7 pl-7 text-xs"
							bind:value={taskSearch}
						/>
					</div>
				</div>
				{#if visibleTasks.length === 0}
					<div class="flex min-h-32 items-center justify-center text-sm text-muted-foreground">
						No tasks match the current filter and search.
					</div>
				{:else}
					<Table.Root>
						<Table.Header><Table.Row><Table.Head>Service</Table.Head><Table.Head>State</Table.Head><Table.Head>Desired state</Table.Head><Table.Head>Node</Table.Head><Table.Head>Slot</Table.Head><Table.Head>Image</Table.Head></Table.Row></Table.Header>
						<Table.Body>
							{#each visibleTasks as task (task.id)}
								<Table.Row>
									<Table.Cell>
										<div class="font-medium">{serviceName(task.serviceId)}</div>
										<div class="text-xs text-muted-foreground">
											{#if task.name}{task.name} · {/if}<span class="font-mono" title={task.id}>{task.id.slice(0, 12)}</span>
										</div>
									</Table.Cell>
									<Table.Cell>
										<Badge variant={taskStateVariant(task)} class="capitalize">{task.state ?? 'unknown'}</Badge>
										{#if task.error || task.message}<div class="mt-1 max-w-64 truncate text-xs {task.error ? 'text-destructive' : 'text-muted-foreground'}" title={task.error || task.message}>{task.error || task.message}</div>{/if}
									</Table.Cell>
									<Table.Cell><Badge variant="outline" class="capitalize">{task.desiredState ?? '—'}</Badge></Table.Cell>
									<Table.Cell>{nodeName(task.nodeId)}</Table.Cell>
									<Table.Cell>{task.slot ?? '—'}</Table.Cell>
									<Table.Cell class="max-w-[28rem] truncate font-mono text-xs" title={task.image}>{task.image ?? '—'}</Table.Cell>
								</Table.Row>
							{/each}
						</Table.Body>
					</Table.Root>
				{/if}
			</Tabs.Content>

			<Tabs.Content value="configs" class="min-h-0 overflow-auto rounded-md border">
				<div class="flex items-center justify-between gap-3 border-b p-3">
					<div><h2 class="font-medium">Swarm Configs</h2><p class="text-xs text-muted-foreground">Configs are immutable. Create a new Config and update the Service or Stack to change content.</p></div>
					{#if data.capability.controlAvailable && $canAccess('swarm', 'update')}
						<Button size="sm" onclick={() => openCreateResourceDialog('config')} disabled={resourcePending}><Plus class="h-4 w-4" /> Create Config</Button>
					{/if}
				</div>
				{#if data.configs.length === 0}
					<div class="flex min-h-32 flex-col items-center justify-center gap-2 text-sm text-muted-foreground"><FileCog class="h-6 w-6" />No Swarm Configs found.</div>
				{:else}
					<Table.Root>
						<Table.Header><Table.Row><Table.Head>Name</Table.Head><Table.Head>ID</Table.Head><Table.Head>Created</Table.Head><Table.Head>Updated</Table.Head><Table.Head>Used by Services</Table.Head>{#if data.capability.controlAvailable && $canAccess('swarm', 'update')}<Table.Head class="text-right">Actions</Table.Head>{/if}</Table.Row></Table.Header>
						<Table.Body>
							{#each data.configs as config (config.id)}
								<Table.Row>
									<Table.Cell class="font-medium">{config.name}</Table.Cell>
									<Table.Cell class="font-mono text-xs" title={config.id}>{config.id.slice(0, 12)}</Table.Cell>
									<Table.Cell class="text-sm">{formatDate(config.createdAt)}</Table.Cell>
									<Table.Cell class="text-sm">{formatDate(config.updatedAt)}</Table.Cell>
									<Table.Cell>{#if config.services.length}<div class="flex flex-wrap gap-1">{#each config.services as usage (usage.serviceId)}<Badge variant="outline">{usage.serviceName}</Badge>{/each}</div>{:else}<span class="text-muted-foreground">Unused</span>{/if}</Table.Cell>
									{#if data.capability.controlAvailable && $canAccess('swarm', 'update')}
										<Table.Cell class="text-right"><Button variant="destructive" size="sm" onclick={() => openDeleteResourceDialog('config', config)} disabled={resourcePending || config.services.length > 0} title={config.services.length ? 'Update or remove the using Services first' : 'Delete Config'}><Trash2 class="h-4 w-4" /> Delete</Button></Table.Cell>
									{/if}
								</Table.Row>
							{/each}
						</Table.Body>
					</Table.Root>
				{/if}
			</Tabs.Content>

			<Tabs.Content value="secrets" class="min-h-0 overflow-auto rounded-md border">
				<div class="flex items-center justify-between gap-3 border-b p-3">
					<div><h2 class="font-medium">Swarm Secrets</h2><p class="text-xs text-muted-foreground">Only metadata is shown. Secret values cannot be read or edited after creation.</p></div>
					{#if data.capability.controlAvailable && $canAccess('swarm', 'update')}
						<Button size="sm" onclick={() => openCreateResourceDialog('secret')} disabled={resourcePending}><Plus class="h-4 w-4" /> Create Secret</Button>
					{/if}
				</div>
				{#if data.secrets.length === 0}
					<div class="flex min-h-32 flex-col items-center justify-center gap-2 text-sm text-muted-foreground"><KeyRound class="h-6 w-6" />No Swarm Secrets found.</div>
				{:else}
					<Table.Root>
						<Table.Header><Table.Row><Table.Head>Name</Table.Head><Table.Head>ID</Table.Head><Table.Head>Created</Table.Head><Table.Head>Updated</Table.Head><Table.Head>Used by Services</Table.Head>{#if data.capability.controlAvailable && $canAccess('swarm', 'update')}<Table.Head class="text-right">Actions</Table.Head>{/if}</Table.Row></Table.Header>
						<Table.Body>
							{#each data.secrets as secret (secret.id)}
								<Table.Row>
									<Table.Cell class="font-medium">{secret.name}</Table.Cell>
									<Table.Cell class="font-mono text-xs" title={secret.id}>{secret.id.slice(0, 12)}</Table.Cell>
									<Table.Cell class="text-sm">{formatDate(secret.createdAt)}</Table.Cell>
									<Table.Cell class="text-sm">{formatDate(secret.updatedAt)}</Table.Cell>
									<Table.Cell>{#if secret.services.length}<div class="flex flex-wrap gap-1">{#each secret.services as usage (usage.serviceId)}<Badge variant="outline">{usage.serviceName}</Badge>{/each}</div>{:else}<span class="text-muted-foreground">Unused</span>{/if}</Table.Cell>
									{#if data.capability.controlAvailable && $canAccess('swarm', 'update')}
										<Table.Cell class="text-right"><Button variant="destructive" size="sm" onclick={() => openDeleteResourceDialog('secret', secret)} disabled={resourcePending || secret.services.length > 0} title={secret.services.length ? 'Update or remove the using Services first' : 'Delete Secret'}><Trash2 class="h-4 w-4" /> Delete</Button></Table.Cell>
									{/if}
								</Table.Row>
							{/each}
						</Table.Body>
					</Table.Root>
				{/if}
			</Tabs.Content>
		</Tabs.Root>
	{:else}
		<div class="flex flex-1 items-center justify-center text-muted-foreground">
			<Server class="mr-2 h-5 w-5" /> No Swarm data available.
		</div>
	{/if}
</div>

<Dialog.Root bind:open={nodeDialogOpen} onOpenChange={(open) => { if (!open) closeNodeActionDialog(); }}>
	<Dialog.Content class="max-w-lg">
		<Dialog.Header>
			<Dialog.Title>
				{#if nodeAction?.type === 'availability'}Set {actionNode?.hostname} to {nodeAction.availability}?{:else if nodeAction?.type === 'role'}Change {actionNode?.hostname} role to {nodeAction.role}?{/if}
			</Dialog.Title>
			<Dialog.Description>
				{#if nodeAction?.type === 'availability' && nodeAction.availability === 'drain'}
					Swarm will stop assigning tasks to this node and reschedule its service tasks where placement constraints and capacity allow.
				{:else if nodeAction?.type === 'availability' && nodeAction.availability === 'pause'}
					Swarm will keep existing tasks running but will not assign new tasks to this node.
				{:else if nodeAction?.type === 'availability'}
					Swarm will make this node eligible for task assignment again.
				{:else if nodeAction?.type === 'role' && nodeAction.role === 'manager'}
					This node will join the Raft manager set and participate in cluster management and quorum.
				{:else if nodeAction?.type === 'role'}
					This manager will become a worker. Dockhand blocks the update if it is the last manager, but you should still confirm cluster quorum is healthy.
				{/if}
			</Dialog.Description>
		</Dialog.Header>
		{#if nodeActionError}
			<Alert.Root variant="destructive">
				<TriangleAlert class="h-4 w-4" />
				<Alert.Description>{nodeActionError}</Alert.Description>
			</Alert.Root>
		{/if}
		<Dialog.Footer>
			<Button variant="outline" onclick={closeNodeActionDialog} disabled={nodeActionPending}>Cancel</Button>
			<Button
				variant={nodeAction?.type === 'availability' && nodeAction.availability === 'drain' || nodeAction?.type === 'role' && nodeAction.role === 'worker' ? 'destructive' : 'default'}
				onclick={confirmNodeAction}
				disabled={nodeActionPending}
			>
				{#if nodeActionPending}<Loader2 class="h-4 w-4 animate-spin" />{/if}
				Confirm node update
			</Button>
		</Dialog.Footer>
	</Dialog.Content>
</Dialog.Root>

<Dialog.Root bind:open={resourceDialogOpen} onOpenChange={(open) => { if (!open) closeResourceDialog(); }}>
	<Dialog.Content class="max-w-lg">
		<Dialog.Header>
			<Dialog.Title>Create Swarm {resourceLabel(resourceKind)}</Dialog.Title>
			<Dialog.Description>
				{#if resourceKind === 'secret'}The value is sent once to Docker and is immediately cleared from this form. Dockhand never returns or redisplays it.{:else}Configs are immutable; changing this content later requires a new Config.{/if}
			</Dialog.Description>
		</Dialog.Header>
		<div class="space-y-2">
			<Label for="swarm-resource-name">Name</Label>
			<Input id="swarm-resource-name" bind:value={resourceName} disabled={resourcePending} autocomplete="off" placeholder={resourceKind === 'config' ? 'app-config-v2' : 'app-secret-v2'} />
		</div>
		<div class="space-y-2">
			<Label for="swarm-resource-value">{resourceKind === 'config' ? 'Content' : 'Secret value'}</Label>
			{#if resourceKind === 'config'}
				<Textarea id="swarm-resource-value" bind:value={resourceValue} disabled={resourcePending} rows={8} autocomplete="off" />
			{:else}
				<Input id="swarm-resource-value" type="password" bind:value={resourceValue} disabled={resourcePending} autocomplete="new-password" />
			{/if}
		</div>
		{#if resourceError}
			<Alert.Root variant="destructive"><TriangleAlert class="h-4 w-4" /><Alert.Description>{resourceError}</Alert.Description></Alert.Root>
		{/if}
		<Dialog.Footer>
			<Button variant="outline" onclick={closeResourceDialog} disabled={resourcePending}>Cancel</Button>
			<Button onclick={createResource} disabled={resourcePending || !resourceName.trim()}>
				{#if resourcePending}<Loader2 class="h-4 w-4 animate-spin" />{/if}
				Create {resourceLabel(resourceKind)}
			</Button>
		</Dialog.Footer>
	</Dialog.Content>
</Dialog.Root>

<Dialog.Root bind:open={deleteResourceDialogOpen} onOpenChange={(open) => { if (!open && !resourcePending) { deleteResourceDialogOpen = false; deleteResource = null; resourceError = null; } }}>
	<Dialog.Content class="max-w-lg">
		<Dialog.Header>
			<Dialog.Title>Delete {resourceLabel(resourceKind)} “{deleteResource?.name}”?</Dialog.Title>
			<Dialog.Description>This immutable Swarm {resourceKind} will be permanently removed. Docker will reject the operation if a Service starts using it before deletion completes.</Dialog.Description>
		</Dialog.Header>
		{#if resourceError}
			<Alert.Root variant="destructive"><TriangleAlert class="h-4 w-4" /><Alert.Description>{resourceError}</Alert.Description></Alert.Root>
		{/if}
		<Dialog.Footer>
			<Button variant="outline" onclick={() => { deleteResourceDialogOpen = false; deleteResource = null; }} disabled={resourcePending}>Cancel</Button>
			<Button variant="destructive" onclick={confirmDeleteResource} disabled={resourcePending}>
				{#if resourcePending}<Loader2 class="h-4 w-4 animate-spin" />{/if}
				Delete {resourceLabel(resourceKind)}
			</Button>
		</Dialog.Footer>
	</Dialog.Content>
</Dialog.Root>

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
