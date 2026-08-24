<svelte:head>
	<title>Swarm - Dockhand</title>
</svelte:head>

<script lang="ts">
	import { onMount } from 'svelte';
	import { goto } from '$app/navigation';
	import { page } from '$app/stores';
	import { Network, RefreshCw, Loader2, TriangleAlert, Server, ShieldAlert, RotateCw, Layers, Plus, Minus, Pencil, Trash2, Wrench, Search, FileCog, KeyRound, ChevronRight, Copy, Check } from 'lucide-svelte';
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
	import { copyToClipboard } from '$lib/utils/clipboard';
	import type { SwarmConfigSummary, SwarmNodeSummary, SwarmReadModel, SwarmSecretSummary, SwarmServiceSummary, SwarmStackSummary } from '$lib/types/swarm';
	import { filterSwarmTasks, SWARM_TASK_FILTERS, swarmTaskCounts, type SwarmTaskFilter } from '$lib/swarm-tasks';
	import { isSwarmDetailAvailable, parseSwarmDetail, swarmDetailHref, swarmTabHref, SWARM_TABS, type SwarmDetailKind, type SwarmTab } from '$lib/swarm-navigation';
	import { planSwarmConfigReplacement } from '$lib/swarm-config-replacement';
	import { servicesForSwarmNode, tasksForSwarmNode, tasksForSwarmService } from '$lib/swarm-relations';
	import { canScaleSwarmService, hasReplicaMismatch, isStackManagedSwarmService, swarmStatusPresentation, swarmTaskStatusPresentation } from '$lib/swarm-service-ux';

	type NodeDialogAction =
		| { type: 'availability'; availability: 'active' | 'pause' | 'drain' }
		| { type: 'role'; role: 'worker' | 'manager' };
	type SwarmResourceKind = 'config' | 'secret';
	type SwarmResourceSummary = SwarmConfigSummary | SwarmSecretSummary;
	type PendingScale = { target: number; requestedAt: number };

	const POLL_INTERVAL_MS = 30_000;
	const SCALE_PENDING_TIMEOUT_MS = 5 * 60_000;
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
	let actionPending = $state(false);
	let actionError = $state<string | null>(null);
	let pendingScales = $state<Record<string, PendingScale>>({});
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
	let metadataDialogOpen = $state(false);
	let metadataResource = $state<SwarmResourceSummary | null>(null);
	let metadataKind = $state<SwarmResourceKind>('config');
	let metadataLabels = $state('');
	let replaceConfigDialogOpen = $state(false);
	let replaceConfigSource = $state<SwarmConfigSummary | null>(null);
	let replacementName = $state('');
	let replacementValue = $state('');
	let replacementServiceIds = $state<string[]>([]);
	let replacementConfirmed = $state(false);
	let copiedConfigId = $state<string | null>(null);
	const taskCounts = $derived(swarmTaskCounts(data?.tasks ?? []));
	const visibleTasks = $derived(filterSwarmTasks(
		data?.tasks ?? [],
		taskFilter,
		taskSearch,
		data?.services ?? [],
		data?.nodes ?? []
	));
	const detail = $derived(parseSwarmDetail($page.url.searchParams));
	const selectedNode = $derived(detail?.kind === 'node' ? data?.nodes.find((node) => node.id === detail.id) ?? null : null);
	const selectedService = $derived(detail?.kind === 'service' ? data?.services.find((service) => service.id === detail.id) ?? null : null);
	const selectedTask = $derived(detail?.kind === 'task' ? data?.tasks.find((task) => task.id === detail.id) ?? null : null);
	const selectedStack = $derived(detail?.kind === 'stack' ? data?.stacks.find((stack) => stack.name === detail.id) ?? null : null);
	const selectedConfig = $derived(detail?.kind === 'config' ? data?.configs.find((config) => config.id === detail.id) ?? null : null);
	const selectedSecret = $derived(detail?.kind === 'secret' ? data?.secrets.find((secret) => secret.id === detail.id) ?? null : null);
	const selectedTaskService = $derived(selectedTask?.serviceId ? data?.services.find((service) => service.id === selectedTask.serviceId) ?? null : null);
	const selectedTaskNode = $derived(selectedTask?.nodeId ? data?.nodes.find((node) => node.id === selectedTask.nodeId) ?? null : null);
	const selectedServiceTasks = $derived(selectedService && data ? tasksForSwarmService(data.tasks, selectedService.id) : []);
	const selectedNodeTasks = $derived(selectedNode && data ? tasksForSwarmNode(data.tasks, selectedNode.id) : []);
	const selectedNodeServices = $derived.by(() => {
		if (!selectedNode || !data) return [];
		return servicesForSwarmNode(data.services, data.tasks, selectedNode);
	});

	$effect(() => {
		const requestedTab = $page.url.searchParams.get('tab');
		if (detail) {
			activeTab = detail.tab;
		} else if (requestedTab && SWARM_TABS.includes(requestedTab as SwarmTab)) {
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
			reconcilePendingScales(body);
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

	function pendingScaleFor(serviceId: string): PendingScale | undefined {
		return pendingScales[serviceId];
	}

	function reconcilePendingScales(model: SwarmReadModel): void {
		const now = Date.now();
		const next = { ...pendingScales };
		let changed = false;
		for (const [serviceId, pending] of Object.entries(next)) {
			const service = model.services.find((candidate) => candidate.id === serviceId);
			const converged = service?.desiredTasks === pending.target && service.runningTasks === pending.target;
			if (!service || converged || now - pending.requestedAt > SCALE_PENDING_TIMEOUT_MS) {
				delete next[serviceId];
				changed = true;
			}
		}
		if (changed) pendingScales = next;
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

	function formatPort(port: SwarmServiceSummary['ports'][number]): string {
		const published = port.publishedPort ? `${port.publishedPort}:` : '';
		return `${published}${port.targetPort ?? '—'}/${port.protocol ?? 'tcp'}${port.publishMode ? ` (${port.publishMode})` : ''}`;
	}

	function detailHref(kind: SwarmDetailKind, id: string): string {
		return swarmDetailHref(kind, id);
	}

	function navigateToTab(value: string): void {
		if (!SWARM_TABS.includes(value as SwarmTab)) return;
		activeTab = value;
		void goto(swarmTabHref(value as SwarmTab), { noScroll: true, keepFocus: true });
	}

	function labelsAsText(labels: Record<string, string>): string {
		return Object.entries(labels).sort(([left], [right]) => left.localeCompare(right)).map(([key, value]) => `${key}=${value}`).join('\n');
	}

	function parseLabels(value: string): Record<string, string> {
		const labels: Record<string, string> = {};
		for (const [index, rawLine] of value.split('\n').entries()) {
			const line = rawLine.trim();
			if (!line) continue;
			const separator = line.indexOf('=');
			if (separator <= 0) throw new Error(`Label line ${index + 1} must use key=value.`);
			const key = line.slice(0, separator).trim();
			if (!key || key in labels) throw new Error(`Label key on line ${index + 1} is empty or duplicated.`);
			labels[key] = line.slice(separator + 1);
		}
		return labels;
	}

	async function copyConfigData(config: SwarmConfigSummary): Promise<void> {
		if (config.data === undefined) return;
		if (!await copyToClipboard(config.data)) {
			toast.error('Copy requires clipboard access.');
			return;
		}
		copiedConfigId = config.id;
		toast.success(`Config ${config.name} copied`);
		setTimeout(() => { if (copiedConfigId === config.id) copiedConfigId = null; }, 1500);
	}

	function resourceLabel(kind: SwarmResourceKind): string {
		return kind === 'config' ? 'Config' : 'Secret';
	}

	function resourceApiPath(kind: SwarmResourceKind): string {
		return kind === 'config' ? 'configs' : 'secrets';
	}

	function openMetadataDialog(kind: SwarmResourceKind, resource: SwarmResourceSummary): void {
		metadataKind = kind;
		metadataResource = resource;
		metadataLabels = labelsAsText(resource.labels);
		resourceError = null;
		metadataDialogOpen = true;
	}

	function closeMetadataDialog(): void {
		if (resourcePending) return;
		metadataDialogOpen = false;
		metadataResource = null;
		metadataLabels = '';
		resourceError = null;
	}

	async function updateResourceMetadata(): Promise<void> {
		if (!environmentId || !metadataResource || resourcePending) return;
		let labels: Record<string, string>;
		try {
			labels = parseLabels(metadataLabels);
		} catch (labelError) {
			resourceError = labelError instanceof Error ? labelError.message : 'Invalid labels';
			return;
		}
		resourcePending = true;
		resourceError = null;
		try {
			const response = await fetch(`/api/swarm/${resourceApiPath(metadataKind)}/${encodeURIComponent(metadataResource.id)}?env=${environmentId}`, {
				method: 'PATCH',
				headers: { 'Content-Type': 'application/json' },
				body: JSON.stringify({ labels })
			});
			const body = await response.json().catch(() => ({}));
			if (!response.ok) throw new Error(body.error || `Failed to update ${metadataKind} labels`);
			const name = metadataResource.name;
			metadataDialogOpen = false;
			metadataResource = null;
			toast.success(`${resourceLabel(metadataKind)} ${name} labels updated`);
			await load(true);
		} catch (updateFailure) {
			resourceError = updateFailure instanceof Error ? updateFailure.message : `Failed to update ${metadataKind} labels`;
			toast.error(resourceError);
		} finally {
			resourcePending = false;
		}
	}

	function openReplaceConfigDialog(config: SwarmConfigSummary): void {
		replaceConfigSource = config;
		replacementName = `${config.name}-v2`;
		replacementValue = config.data ?? '';
		replacementServiceIds = [];
		replacementConfirmed = false;
		resourceError = null;
		replaceConfigDialogOpen = true;
	}

	function closeReplaceConfigDialog(): void {
		if (resourcePending) return;
		replaceConfigDialogOpen = false;
		replaceConfigSource = null;
		replacementName = '';
		replacementValue = '';
		replacementServiceIds = [];
		replacementConfirmed = false;
		resourceError = null;
	}

	function setReplacementService(serviceId: string, checked: boolean): void {
		replacementServiceIds = checked
			? [...new Set([...replacementServiceIds, serviceId])]
			: replacementServiceIds.filter((id) => id !== serviceId);
	}

	async function createConfigReplacement(): Promise<void> {
		if (!environmentId || !replaceConfigSource || resourcePending || !replacementConfirmed || !replacementName.trim()) return;
		let plan;
		try {
			plan = planSwarmConfigReplacement(replaceConfigSource, replacementName, replacementValue, {
				serviceIds: replacementServiceIds,
				confirmed: replacementConfirmed
			});
		} catch (planError) {
			resourceError = planError instanceof Error ? planError.message : 'Invalid replacement Config';
			return;
		}
		resourcePending = true;
		resourceError = null;
		try {
			const response = await fetch(`/api/swarm/configs?env=${environmentId}`, {
				method: 'POST',
				headers: { 'Content-Type': 'application/json' },
				body: JSON.stringify({ name: plan.name, value: plan.value })
			});
			const body = await response.json().catch(() => ({}));
			if (!response.ok) throw new Error(body.error || 'Failed to create replacement Config');

			const selectedUsages = replaceConfigSource.services.filter((usage) => !usage.stackName && plan.serviceIdsToUpdate.includes(usage.serviceId));
			const updatedServices: string[] = [];
			const failedServices: string[] = [];
			for (const usage of selectedUsages) {
				const updateResponse = await fetch(`/api/swarm/services/${encodeURIComponent(usage.serviceId)}?env=${environmentId}`, {
					method: 'POST',
					headers: { 'Content-Type': 'application/json' },
					body: JSON.stringify({
						action: 'replace-config',
						sourceConfigId: plan.sourceId,
						replacementConfigId: body.id,
						replacementConfigName: body.name
					})
				});
				if (updateResponse.ok) updatedServices.push(usage.serviceName);
				else failedServices.push(usage.serviceName);
			}

			replaceConfigDialogOpen = false;
			replaceConfigSource = null;
			replacementValue = '';
			replacementServiceIds = [];
			toast.success(updatedServices.length
				? `Updated Config ${body.name} created and applied to ${updatedServices.length} Service${updatedServices.length === 1 ? '' : 's'}`
				: `Updated Config ${body.name} created; existing references were left unchanged`);
			if (failedServices.length) {
				toast.warning(`Config created, but ${failedServices.join(', ')} could not be updated. Their existing references remain unchanged.`);
			}
			await load(true);
			await goto(detailHref('config', body.id), { noScroll: true });
		} catch (replaceFailure) {
			resourceError = replaceFailure instanceof Error ? replaceFailure.message : 'Failed to create replacement Config';
			toast.error(resourceError);
		} finally {
			resourcePending = false;
		}
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
			await goto(detailHref(submittedKind, body.id), { noScroll: true });
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
			await goto(swarmTabHref(resourceApiPath(kind) as SwarmTab), { noScroll: true });
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

	function openForceUpdateDialog(service: SwarmServiceSummary): void {
		if (isStackManagedSwarmService(service)) return;
		actionService = service;
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
		if (isStackManagedSwarmService(actionService)) {
			actionError = 'This Service is managed by a Swarm stack. Edit and redeploy the stored stack definition instead.';
			return;
		}

		actionPending = true;
		actionError = null;
		try {
			const response = await fetch(`/api/swarm/services/${encodeURIComponent(actionService.id)}?env=${environmentId}`, {
				method: 'POST',
				headers: { 'Content-Type': 'application/json' },
				body: JSON.stringify({ action: 'force-update' })
			});
			const body = await response.json().catch(() => ({}));
			if (!response.ok) throw new Error(body.error || 'Failed to update Swarm service');

			const serviceName = actionService.name;
			actionDialogOpen = false;
			actionService = null;
			toast.success(`${serviceName} restart requested`);
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

	async function scaleServiceBy(service: SwarmServiceSummary, delta: -1 | 1): Promise<void> {
		if (!environmentId || !canScaleSwarmService(service.mode) || isStackManagedSwarmService(service) || pendingScaleFor(service.id)) return;
		const currentTarget = service.desiredTasks ?? service.runningTasks;
		const target = Math.max(0, currentTarget + delta);
		if (target === currentTarget) return;

		pendingScales = {
			...pendingScales,
			[service.id]: { target, requestedAt: Date.now() }
		};
		try {
			const response = await fetch(`/api/swarm/services/${encodeURIComponent(service.id)}?env=${environmentId}`, {
				method: 'POST',
				headers: { 'Content-Type': 'application/json' },
				body: JSON.stringify({ action: 'scale', replicas: target })
			});
			const body = await response.json().catch(() => ({}));
			if (!response.ok) throw new Error(body.error || 'Failed to scale Swarm service');
			toast.success(`${service.name} desired replicas set to ${target}`);
			if (Array.isArray(body.warnings) && body.warnings.length > 0) toast.warning(body.warnings.join(' '));
			await load(true);
		} catch (scaleFailure) {
			const next = { ...pendingScales };
			delete next[service.id];
			pendingScales = next;
			toast.error(scaleFailure instanceof Error ? scaleFailure.message : 'Failed to scale Swarm service');
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
			const previousId = environmentId;
			environmentId = nextId;
			data = null;
			error = null;
			closeActionDialog();
			closeNodeActionDialog();
			closeStackDialog();
			closeResourceDialog();
			closeMetadataDialog();
			closeReplaceConfigDialog();
			removeStackDialogOpen = false;
			deleteResourceDialogOpen = false;
			deleteResource = null;
			requestSequence++;
			if (previousId !== null && parseSwarmDetail($page.url.searchParams)) {
				void goto(swarmTabHref(activeTab as SwarmTab), { replaceState: true, noScroll: true, keepFocus: true });
			}
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

		<Tabs.Root value={activeTab} onValueChange={navigateToTab} class="flex min-h-0 flex-1 flex-col gap-3">
			<Tabs.List class="w-fit">
				<Tabs.Trigger value="overview">Overview</Tabs.Trigger>
				<Tabs.Trigger value="nodes">Nodes ({data.nodes.length})</Tabs.Trigger>
				<Tabs.Trigger value="services">Services ({data.services.length})</Tabs.Trigger>
				<Tabs.Trigger value="tasks">Tasks ({data.tasks.length})</Tabs.Trigger>
				<Tabs.Trigger value="stacks">Swarm Stacks ({data.stacks.length})</Tabs.Trigger>
				<Tabs.Trigger value="configs">Configs ({data.configs.length})</Tabs.Trigger>
				<Tabs.Trigger value="secrets">Secrets ({data.secrets.length})</Tabs.Trigger>
			</Tabs.List>

			{#if detail}
				<nav class="flex items-center gap-1 text-sm text-muted-foreground" aria-label="Swarm resource breadcrumb">
					<a class="hover:text-foreground hover:underline" href={swarmTabHref(detail.tab)}>{detail.tab === 'stacks' ? 'Swarm Stacks' : detail.tab.charAt(0).toUpperCase() + detail.tab.slice(1)}</a>
					<ChevronRight class="h-4 w-4" />
					<span class="max-w-[32rem] truncate text-foreground">
						{selectedNode?.hostname ?? selectedService?.name ?? selectedTask?.name ?? selectedStack?.name ?? selectedConfig?.name ?? selectedSecret?.name ?? detail.id}
					</span>
				</nav>

				{#if data && !isSwarmDetailAvailable(data, detail)}
					<Alert.Root>
						<TriangleAlert class="h-4 w-4" />
						<Alert.Title>Resource not found in this environment</Alert.Title>
						<Alert.Description>The deep link does not match the currently selected Docker environment. <a class="font-medium underline" href={swarmTabHref(detail.tab)}>Return to the resource list.</a></Alert.Description>
					</Alert.Root>
				{:else if selectedService}
					<Card.Root>
						<Card.Header class="gap-1">
							<div class="flex flex-wrap items-start justify-between gap-3">
								<div><Card.Title>{selectedService.name}</Card.Title><Card.Description class="font-mono break-all">{selectedService.id}</Card.Description></div>
								<div class="flex gap-2">
									{#if selectedService.stackName}
										<Button size="sm" variant="outline" href={detailHref('stack', selectedService.stackName)}><Layers class="h-4 w-4" /> Open stack</Button>
									{:else if data.capability.controlAvailable && $canAccess('swarm', 'update') && (selectedService.mode === 'replicated' || selectedService.mode === 'global')}
										<Button size="sm" variant="outline" onclick={() => openForceUpdateDialog(selectedService)}><RotateCw class="h-4 w-4" /> Restart</Button>
									{/if}
								</div>
							</div>
						</Card.Header>
						<Card.Content class="space-y-5">
							{#if selectedService.stackName}
								<Alert.Root class="border-amber-600/30 bg-amber-500/10">
									<Layers class="h-4 w-4 text-amber-700 dark:text-amber-400" />
									<Alert.Title>Stack-managed service</Alert.Title>
									<Alert.Description>The stored definition for <a class="font-medium underline" href={detailHref('stack', selectedService.stackName)}>{selectedService.stackName}</a> is the source of truth. Direct scale, restart, and Config-reference changes are disabled; edit and redeploy the stack instead.</Alert.Description>
								</Alert.Root>
							{/if}
							<div class="grid gap-3 text-sm sm:grid-cols-2 xl:grid-cols-4">
								<div><span class="text-muted-foreground">Image</span><p class="break-all font-mono text-xs">{selectedService.image ?? '—'}</p></div>
								<div>
									<span class="text-muted-foreground">Mode</span>
									<p><Badge variant="outline" class="capitalize">{selectedService.mode.replace('-', ' ')}</Badge></p>
									{#if selectedService.mode === 'global'}<p class="mt-1 text-xs text-muted-foreground">One task per eligible node. Placement determines where tasks run.</p>{/if}
								</div>
								<div>
									<span class="text-muted-foreground">Replicas</span>
									{#if selectedService.mode === 'replicated'}
										<div class="mt-1 flex flex-wrap items-center gap-1">
											{#if data.capability.controlAvailable && $canAccess('swarm', 'update') && !isStackManagedSwarmService(selectedService)}
												<Button variant="outline" size="icon" class="h-7 w-7" onclick={() => scaleServiceBy(selectedService, -1)} disabled={Boolean(pendingScaleFor(selectedService.id)) || (selectedService.desiredTasks ?? 0) <= 0} aria-label={`Scale ${selectedService.name} down`}><Minus class="h-3.5 w-3.5" /></Button>
											{/if}
											<Badge variant={swarmStatusPresentation(hasReplicaMismatch(selectedService) || pendingScaleFor(selectedService.id) ? 'partial' : 'stable').variant} class="tabular-nums {swarmStatusPresentation(hasReplicaMismatch(selectedService) || pendingScaleFor(selectedService.id) ? 'partial' : 'stable').className}">{selectedService.runningTasks} / {selectedService.desiredTasks ?? '—'}</Badge>
											{#if data.capability.controlAvailable && $canAccess('swarm', 'update') && !isStackManagedSwarmService(selectedService)}
												<Button variant="outline" size="icon" class="h-7 w-7" onclick={() => scaleServiceBy(selectedService, 1)} disabled={Boolean(pendingScaleFor(selectedService.id))} aria-label={`Scale ${selectedService.name} up`}><Plus class="h-3.5 w-3.5" /></Button>
											{/if}
										</div>
										<p class="mt-1 text-xs text-muted-foreground">Running / desired{#if pendingScaleFor(selectedService.id)} · Pending target {pendingScaleFor(selectedService.id)?.target}{:else if hasReplicaMismatch(selectedService)} · reconciliation in progress{/if}</p>
									{:else if selectedService.mode === 'global'}
										<p>{selectedService.runningTasks} running</p><p class="mt-1 text-xs text-muted-foreground">One task per eligible node · no manual scale</p>
									{:else}
										<p>{selectedService.runningTasks} running{#if selectedService.completedTasks > 0} · {selectedService.completedTasks} completed{/if}</p>
									{/if}
								</div>
								<div><span class="text-muted-foreground">Health</span><p><Badge variant={swarmStatusPresentation(selectedService.healthState).variant} class="capitalize {swarmStatusPresentation(selectedService.healthState).className}">{selectedService.healthState}</Badge></p></div>
								<div><span class="text-muted-foreground">Update state</span><p><Badge variant={swarmStatusPresentation(selectedService.updateStatus?.state ?? 'stable').variant} class="capitalize {swarmStatusPresentation(selectedService.updateStatus?.state ?? 'stable').className}">{selectedService.updateStatus?.state ?? 'stable'}</Badge></p>{#if selectedService.updateStatus?.message}<p class="mt-1 text-xs text-muted-foreground">{selectedService.updateStatus.message}</p>{/if}</div>
								<div><span class="text-muted-foreground">Ports</span><p>{selectedService.ports.map(formatPort).join(', ') || 'None published'}</p></div>
								<div><span class="text-muted-foreground">Placement</span><p>{selectedService.constraints.join(', ') || 'No constraints'}</p>{#if selectedService.preferences.length}<p class="text-xs text-muted-foreground">{selectedService.preferences.length} preference(s)</p>{/if}</div>
								<div><span class="text-muted-foreground">Stack</span><p>{#if selectedService.stackName}<a class="font-medium text-primary hover:underline" href={detailHref('stack', selectedService.stackName)}>{selectedService.stackName}</a>{:else}Standalone service{/if}</p></div>
								<div><span class="text-muted-foreground">Updated</span><p>{formatDate(selectedService.updatedAt)}</p></div>
							</div>
							<div>
								<h3 class="mb-2 text-sm font-medium">Tasks ({selectedServiceTasks.length})</h3>
								<div class="max-h-80 overflow-auto rounded-md border">
									<Table.Root>
										<Table.Header><Table.Row><Table.Head>Task</Table.Head><Table.Head>State</Table.Head><Table.Head>Desired</Table.Head><Table.Head>Node</Table.Head><Table.Head>Slot</Table.Head><Table.Head>Image</Table.Head></Table.Row></Table.Header>
										<Table.Body>
											{#each selectedServiceTasks as task (task.id)}
												<Table.Row>
													<Table.Cell><a class="font-medium text-primary hover:underline" href={detailHref('task', task.id)}>{task.name ?? `Task ${task.id.slice(0, 12)}`}</a><div class="font-mono text-xs text-muted-foreground">{task.id.slice(0, 12)}</div></Table.Cell>
											<Table.Cell><Badge variant={swarmTaskStatusPresentation(task.state, task.error).variant} class="capitalize {swarmTaskStatusPresentation(task.state, task.error).className}">{task.state ?? 'unknown'}</Badge>{#if task.error || task.message}<div class="mt-1 max-w-64 truncate text-xs {task.error ? 'text-destructive' : 'text-muted-foreground'}" title={task.error || task.message}>{task.error || task.message}</div>{/if}</Table.Cell>
											<Table.Cell class="capitalize text-muted-foreground">{task.desiredState ?? '—'}</Table.Cell>
													<Table.Cell>{#if task.nodeId}<a class="font-medium text-primary hover:underline" href={detailHref('node', task.nodeId)}>{nodeName(task.nodeId)}</a>{:else}—{/if}</Table.Cell>
													<Table.Cell>{task.slot ?? '—'}</Table.Cell>
													<Table.Cell class="max-w-72 truncate font-mono text-xs" title={task.image}>{task.image ?? '—'}</Table.Cell>
												</Table.Row>
											{:else}
												<Table.Row><Table.Cell colspan={6} class="py-8 text-center text-muted-foreground">No tasks</Table.Cell></Table.Row>
											{/each}
										</Table.Body>
									</Table.Root>
								</div>
							</div>
							<div class="grid gap-4 lg:grid-cols-2">
								<div><h3 class="mb-2 text-sm font-medium">Configs ({selectedService.configs.length})</h3><div class="flex flex-wrap gap-1">{#each selectedService.configs as config (config.id)}<a href={detailHref('config', config.id)}><Badge variant="outline">{config.name}</Badge></a>{:else}<span class="text-sm text-muted-foreground">None</span>{/each}</div></div>
								<div><h3 class="mb-2 text-sm font-medium">Secrets ({selectedService.secrets.length})</h3><div class="flex flex-wrap gap-1">{#each selectedService.secrets as secret (secret.id)}<a href={detailHref('secret', secret.id)}><Badge variant="outline">{secret.name}</Badge></a>{:else}<span class="text-sm text-muted-foreground">None</span>{/each}</div></div>
							</div>
						</Card.Content>
					</Card.Root>
				{:else if selectedTask}
					<Card.Root><Card.Header><Card.Title>{selectedTask.name ?? `Task ${selectedTask.id.slice(0, 12)}`}</Card.Title><Card.Description class="font-mono break-all">{selectedTask.id}</Card.Description></Card.Header><Card.Content class="grid gap-3 text-sm sm:grid-cols-2 xl:grid-cols-4">
					<div><span class="text-muted-foreground">Status</span><p><Badge variant={swarmTaskStatusPresentation(selectedTask.state, selectedTask.error).variant} class="capitalize {swarmTaskStatusPresentation(selectedTask.state, selectedTask.error).className}">{selectedTask.state ?? 'unknown'}</Badge></p>{#if selectedTask.error || selectedTask.message}<p class="mt-1 text-xs {selectedTask.error ? 'text-destructive' : 'text-muted-foreground'}">{selectedTask.error || selectedTask.message}</p>{/if}</div>
						<div><span class="text-muted-foreground">Desired state</span><p class="capitalize text-muted-foreground">{selectedTask.desiredState ?? '—'}</p></div>
						<div><span class="text-muted-foreground">Service</span><p>{#if selectedTaskService}<a class="font-medium text-primary hover:underline" href={detailHref('service', selectedTaskService.id)}>{selectedTaskService.name}</a>{:else}{serviceName(selectedTask.serviceId)}{/if}</p></div>
						<div><span class="text-muted-foreground">Node</span><p>{#if selectedTaskNode}<a class="font-medium text-primary hover:underline" href={detailHref('node', selectedTaskNode.id)}>{selectedTaskNode.hostname}</a>{:else}{nodeName(selectedTask.nodeId)}{/if}</p></div>
						<div><span class="text-muted-foreground">Slot</span><p>{selectedTask.slot ?? '—'}</p></div><div class="sm:col-span-2"><span class="text-muted-foreground">Image</span><p class="break-all font-mono text-xs">{selectedTask.image ?? '—'}</p></div><div><span class="text-muted-foreground">Updated</span><p>{formatDate(selectedTask.statusTimestamp ?? selectedTask.updatedAt)}</p></div>
					</Card.Content></Card.Root>
				{:else if selectedNode}
					<Card.Root><Card.Header><div class="flex flex-wrap items-start justify-between gap-3"><div><Card.Title>{selectedNode.hostname}</Card.Title><Card.Description class="font-mono break-all">{selectedNode.id}</Card.Description></div>{#if data.capability.controlAvailable && $canAccess('swarm', 'update')}<div class="flex flex-wrap gap-1"><Button size="sm" variant="outline" onclick={() => openNodeActionDialog(selectedNode, { type: 'availability', availability: 'active' })}>Active</Button><Button size="sm" variant="outline" onclick={() => openNodeActionDialog(selectedNode, { type: 'availability', availability: 'pause' })}>Pause</Button><Button size="sm" variant="destructive" onclick={() => openNodeActionDialog(selectedNode, { type: 'availability', availability: 'drain' })}>Drain</Button></div>{/if}</div></Card.Header><Card.Content class="space-y-5">
						<div class="grid gap-3 text-sm sm:grid-cols-2 xl:grid-cols-4"><div><span class="text-muted-foreground">Role</span><p class="capitalize">{selectedNode.role}</p></div><div><span class="text-muted-foreground">Availability</span><p class="capitalize">{selectedNode.availability}</p></div><div><span class="text-muted-foreground">Status</span><p class="capitalize">{selectedNode.status}</p></div><div><span class="text-muted-foreground">Address</span><p>{selectedNode.address ?? '—'}</p></div><div><span class="text-muted-foreground">Engine</span><p>{selectedNode.engineVersion ?? '—'}</p></div><div><span class="text-muted-foreground">Platform</span><p>{selectedNode.platform?.os ?? '—'} / {selectedNode.platform?.architecture ?? '—'}</p></div><div><span class="text-muted-foreground">Resources</span><p>{formatCpu(selectedNode.resources?.nanoCpus)} · {formatBytes(selectedNode.resources?.memoryBytes)}</p></div><div><span class="text-muted-foreground">Tasks</span><p>{selectedNodeTasks.length}</p></div></div>
						<div class="grid gap-4 lg:grid-cols-2"><div><h3 class="mb-2 text-sm font-medium">Services on this node</h3><div class="flex flex-wrap gap-1">{#each selectedNodeServices as service (service.id)}<a href={detailHref('service', service.id)}><Badge variant="outline">{service.name}</Badge></a>{:else}<span class="text-sm text-muted-foreground">None</span>{/each}</div></div><div><h3 class="mb-2 text-sm font-medium">Tasks on this node</h3><div class="flex flex-wrap gap-1">{#each selectedNodeTasks as task (task.id)}<a href={detailHref('task', task.id)}><Badge variant={swarmTaskStatusPresentation(task.state, task.error).variant} class={swarmTaskStatusPresentation(task.state, task.error).className}>{serviceName(task.serviceId)} · {task.slot ?? task.id.slice(0, 8)}</Badge></a>{:else}<span class="text-sm text-muted-foreground">None</span>{/each}</div></div></div>
						{#if Object.keys(selectedNode.labels).length}<div><h3 class="mb-2 text-sm font-medium">Labels</h3><div class="flex flex-wrap gap-1">{#each Object.entries(selectedNode.labels) as [key, value] (key)}<Badge variant="outline" class="font-mono">{key}={value}</Badge>{/each}</div></div>{/if}
					</Card.Content></Card.Root>
				{:else if selectedStack}
					<Card.Root><Card.Header><div class="flex flex-wrap items-start justify-between gap-3"><div><Card.Title>{selectedStack.name}</Card.Title><Card.Description>Swarm stack · {selectedStack.runningTasks} / {selectedStack.desiredTasks ?? '—'} running</Card.Description></div>{#if data.capability.controlAvailable && $canAccess('swarm', 'update')}<div class="flex gap-2"><Button variant="outline" size="sm" onclick={() => openEditStackDialog(selectedStack)}><Pencil class="h-4 w-4" /> Edit / Redeploy</Button><Button variant="destructive" size="sm" onclick={() => openRemoveStackDialog(selectedStack)}><Trash2 class="h-4 w-4" /> Remove</Button></div>{/if}</div></Card.Header><Card.Content><h3 class="mb-2 text-sm font-medium">Services ({selectedStack.services.length})</h3><div class="flex flex-wrap gap-1">{#each selectedStack.services as service (service.id)}<a href={detailHref('service', service.id)}><Badge variant={swarmStatusPresentation(service.healthState).variant} class={swarmStatusPresentation(service.healthState).className}>{service.name} · {service.runningTasks}/{service.desiredTasks ?? '—'}</Badge></a>{/each}</div></Card.Content></Card.Root>
				{:else if selectedConfig}
					<Card.Root><Card.Header><div class="flex flex-wrap items-start justify-between gap-3"><div><Card.Title>{selectedConfig.name}</Card.Title><Card.Description class="font-mono break-all">{selectedConfig.id}</Card.Description></div>{#if data.capability.controlAvailable && $canAccess('swarm', 'update')}<div class="flex flex-wrap gap-2"><Button size="sm" variant="outline" onclick={() => openMetadataDialog('config', selectedConfig)}><Pencil class="h-4 w-4" /> Edit labels</Button><Button size="sm" variant="outline" onclick={() => openReplaceConfigDialog(selectedConfig)}><Pencil class="h-4 w-4" /> Edit Config</Button><Button size="sm" variant="destructive" onclick={() => openDeleteResourceDialog('config', selectedConfig)} disabled={selectedConfig.services.length > 0}><Trash2 class="h-4 w-4" /> Delete</Button></div>{/if}</div></Card.Header><Card.Content class="space-y-5">
						<div class="grid gap-3 text-sm sm:grid-cols-2 xl:grid-cols-4"><div><span class="text-muted-foreground">Created</span><p>{formatDate(selectedConfig.createdAt)}</p></div><div><span class="text-muted-foreground">Updated</span><p>{formatDate(selectedConfig.updatedAt)}</p></div><div><span class="text-muted-foreground">Version</span><p>{selectedConfig.version}</p></div><div><span class="text-muted-foreground">Stacks</span><p>{#each selectedConfig.stackNames as stack, index (stack)}{#if index}, {/if}<a class="font-medium text-primary hover:underline" href={detailHref('stack', stack)}>{stack}</a>{:else}None derived{/each}</p></div></div>
						<div class="grid gap-4 lg:grid-cols-2"><div><h3 class="mb-2 text-sm font-medium">Labels</h3><div class="flex flex-wrap gap-1">{#each Object.entries(selectedConfig.labels) as [key, value] (key)}<Badge variant="outline" class="font-mono">{key}={value}</Badge>{:else}<span class="text-sm text-muted-foreground">No labels</span>{/each}</div></div><div><h3 class="mb-2 text-sm font-medium">Used by Services</h3><div class="flex flex-wrap gap-1">{#each selectedConfig.services as usage (usage.serviceId)}<a href={detailHref('service', usage.serviceId)}><Badge variant="outline">{usage.serviceName}</Badge></a>{:else}<span class="text-sm text-muted-foreground">Unused</span>{/each}</div></div></div>
						<div><div class="mb-2 flex items-center justify-between gap-2"><div><h3 class="text-sm font-medium">Config data</h3><p class="text-xs text-muted-foreground">Docker Config data is immutable. Edit Config creates an updated Config and lets you choose which Service references move to it.</p></div><Button size="sm" variant="outline" onclick={() => copyConfigData(selectedConfig)} disabled={selectedConfig.data === undefined}>{#if copiedConfigId === selectedConfig.id}<Check class="h-4 w-4" /> Copied{:else}<Copy class="h-4 w-4" /> Copy{/if}</Button></div>{#if selectedConfig.data !== undefined}<pre class="max-h-80 overflow-auto whitespace-pre-wrap break-words rounded-md border bg-muted/30 p-3 font-mono text-xs">{selectedConfig.data}</pre>{:else}<Alert.Root><TriangleAlert class="h-4 w-4" /><Alert.Description>Config data was not returned by this manager endpoint.</Alert.Description></Alert.Root>{/if}</div>
					</Card.Content></Card.Root>
				{:else if selectedSecret}
					<Card.Root><Card.Header><div class="flex flex-wrap items-start justify-between gap-3"><div><Card.Title>{selectedSecret.name}</Card.Title><Card.Description class="font-mono break-all">{selectedSecret.id}</Card.Description></div>{#if data.capability.controlAvailable && $canAccess('swarm', 'update')}<div class="flex gap-2"><Button size="sm" variant="outline" onclick={() => openMetadataDialog('secret', selectedSecret)}><Pencil class="h-4 w-4" /> Edit labels</Button><Button size="sm" variant="destructive" onclick={() => openDeleteResourceDialog('secret', selectedSecret)} disabled={selectedSecret.services.length > 0}><Trash2 class="h-4 w-4" /> Delete</Button></div>{/if}</div></Card.Header><Card.Content class="space-y-5">
						<div class="grid gap-3 text-sm sm:grid-cols-2 xl:grid-cols-4"><div><span class="text-muted-foreground">Created</span><p>{formatDate(selectedSecret.createdAt)}</p></div><div><span class="text-muted-foreground">Updated</span><p>{formatDate(selectedSecret.updatedAt)}</p></div><div><span class="text-muted-foreground">Version</span><p>{selectedSecret.version}</p></div><div><span class="text-muted-foreground">Stacks</span><p>{#each selectedSecret.stackNames as stack, index (stack)}{#if index}, {/if}<a class="font-medium text-primary hover:underline" href={detailHref('stack', stack)}>{stack}</a>{:else}None derived{/each}</p></div></div>
						<Alert.Root><ShieldAlert class="h-4 w-4" /><Alert.Title>Secret value is never available</Alert.Title><Alert.Description>Docker does not return secret data after creation, and Dockhand neither requests nor reconstructs it.</Alert.Description></Alert.Root>
						<div class="grid gap-4 lg:grid-cols-2"><div><h3 class="mb-2 text-sm font-medium">Labels</h3><div class="flex flex-wrap gap-1">{#each Object.entries(selectedSecret.labels) as [key, value] (key)}<Badge variant="outline" class="font-mono">{key}={value}</Badge>{:else}<span class="text-sm text-muted-foreground">No labels</span>{/each}</div></div><div><h3 class="mb-2 text-sm font-medium">Used by Services</h3><div class="flex flex-wrap gap-1">{#each selectedSecret.services as usage (usage.serviceId)}<a href={detailHref('service', usage.serviceId)}><Badge variant="outline">{usage.serviceName}</Badge></a>{:else}<span class="text-sm text-muted-foreground">Unused</span>{/each}</div></div></div>
					</Card.Content></Card.Root>
				{/if}
			{/if}

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
								<Table.Cell><a class="font-medium text-primary hover:underline" href={detailHref('node', node.id)}>{node.hostname}</a><div class="text-xs text-muted-foreground font-mono">{node.address ?? node.id.slice(0, 12)}</div></Table.Cell>
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

			{#if !selectedService}
			<Tabs.Content value="services" class="min-h-0 overflow-auto rounded-md border">
				<Table.Root>
					<Table.Header><Table.Row><Table.Head>Service</Table.Head><Table.Head>Image</Table.Head><Table.Head>Mode</Table.Head><Table.Head>Replicas</Table.Head><Table.Head>Health / update</Table.Head><Table.Head>Placement</Table.Head>{#if data.capability.controlAvailable && $canAccess('swarm', 'update')}<Table.Head class="text-right">Actions</Table.Head>{/if}</Table.Row></Table.Header>
					<Table.Body>
						{#each data.services as service (service.id)}
							<Table.Row>
								<Table.Cell><a class="font-medium text-primary hover:underline" href={detailHref('service', service.id)}>{service.name}</a><div class="text-xs text-muted-foreground font-mono">{service.id.slice(0, 12)}</div>{#if service.stackName}<div class="mt-1 flex flex-wrap items-center gap-1"><Badge variant="outline" class="border-amber-600/30 bg-amber-500/10 text-amber-700 dark:text-amber-400">Stack-managed</Badge><a class="text-xs text-muted-foreground hover:text-foreground hover:underline" href={detailHref('stack', service.stackName)}>{service.stackName}</a></div>{/if}</Table.Cell>
								<Table.Cell class="max-w-[28rem] truncate font-mono text-xs" title={service.image}>{service.image ?? '—'}</Table.Cell>
								<Table.Cell><Badge variant="outline" class="capitalize">{service.mode.replace('-', ' ')}</Badge>{#if service.mode === 'global'}<div class="mt-1 max-w-40 text-xs text-muted-foreground">One task per eligible node · no manual scale</div>{/if}</Table.Cell>
								<Table.Cell>
									{#if service.mode === 'replicated'}
										<div class="flex items-center gap-1">
											{#if data.capability.controlAvailable && $canAccess('swarm', 'update') && !isStackManagedSwarmService(service)}
												<Button variant="outline" size="icon" class="h-7 w-7" onclick={() => scaleServiceBy(service, -1)} disabled={Boolean(pendingScaleFor(service.id)) || (service.desiredTasks ?? 0) <= 0} aria-label={`Scale ${service.name} down`}><Minus class="h-3.5 w-3.5" /></Button>
											{/if}
											<Badge variant={swarmStatusPresentation(hasReplicaMismatch(service) || pendingScaleFor(service.id) ? 'partial' : 'stable').variant} class="tabular-nums {swarmStatusPresentation(hasReplicaMismatch(service) || pendingScaleFor(service.id) ? 'partial' : 'stable').className}">{service.runningTasks} / {service.desiredTasks ?? '—'}</Badge>
											{#if data.capability.controlAvailable && $canAccess('swarm', 'update') && !isStackManagedSwarmService(service)}
												<Button variant="outline" size="icon" class="h-7 w-7" onclick={() => scaleServiceBy(service, 1)} disabled={Boolean(pendingScaleFor(service.id))} aria-label={`Scale ${service.name} up`}><Plus class="h-3.5 w-3.5" /></Button>
											{/if}
										</div>
										<div class="mt-1 text-xs text-muted-foreground">Running / desired{#if pendingScaleFor(service.id)} · Pending target {pendingScaleFor(service.id)?.target}{:else if hasReplicaMismatch(service)} · Reconciling{/if}</div>
									{:else if service.mode === 'global'}
										<span>{service.runningTasks} running</span><div class="text-xs text-muted-foreground">Managed by eligible nodes</div>
									{:else}
										<span>{service.runningTasks} running</span>{#if service.completedTasks > 0}<div class="text-xs text-muted-foreground">{service.completedTasks} completed</div>{/if}
									{/if}
								</Table.Cell>
								<Table.Cell><Badge variant={swarmStatusPresentation(service.healthState).variant} class="capitalize {swarmStatusPresentation(service.healthState).className}">{service.healthState}</Badge>{#if service.updateStatus?.state}<div class="mt-1"><Badge variant={swarmStatusPresentation(service.updateStatus.state).variant} class="capitalize {swarmStatusPresentation(service.updateStatus.state).className}">{service.updateStatus.state}</Badge></div>{/if}</Table.Cell>
								<Table.Cell class="max-w-[22rem] text-xs">{service.constraints.join(', ') || 'No constraints'}{#if service.preferences.length}<div class="text-muted-foreground">{service.preferences.length} preference(s)</div>{/if}</Table.Cell>
								{#if data.capability.controlAvailable && $canAccess('swarm', 'update')}
									<Table.Cell>
										<div class="flex justify-end gap-2">
											{#if service.stackName}
												<Button variant="outline" size="sm" href={detailHref('stack', service.stackName)}><Layers class="h-4 w-4" /> Open stack</Button>
											{:else if service.mode === 'replicated' || service.mode === 'global'}
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
			{/if}

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
									<Table.Cell><a class="font-medium text-primary hover:underline" href={detailHref('stack', stack.name)}>{stack.name}</a><div class="text-xs text-muted-foreground">Swarm stack</div></Table.Cell>
									<Table.Cell><div class="flex flex-wrap gap-1">{#each stack.services as service (service.id)}<a href={detailHref('service', service.id)}><Badge variant="outline">{service.name}</Badge></a>{/each}</div></Table.Cell>
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
										{#if task.serviceId}<a class="font-medium text-primary hover:underline" href={detailHref('service', task.serviceId)}>{serviceName(task.serviceId)}</a>{:else}<div class="font-medium">Unassigned</div>{/if}
										<div class="text-xs text-muted-foreground">
											{#if task.name}{task.name} · {/if}<a class="font-mono hover:text-foreground hover:underline" href={detailHref('task', task.id)} title={task.id}>{task.id.slice(0, 12)}</a>
										</div>
									</Table.Cell>
									<Table.Cell>
										<Badge variant={swarmTaskStatusPresentation(task.state, task.error).variant} class="capitalize {swarmTaskStatusPresentation(task.state, task.error).className}">{task.state ?? 'unknown'}</Badge>
										{#if task.error || task.message}<div class="mt-1 max-w-64 truncate text-xs {task.error ? 'text-destructive' : 'text-muted-foreground'}" title={task.error || task.message}>{task.error || task.message}</div>{/if}
									</Table.Cell>
									<Table.Cell class="capitalize text-muted-foreground">{task.desiredState ?? '—'}</Table.Cell>
									<Table.Cell>{#if task.nodeId}<a class="text-primary hover:underline" href={detailHref('node', task.nodeId)}>{nodeName(task.nodeId)}</a>{:else}Unassigned{/if}</Table.Cell>
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
									<Table.Cell><a class="font-medium text-primary hover:underline" href={detailHref('config', config.id)}>{config.name}</a>{#if Object.keys(config.labels).length}<div class="text-xs text-muted-foreground">{Object.keys(config.labels).length} label(s)</div>{/if}</Table.Cell>
									<Table.Cell class="font-mono text-xs" title={config.id}>{config.id.slice(0, 12)}</Table.Cell>
									<Table.Cell class="text-sm">{formatDate(config.createdAt)}</Table.Cell>
									<Table.Cell class="text-sm">{formatDate(config.updatedAt)}</Table.Cell>
									<Table.Cell>{#if config.services.length}<div class="flex flex-wrap gap-1">{#each config.services as usage (usage.serviceId)}<a href={detailHref('service', usage.serviceId)}><Badge variant="outline">{usage.serviceName}</Badge></a>{/each}</div>{:else}<span class="text-muted-foreground">Unused</span>{/if}</Table.Cell>
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
									<Table.Cell><a class="font-medium text-primary hover:underline" href={detailHref('secret', secret.id)}>{secret.name}</a>{#if Object.keys(secret.labels).length}<div class="text-xs text-muted-foreground">{Object.keys(secret.labels).length} label(s)</div>{/if}</Table.Cell>
									<Table.Cell class="font-mono text-xs" title={secret.id}>{secret.id.slice(0, 12)}</Table.Cell>
									<Table.Cell class="text-sm">{formatDate(secret.createdAt)}</Table.Cell>
									<Table.Cell class="text-sm">{formatDate(secret.updatedAt)}</Table.Cell>
									<Table.Cell>{#if secret.services.length}<div class="flex flex-wrap gap-1">{#each secret.services as usage (usage.serviceId)}<a href={detailHref('service', usage.serviceId)}><Badge variant="outline">{usage.serviceName}</Badge></a>{/each}</div>{:else}<span class="text-muted-foreground">Unused</span>{/if}</Table.Cell>
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

<Dialog.Root bind:open={metadataDialogOpen} onOpenChange={(open) => { if (!open) closeMetadataDialog(); }}>
	<Dialog.Content class="max-w-lg">
		<Dialog.Header>
			<Dialog.Title>Edit {resourceLabel(metadataKind)} labels</Dialog.Title>
			<Dialog.Description>
				Docker permits in-place label updates only. The immutable {metadataKind === 'config' ? 'Config data' : 'Secret value'} and name are left unchanged.
			</Dialog.Description>
		</Dialog.Header>
		<div class="space-y-2">
			<Label for="swarm-resource-labels">Labels</Label>
			<Textarea id="swarm-resource-labels" bind:value={metadataLabels} disabled={resourcePending} rows={8} placeholder={'com.example.team=platform\ncom.example.environment=production'} />
			<p class="text-xs text-muted-foreground">One <code>key=value</code> label per line. Remove a line to remove that label.</p>
		</div>
		{#if resourceError}<Alert.Root variant="destructive"><TriangleAlert class="h-4 w-4" /><Alert.Description>{resourceError}</Alert.Description></Alert.Root>{/if}
		<Dialog.Footer>
			<Button variant="outline" onclick={closeMetadataDialog} disabled={resourcePending}>Cancel</Button>
			<Button onclick={updateResourceMetadata} disabled={resourcePending || !metadataResource}>{#if resourcePending}<Loader2 class="h-4 w-4 animate-spin" />{/if}Save labels</Button>
		</Dialog.Footer>
	</Dialog.Content>
</Dialog.Root>

<Dialog.Root bind:open={replaceConfigDialogOpen} onOpenChange={(open) => { if (!open) closeReplaceConfigDialog(); }}>
	<Dialog.Content class="flex h-[min(90vh,52rem)] max-w-3xl flex-col">
		<Dialog.Header>
			<Dialog.Title>Edit Config “{replaceConfigSource?.name}”</Dialog.Title>
			<Dialog.Description>
				Docker Config data cannot change in place. Dockhand will create an updated Config and change only the Service references you explicitly select below.
			</Dialog.Description>
		</Dialog.Header>
		<div class="space-y-2">
			<Label for="swarm-replacement-name">Updated Config name</Label>
			<Input id="swarm-replacement-name" bind:value={replacementName} disabled={resourcePending} autocomplete="off" />
		</div>
		<div class="mt-3 min-h-0 flex-1 space-y-2">
			<Label for="swarm-replacement-data">Config data</Label>
			<Textarea id="swarm-replacement-data" class="h-[calc(100%-1.75rem)] min-h-48 font-mono text-xs" bind:value={replacementValue} disabled={resourcePending} />
		</div>
		<div class="mt-3 space-y-2">
			<div><h3 class="text-sm font-medium">Update Service references</h3><p class="text-xs text-muted-foreground">Unchecked Services keep using {replaceConfigSource?.name}. Updating a Service starts Docker's configured rolling update.</p></div>
			<div class="max-h-36 space-y-2 overflow-auto rounded-md border p-3">
				{#each replaceConfigSource?.services ?? [] as usage (usage.serviceId)}
					<label class="flex items-start gap-3 text-sm">
						<Checkbox checked={replacementServiceIds.includes(usage.serviceId)} onCheckedChange={(checked) => setReplacementService(usage.serviceId, checked === true)} disabled={resourcePending || Boolean(usage.stackName)} />
						<span class="min-w-0"><span class="font-medium">{usage.serviceName}</span>{#if usage.stackName}<span class="ml-2 text-xs text-muted-foreground">Stack: <a class="text-primary hover:underline" href={detailHref('stack', usage.stackName)}>{usage.stackName}</a></span><br /><span class="text-xs text-amber-600 dark:text-amber-400">Stack-managed: edit the stored stack definition and redeploy it. Dockhand will not change this live Service reference directly.</span>{/if}</span>
					</label>
				{:else}
					<p class="text-sm text-muted-foreground">This Config is not currently used by a Service.</p>
				{/each}
			</div>
		</div>
		<label class="mt-3 flex items-start gap-3 rounded-md border p-3 text-sm">
			<Checkbox bind:checked={replacementConfirmed} disabled={resourcePending} />
			<span><strong>Apply only the choices shown above.</strong><br /><span class="text-muted-foreground">Dockhand creates a new Config. Unchecked references and stored Stack definitions remain unchanged.</span></span>
		</label>
		{#if resourceError}<Alert.Root variant="destructive"><TriangleAlert class="h-4 w-4" /><Alert.Description>{resourceError}</Alert.Description></Alert.Root>{/if}
		<Dialog.Footer>
			<Button variant="outline" onclick={closeReplaceConfigDialog} disabled={resourcePending}>Cancel</Button>
			<Button onclick={createConfigReplacement} disabled={resourcePending || !replacementName.trim() || !replacementConfirmed}>{#if resourcePending}<Loader2 class="h-4 w-4 animate-spin" />{/if}Save as updated Config</Button>
		</Dialog.Footer>
	</Dialog.Content>
</Dialog.Root>

<Dialog.Root bind:open={actionDialogOpen} onOpenChange={(open) => { if (!open) closeActionDialog(); }}>
	<Dialog.Content class="max-w-md">
		<Dialog.Header>
			<Dialog.Title>Restart Swarm service</Dialog.Title>
			<Dialog.Description>
				Force-update <strong>{actionService?.name}</strong>? Swarm will replace all current service tasks using the existing service specification.
			</Dialog.Description>
		</Dialog.Header>
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
				Restart service
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
