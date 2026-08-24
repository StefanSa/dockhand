<script lang="ts">
	import { Layers, Loader2, Plus, Trash2, TriangleAlert } from 'lucide-svelte';
	import * as Alert from '$lib/components/ui/alert';
	import { Button } from '$lib/components/ui/button';
	import { Checkbox } from '$lib/components/ui/checkbox';
	import * as Dialog from '$lib/components/ui/dialog';
	import { Input } from '$lib/components/ui/input';
	import { Label } from '$lib/components/ui/label';
	import * as Select from '$lib/components/ui/select';
	import * as Tabs from '$lib/components/ui/tabs';
	import { Textarea } from '$lib/components/ui/textarea';
	import { swarmDetailHref } from '$lib/swarm-navigation';
	import type {
		SwarmConfigSummary,
		SwarmNetworkSummary,
		SwarmSecretSummary,
		SwarmServiceMount,
		SwarmServiceNetworkAttachment,
		SwarmServicePort,
		SwarmServiceResourceReference,
		SwarmServiceSummary,
		SwarmServiceUpdateInput,
		SwarmServiceUpdatePolicy
	} from '$lib/types/swarm';

	let {
		open = $bindable(false),
		mode = 'edit',
		service,
		environmentId,
		networks,
		configs,
		secrets,
		onSaved
	}: {
		open: boolean;
		mode?: 'create' | 'edit';
		service: SwarmServiceSummary | null;
		environmentId: number | null;
		networks: SwarmNetworkSummary[];
		configs: SwarmConfigSummary[];
		secrets: SwarmSecretSummary[];
		onSaved: (result: { id?: string; name: string; mode: 'replicated' | 'global' }) => void | Promise<void>;
	} = $props();

	let activeTab = $state('general');
	let pending = $state(false);
	let error = $state<string | null>(null);
	let initializedKey = $state<string | null>(null);
	let serviceName = $state('');
	let serviceMode = $state<'replicated' | 'global'>('replicated');
	let previousServiceMode = $state<'replicated' | 'global'>('replicated');
	let image = $state('');
	let replicas = $state(0);
	let endpointMode = $state<'vip' | 'dnsrr'>('vip');
	let command = $state('');
	let args = $state('');
	let environment = $state('');
	let labels = $state('');
	let healthcheckTest = $state('');
	let healthcheckIntervalSeconds = $state<number | undefined>(undefined);
	let healthcheckTimeoutSeconds = $state<number | undefined>(undefined);
	let healthcheckRetries = $state<number | undefined>(undefined);
	let healthcheckStartPeriodSeconds = $state<number | undefined>(undefined);
	let stopGracePeriodSeconds = $state<number | undefined>(undefined);
	let ports = $state<SwarmServicePort[]>([]);
	let mounts = $state<SwarmServiceMount[]>([]);
	let networkAttachments = $state<SwarmServiceNetworkAttachment[]>([]);
	let configReferences = $state<SwarmServiceResourceReference[]>([]);
	let secretReferences = $state<SwarmServiceResourceReference[]>([]);
	let networkSearch = $state('');
	let configSearch = $state('');
	let secretSearch = $state('');
	let constraints = $state('');
	let limitCores = $state<number | undefined>(undefined);
	let limitMemoryMb = $state<number | undefined>(undefined);
	let reservationCores = $state<number | undefined>(undefined);
	let reservationMemoryMb = $state<number | undefined>(undefined);
	let restartCondition = $state<'none' | 'on-failure' | 'any'>('any');
	let restartDelaySeconds = $state<number | undefined>(undefined);
	let restartMaxAttempts = $state<number | undefined>(undefined);
	let restartWindowSeconds = $state<number | undefined>(undefined);
	let updatePolicy = $state<SwarmServiceUpdatePolicy>(defaultPolicy());
	let rollbackPolicy = $state<SwarmServiceUpdatePolicy>(defaultPolicy());
	const policySections = $derived<Array<{ title: string; policy: SwarmServiceUpdatePolicy }>>([
		{ title: 'Update policy', policy: updatePolicy },
		{ title: 'Rollback policy', policy: rollbackPolicy }
	]);
	const filteredNetworks = $derived(networks.filter((network) => (network.scope === 'swarm' || network.driver === 'overlay')
		&& network.name.toLowerCase().includes(networkSearch.trim().toLowerCase())));
	const filteredConfigs = $derived(configs.filter((config) => config.name.toLowerCase().includes(configSearch.trim().toLowerCase())));
	const filteredSecrets = $derived(secrets.filter((secret) => secret.name.toLowerCase().includes(secretSearch.trim().toLowerCase())));

	function defaultPolicy(): SwarmServiceUpdatePolicy {
		return { parallelism: 1, delaySeconds: 0, failureAction: 'pause', monitorSeconds: 5, maxFailureRatio: 0, order: 'stop-first' };
	}

	function copyPolicy(policy: SwarmServiceUpdatePolicy | undefined): SwarmServiceUpdatePolicy {
		return { ...(policy ?? defaultPolicy()) };
	}

	function resetForm(): void {
		activeTab = 'general';
		error = null;
		serviceName = '';
		serviceMode = 'replicated';
		previousServiceMode = 'replicated';
		image = '';
		replicas = 1;
		endpointMode = 'vip';
		command = '';
		args = '';
		environment = '';
		labels = '';
		healthcheckTest = '';
		healthcheckIntervalSeconds = undefined;
		healthcheckTimeoutSeconds = undefined;
		healthcheckRetries = undefined;
		healthcheckStartPeriodSeconds = undefined;
		stopGracePeriodSeconds = undefined;
		ports = [];
		mounts = [];
		networkAttachments = [];
		configReferences = [];
		secretReferences = [];
		networkSearch = '';
		configSearch = '';
		secretSearch = '';
		constraints = '';
		limitCores = undefined;
		limitMemoryMb = undefined;
		reservationCores = undefined;
		reservationMemoryMb = undefined;
		restartCondition = 'any';
		restartDelaySeconds = undefined;
		restartMaxAttempts = undefined;
		restartWindowSeconds = undefined;
		updatePolicy = defaultPolicy();
		rollbackPolicy = defaultPolicy();
	}

	function lines(value: string[]): string {
		return value.join('\n');
	}

	function parseLines(value: string, keepWhitespace = false): string[] {
		return value.split('\n')
			.map((entry) => keepWhitespace ? entry.replace(/\r$/, '') : entry.trim())
			.filter((entry) => entry.length > 0);
	}

	function labelLines(value: Record<string, string>): string {
		return Object.entries(value).map(([key, item]) => `${key}=${item}`).join('\n');
	}

	function parseLabels(value: string): Record<string, string> {
		return Object.fromEntries(parseLines(value, true).map((entry) => {
			const separator = entry.indexOf('=');
			return separator < 0 ? [entry.trim(), ''] : [entry.slice(0, separator).trim(), entry.slice(separator + 1)];
		}));
	}

	function initialize(current: SwarmServiceSummary): void {
		initializedKey = `edit:${current.id}`;
		activeTab = 'general';
		error = null;
		serviceName = current.name;
		serviceMode = current.mode === 'global' ? 'global' : 'replicated';
		previousServiceMode = serviceMode;
		image = current.image ?? '';
		replicas = current.mode === 'replicated' ? current.desiredTasks ?? 0 : 0;
		endpointMode = current.endpointMode ?? 'vip';
		command = lines(current.command);
		args = lines(current.args);
		environment = lines(current.environment);
		labels = labelLines(current.labels);
		healthcheckTest = lines(current.healthcheck?.test ?? []);
		healthcheckIntervalSeconds = current.healthcheck?.intervalSeconds;
		healthcheckTimeoutSeconds = current.healthcheck?.timeoutSeconds;
		healthcheckRetries = current.healthcheck?.retries;
		healthcheckStartPeriodSeconds = current.healthcheck?.startPeriodSeconds;
		stopGracePeriodSeconds = current.stopGracePeriodSeconds;
		ports = current.ports.map((port) => ({ ...port }));
		mounts = current.mounts.map((mount) => ({ ...mount }));
		networkAttachments = current.networks.map((network) => ({ ...network, aliases: [...network.aliases], driverOpts: { ...network.driverOpts } }));
		configReferences = current.configs.map((reference) => ({ ...reference }));
		secretReferences = current.secrets.map((reference) => ({ ...reference }));
		networkSearch = '';
		configSearch = '';
		secretSearch = '';
		constraints = lines(current.constraints);
		limitCores = current.resources.limits.cores;
		limitMemoryMb = current.resources.limits.memoryMb;
		reservationCores = current.resources.reservations.cores;
		reservationMemoryMb = current.resources.reservations.memoryMb;
		restartCondition = current.restartPolicy?.condition ?? 'any';
		restartDelaySeconds = current.restartPolicy?.delaySeconds;
		restartMaxAttempts = current.restartPolicy?.maxAttempts;
		restartWindowSeconds = current.restartPolicy?.windowSeconds;
		updatePolicy = copyPolicy(current.updatePolicy);
		rollbackPolicy = copyPolicy(current.rollbackPolicy);
	}

	$effect(() => {
		if (open && mode === 'create' && initializedKey !== 'create') {
			resetForm();
			initializedKey = 'create';
		} else if (open && mode === 'edit' && service && initializedKey !== `edit:${service.id}`) {
			initialize(service);
		}
		if (!open) initializedKey = null;
	});

	$effect(() => {
		if (serviceMode === 'replicated' && previousServiceMode === 'global' && replicas === 0) replicas = 1;
		previousServiceMode = serviceMode;
	});

	function addPort(): void {
		ports = [...ports, { protocol: 'tcp', targetPort: 80, publishMode: 'ingress' }];
	}

	function removePort(index: number): void {
		ports = ports.filter((_, itemIndex) => itemIndex !== index);
	}

	function addMount(): void {
		mounts = [...mounts, { type: 'volume', source: '', target: '', readOnly: false }];
	}

	function removeMount(index: number): void {
		mounts = mounts.filter((_, itemIndex) => itemIndex !== index);
	}

	function attachmentFor(network: SwarmNetworkSummary): SwarmServiceNetworkAttachment | undefined {
		return networkAttachments.find((item) => item.target === network.id || item.target === network.name);
	}

	function toggleNetwork(network: SwarmNetworkSummary, checked: boolean): void {
		const existing = attachmentFor(network);
		if (checked && !existing) networkAttachments = [...networkAttachments, { target: network.id, aliases: [], driverOpts: {} }];
		if (!checked && existing) networkAttachments = networkAttachments.filter((item) => item !== existing);
	}

	function networkName(target: string): string {
		return networks.find((network) => network.id === target || network.name === target)?.name ?? target;
	}

	function updateNetworkAliases(target: string, value: string): void {
		networkAttachments = networkAttachments.map((attachment) => attachment.target === target
			? { ...attachment, aliases: value.split(',').map((alias) => alias.trim()).filter(Boolean) }
			: attachment);
	}

	function removeNetwork(target: string): void {
		networkAttachments = networkAttachments.filter((attachment) => attachment.target !== target);
	}

	function toggleResource(kind: 'config' | 'secret', resource: SwarmConfigSummary | SwarmSecretSummary, checked: boolean): void {
		const current = kind === 'config' ? configReferences : secretReferences;
		const next = checked
			? current.some((item) => item.id === resource.id) ? current : [...current, { id: resource.id, name: resource.name, target: resource.name }]
			: current.filter((item) => item.id !== resource.id);
		if (kind === 'config') configReferences = next;
		else secretReferences = next;
	}

	function resourceName(kind: 'config' | 'secret', id: string): string {
		return (kind === 'config' ? configs : secrets).find((item) => item.id === id)?.name ?? id;
	}

	function removeResource(kind: 'config' | 'secret', id: string): void {
		if (kind === 'config') configReferences = configReferences.filter((reference) => reference.id !== id);
		else secretReferences = secretReferences.filter((reference) => reference.id !== id);
	}

	async function save(): Promise<void> {
		if (!environmentId || pending || (mode === 'edit' && !service) || (mode === 'create' && !serviceName.trim())) return;
		pending = true;
		error = null;
		const selectedMode = serviceMode;
		const spec: SwarmServiceUpdateInput = {
			image,
			mode: selectedMode,
			replicas: selectedMode === 'replicated' ? Number(replicas) : null,
			command: parseLines(command, true),
			args: parseLines(args, true),
			environment: parseLines(environment),
			labels: parseLabels(labels),
			healthcheck: parseLines(healthcheckTest, true).length > 0 ? {
				test: parseLines(healthcheckTest, true),
				intervalSeconds: healthcheckIntervalSeconds === undefined ? undefined : Number(healthcheckIntervalSeconds),
				timeoutSeconds: healthcheckTimeoutSeconds === undefined ? undefined : Number(healthcheckTimeoutSeconds),
				retries: healthcheckRetries === undefined ? undefined : Number(healthcheckRetries),
				startPeriodSeconds: healthcheckStartPeriodSeconds === undefined ? undefined : Number(healthcheckStartPeriodSeconds)
			} : undefined,
			ports: ports.map((port) => ({ ...port, targetPort: Number(port.targetPort), publishedPort: port.publishedPort ? Number(port.publishedPort) : undefined })),
			mounts,
			networks: networkAttachments,
			configs: configReferences,
			secrets: secretReferences,
			constraints: parseLines(constraints),
			resources: {
				limits: { cores: limitCores === undefined ? undefined : Number(limitCores), memoryMb: limitMemoryMb === undefined ? undefined : Number(limitMemoryMb) },
				reservations: { cores: reservationCores === undefined ? undefined : Number(reservationCores), memoryMb: reservationMemoryMb === undefined ? undefined : Number(reservationMemoryMb) }
			},
			restartPolicy: {
				condition: restartCondition,
				delaySeconds: restartDelaySeconds === undefined ? undefined : Number(restartDelaySeconds),
				maxAttempts: restartMaxAttempts === undefined ? undefined : Number(restartMaxAttempts),
				windowSeconds: restartWindowSeconds === undefined ? undefined : Number(restartWindowSeconds)
			},
			updatePolicy: { ...updatePolicy },
			rollbackPolicy: { ...rollbackPolicy },
			stopGracePeriodSeconds: stopGracePeriodSeconds === undefined ? undefined : Number(stopGracePeriodSeconds),
			endpointMode
		};

		try {
			const response = await fetch(mode === 'create'
				? `/api/swarm/services?env=${environmentId}`
				: `/api/swarm/services/${encodeURIComponent(service!.id)}?env=${environmentId}`, {
				method: 'POST',
				headers: { 'Content-Type': 'application/json' },
				body: JSON.stringify(mode === 'create'
					? { name: serviceName.trim(), spec }
					: { action: 'update', spec })
			});
			const body = await response.json().catch(() => ({}));
			if (!response.ok) throw new Error(body.error || `Failed to ${mode === 'create' ? 'create' : 'update'} Swarm service`);
			open = false;
			await onSaved({ id: body.id, name: mode === 'create' ? serviceName.trim() : service!.name, mode: selectedMode });
		} catch (saveError) {
			error = saveError instanceof Error ? saveError.message : `Failed to ${mode === 'create' ? 'create' : 'update'} Swarm service`;
		} finally {
			pending = false;
		}
	}
</script>

<Dialog.Root bind:open>
	<Dialog.Content class="flex h-[min(92vh,58rem)] max-w-6xl flex-col">
		<Dialog.Header>
			<Dialog.Title>{mode === 'create' ? 'Create standalone Swarm service' : `Edit Swarm service “${service?.name}”`}</Dialog.Title>
			<Dialog.Description>{mode === 'create' ? 'Create a service directly on this Swarm. It will not be managed by a stack file.' : 'Docker applies the saved ServiceSpec as a rolling update.'} One item per line is one Docker argument or environment entry; no shell parsing is performed.</Dialog.Description>
		</Dialog.Header>
		{#if mode === 'edit' && service?.stackName}
			<Alert.Root class="border-amber-600/30 bg-amber-500/10">
				<TriangleAlert class="h-4 w-4 text-amber-700 dark:text-amber-400" />
				<Alert.Title>Live edit may drift from stack “{service.stackName}”</Alert.Title>
				<Alert.Description class="flex flex-wrap items-center justify-between gap-3">
					<span>Save updates only the live Docker ServiceSpec. Dockhand will not change the stored stack file, and a later stack deploy may overwrite this edit.</span>
					<Button size="sm" variant="outline" href={swarmDetailHref('stack', service.stackName)}><Layers class="h-4 w-4" /> Open stack</Button>
				</Alert.Description>
			</Alert.Root>
		{/if}
		<Tabs.Root bind:value={activeTab} class="flex min-h-0 flex-1 flex-col gap-3">
			<Tabs.List class="h-auto flex-wrap justify-start">
				<Tabs.Trigger value="general">General</Tabs.Trigger>
				<Tabs.Trigger value="runtime">Runtime</Tabs.Trigger>
				<Tabs.Trigger value="connectivity">Ports & Networks</Tabs.Trigger>
				<Tabs.Trigger value="data">Mounts & Data</Tabs.Trigger>
				<Tabs.Trigger value="scheduling">Placement & Resources</Tabs.Trigger>
				<Tabs.Trigger value="policies">Policies</Tabs.Trigger>
			</Tabs.List>
			<div class="min-h-0 flex-1 overflow-auto rounded-md border p-4">
				<Tabs.Content value="general" class="mt-0 space-y-4">
					{#if mode === 'create'}<div class="space-y-2"><Label for="service-name">Service name</Label><Input id="service-name" bind:value={serviceName} disabled={pending} autocomplete="off" placeholder="my-service" /></div>{/if}
					<div class="space-y-2"><Label for="service-image">Image</Label><Input id="service-image" bind:value={image} disabled={pending} /></div>
					<div class="grid gap-4 sm:grid-cols-2">
						<div><Label>Mode</Label><Select.Root type="single" bind:value={serviceMode} disabled={pending}><Select.Trigger class="w-full">{serviceMode === 'global' ? 'Global' : 'Replicated'}</Select.Trigger><Select.Content><Select.Item value="replicated">Replicated</Select.Item><Select.Item value="global">Global</Select.Item></Select.Content></Select.Root></div>
						{#if serviceMode === 'replicated'}<div><Label for="service-replicas">Desired replicas</Label><Input id="service-replicas" type="number" min="0" step="1" bind:value={replicas} disabled={pending} /></div>{/if}
					</div>
					<div class="space-y-2"><Label>Endpoint mode</Label><Select.Root type="single" bind:value={endpointMode}><Select.Trigger class="w-full">{endpointMode}</Select.Trigger><Select.Content><Select.Item value="vip">VIP</Select.Item><Select.Item value="dnsrr">DNS round-robin</Select.Item></Select.Content></Select.Root></div>
				</Tabs.Content>

				<Tabs.Content value="runtime" class="mt-0 grid gap-4 lg:grid-cols-2">
					<div class="space-y-2"><Label for="service-command">Command — one exec argument per line</Label><Textarea id="service-command" rows={6} class="font-mono text-xs" bind:value={command} disabled={pending} /></div>
					<div class="space-y-2"><Label for="service-args">Arguments — one per line</Label><Textarea id="service-args" rows={6} class="font-mono text-xs" bind:value={args} disabled={pending} /></div>
					<div class="space-y-2 lg:col-span-2"><Label for="service-env">Environment — KEY=VALUE, one per line</Label><Textarea id="service-env" rows={10} class="font-mono text-xs" bind:value={environment} disabled={pending} /></div>
					<div class="space-y-2 lg:col-span-2"><Label for="service-labels">Service labels — KEY=VALUE, one per line</Label><Textarea id="service-labels" rows={6} class="font-mono text-xs" bind:value={labels} disabled={pending} /><p class="text-xs text-muted-foreground">The stack namespace label is preserved for stack-managed services.</p></div>
					<section class="space-y-3 rounded-md border p-4 lg:col-span-2"><div><h3 class="font-medium">Healthcheck</h3><p class="text-xs text-muted-foreground">One Docker test argument per line. Start with CMD, CMD-SHELL, or NONE; leave empty to use the image default.</p></div><div class="grid gap-3 lg:grid-cols-2"><div class="space-y-2"><Label for="service-healthcheck-test">Test</Label><Textarea id="service-healthcheck-test" rows={5} class="font-mono text-xs" bind:value={healthcheckTest} disabled={pending} placeholder={'CMD-SHELL\nwget -qO- http://127.0.0.1/ || exit 1'} /></div><div class="grid gap-3 sm:grid-cols-2"><div><Label>Interval (seconds)</Label><Input type="number" min="0" step="0.1" bind:value={healthcheckIntervalSeconds} /></div><div><Label>Timeout (seconds)</Label><Input type="number" min="0" step="0.1" bind:value={healthcheckTimeoutSeconds} /></div><div><Label>Retries</Label><Input type="number" min="0" step="1" bind:value={healthcheckRetries} /></div><div><Label>Start period (seconds)</Label><Input type="number" min="0" step="0.1" bind:value={healthcheckStartPeriodSeconds} /></div></div></div></section>
					<div class="space-y-2"><Label for="service-stop-grace">Stop grace period (seconds)</Label><Input id="service-stop-grace" type="number" min="0" step="0.1" bind:value={stopGracePeriodSeconds} disabled={pending} /></div>
				</Tabs.Content>

				<Tabs.Content value="connectivity" class="mt-0 space-y-6">
					<section class="space-y-3"><div class="flex items-center justify-between"><div><h3 class="font-medium">Published ports</h3><p class="text-xs text-muted-foreground">Leave Published empty for Docker-assigned ingress ports.</p></div><Button size="sm" variant="outline" onclick={addPort}><Plus class="h-4 w-4" /> Add port</Button></div>
						{#each ports as port, index}<div class="grid gap-2 rounded-md border p-3 sm:grid-cols-[1fr_1fr_1fr_1fr_auto]">
							<Input aria-label="Port name" placeholder="Name" bind:value={port.name} /><Input aria-label="Target port" type="number" min="1" max="65535" placeholder="Target" bind:value={port.targetPort} /><Input aria-label="Published port" type="number" min="1" max="65535" placeholder="Published" bind:value={port.publishedPort} />
							<div class="flex gap-2"><Select.Root type="single" bind:value={port.protocol}><Select.Trigger>{port.protocol}</Select.Trigger><Select.Content><Select.Item value="tcp">TCP</Select.Item><Select.Item value="udp">UDP</Select.Item><Select.Item value="sctp">SCTP</Select.Item></Select.Content></Select.Root><Select.Root type="single" bind:value={port.publishMode}><Select.Trigger>{port.publishMode}</Select.Trigger><Select.Content><Select.Item value="ingress">Ingress</Select.Item><Select.Item value="host">Host</Select.Item></Select.Content></Select.Root></div>
							<Button size="icon" variant="ghost" onclick={() => removePort(index)} aria-label="Remove port"><Trash2 class="h-4 w-4" /></Button>
						</div>{:else}<p class="text-sm text-muted-foreground">No ports published.</p>{/each}
					</section>
					<section class="space-y-3"><div><h3 class="font-medium">Overlay networks</h3><p class="text-xs text-muted-foreground">Search and select from the Swarm networks available on this manager.</p></div>
						<Input aria-label="Search networks" placeholder="Search networks" bind:value={networkSearch} />
						<div class="grid max-h-48 gap-2 overflow-auto sm:grid-cols-2">{#each filteredNetworks as network}<label class="flex items-start gap-3 rounded-md border p-3"><Checkbox checked={Boolean(attachmentFor(network))} onCheckedChange={(checked) => toggleNetwork(network, checked === true)} /><span><span class="font-medium">{network.name}</span><br /><span class="text-xs text-muted-foreground">{network.driver ?? 'unknown'}{network.attachable ? ' · attachable' : ''}</span></span></label>{:else}<p class="text-sm text-muted-foreground">No matching Swarm networks.</p>{/each}</div>
						<div class="space-y-2"><h4 class="text-sm font-medium">Selected networks</h4>{#each networkAttachments as attachment}<div class="grid items-center gap-2 rounded-md border p-3 sm:grid-cols-[minmax(8rem,1fr)_2fr_auto]"><span class="truncate text-sm font-medium">{networkName(attachment.target)}</span><Input aria-label={`Aliases for ${networkName(attachment.target)}`} placeholder="Aliases, comma-separated" value={attachment.aliases.join(', ')} oninput={(event) => updateNetworkAliases(attachment.target, event.currentTarget.value)} /><Button size="icon" variant="ghost" onclick={() => removeNetwork(attachment.target)} aria-label={`Remove network ${networkName(attachment.target)}`}><Trash2 class="h-4 w-4" /></Button></div>{:else}<p class="text-sm text-muted-foreground">No networks selected.</p>{/each}</div>
					</section>
				</Tabs.Content>

				<Tabs.Content value="data" class="mt-0 space-y-6">
					<section class="space-y-3"><div class="flex items-center justify-between"><div><h3 class="font-medium">Mounts</h3><p class="text-xs text-muted-foreground">Existing driver-specific options are preserved when source, target and type stay unchanged.</p></div><Button size="sm" variant="outline" onclick={addMount}><Plus class="h-4 w-4" /> Add mount</Button></div>
						{#each mounts as mount, index}<div class="grid gap-2 rounded-md border p-3 sm:grid-cols-[8rem_1fr_1fr_auto_auto]">
							<Select.Root type="single" bind:value={mount.type}><Select.Trigger>{mount.type}</Select.Trigger><Select.Content><Select.Item value="volume">Volume</Select.Item><Select.Item value="bind">Bind</Select.Item><Select.Item value="tmpfs">Tmpfs</Select.Item><Select.Item value="npipe">Named pipe</Select.Item><Select.Item value="cluster">Cluster</Select.Item></Select.Content></Select.Root><Input placeholder="Source" bind:value={mount.source} disabled={mount.type === 'tmpfs'} /><Input placeholder="Target" bind:value={mount.target} /><label class="flex items-center gap-2 text-sm"><Checkbox bind:checked={mount.readOnly} /> Read-only</label><Button size="icon" variant="ghost" onclick={() => removeMount(index)} aria-label="Remove mount"><Trash2 class="h-4 w-4" /></Button>
						</div>{:else}<p class="text-sm text-muted-foreground">No mounts configured.</p>{/each}
					</section>
					<section class="grid gap-6 lg:grid-cols-2">
						<div class="space-y-3"><div><h3 class="font-medium">Configs</h3><p class="text-xs text-muted-foreground">Select Config metadata and set its container target.</p></div><Input aria-label="Search Configs" placeholder="Search Configs" bind:value={configSearch} /><div class="max-h-40 space-y-2 overflow-auto">{#each filteredConfigs as config}<label class="flex items-center gap-3 rounded-md border p-2"><Checkbox checked={configReferences.some((item) => item.id === config.id)} onCheckedChange={(checked) => toggleResource('config', config, checked === true)} /><span>{config.name}</span></label>{:else}<p class="text-sm text-muted-foreground">No matching Configs.</p>{/each}</div><div class="space-y-2">{#each configReferences as reference}<div class="grid items-center gap-2 rounded-md border p-2 sm:grid-cols-[minmax(7rem,1fr)_2fr_auto]"><span class="truncate text-sm font-medium">{resourceName('config', reference.id)}</span><Input aria-label={`Config target for ${resourceName('config', reference.id)}`} placeholder="Target path" bind:value={reference.target} /><Button size="icon" variant="ghost" onclick={() => removeResource('config', reference.id)} aria-label={`Remove Config ${resourceName('config', reference.id)}`}><Trash2 class="h-4 w-4" /></Button></div>{:else}<p class="text-sm text-muted-foreground">No Configs selected.</p>{/each}</div></div>
						<div class="space-y-3"><div><h3 class="font-medium">Secrets</h3><p class="text-xs text-muted-foreground">Only Secret metadata is listed. Secret values are never read or displayed.</p></div><Input aria-label="Search Secrets" placeholder="Search Secrets" bind:value={secretSearch} /><div class="max-h-40 space-y-2 overflow-auto">{#each filteredSecrets as secret}<label class="flex items-center gap-3 rounded-md border p-2"><Checkbox checked={secretReferences.some((item) => item.id === secret.id)} onCheckedChange={(checked) => toggleResource('secret', secret, checked === true)} /><span>{secret.name}</span></label>{:else}<p class="text-sm text-muted-foreground">No matching Secrets.</p>{/each}</div><div class="space-y-2">{#each secretReferences as reference}<div class="grid items-center gap-2 rounded-md border p-2 sm:grid-cols-[minmax(7rem,1fr)_2fr_auto]"><span class="truncate text-sm font-medium">{resourceName('secret', reference.id)}</span><Input aria-label={`Secret target for ${resourceName('secret', reference.id)}`} placeholder="Target path" bind:value={reference.target} /><Button size="icon" variant="ghost" onclick={() => removeResource('secret', reference.id)} aria-label={`Remove Secret ${resourceName('secret', reference.id)}`}><Trash2 class="h-4 w-4" /></Button></div>{:else}<p class="text-sm text-muted-foreground">No Secrets selected.</p>{/each}</div></div>
					</section>
				</Tabs.Content>

				<Tabs.Content value="scheduling" class="mt-0 space-y-5">
					<div class="space-y-2"><Label for="service-constraints">Placement constraints — one per line</Label><Textarea id="service-constraints" rows={7} class="font-mono text-xs" bind:value={constraints} /></div>
					<div class="grid gap-4 sm:grid-cols-2 lg:grid-cols-4"><div><Label>CPU limit (cores)</Label><Input type="number" min="0" step="0.001" bind:value={limitCores} /></div><div><Label>Memory limit (MB)</Label><Input type="number" min="0" bind:value={limitMemoryMb} /></div><div><Label>CPU reservation (cores)</Label><Input type="number" min="0" step="0.001" bind:value={reservationCores} /></div><div><Label>Memory reservation (MB)</Label><Input type="number" min="0" bind:value={reservationMemoryMb} /></div></div>
					<div class="grid gap-4 sm:grid-cols-2 lg:grid-cols-4"><div><Label>Restart condition</Label><Select.Root type="single" bind:value={restartCondition}><Select.Trigger>{restartCondition}</Select.Trigger><Select.Content><Select.Item value="any">Any</Select.Item><Select.Item value="on-failure">On failure</Select.Item><Select.Item value="none">None</Select.Item></Select.Content></Select.Root></div><div><Label>Delay (seconds)</Label><Input type="number" min="0" step="0.1" bind:value={restartDelaySeconds} /></div><div><Label>Max attempts</Label><Input type="number" min="0" step="1" bind:value={restartMaxAttempts} /></div><div><Label>Window (seconds)</Label><Input type="number" min="0" step="0.1" bind:value={restartWindowSeconds} /></div></div>
				</Tabs.Content>

				<Tabs.Content value="policies" class="mt-0 grid gap-6 lg:grid-cols-2">
					{#each policySections as section}
						<section class="space-y-3 rounded-md border p-4"><h3 class="font-medium">{section.title}</h3><div class="grid gap-3 sm:grid-cols-2"><div><Label>Parallelism</Label><Input type="number" min="0" step="1" bind:value={section.policy.parallelism} /></div><div><Label>Delay (seconds)</Label><Input type="number" min="0" step="0.1" bind:value={section.policy.delaySeconds} /></div><div><Label>Monitor (seconds)</Label><Input type="number" min="0" step="0.1" bind:value={section.policy.monitorSeconds} /></div><div><Label>Max failure ratio</Label><Input type="number" min="0" max="1" step="0.01" bind:value={section.policy.maxFailureRatio} /></div><div><Label>Failure action</Label><Select.Root type="single" bind:value={section.policy.failureAction}><Select.Trigger>{section.policy.failureAction}</Select.Trigger><Select.Content><Select.Item value="pause">Pause</Select.Item><Select.Item value="continue">Continue</Select.Item><Select.Item value="rollback">Rollback</Select.Item></Select.Content></Select.Root></div><div><Label>Order</Label><Select.Root type="single" bind:value={section.policy.order}><Select.Trigger>{section.policy.order}</Select.Trigger><Select.Content><Select.Item value="stop-first">Stop first</Select.Item><Select.Item value="start-first">Start first</Select.Item></Select.Content></Select.Root></div></div></section>
					{/each}
				</Tabs.Content>
			</div>
		</Tabs.Root>
		{#if error}<p class="text-sm text-destructive">{error}</p>{/if}
		<Dialog.Footer><Button variant="outline" onclick={() => open = false} disabled={pending}>Cancel</Button><Button onclick={save} disabled={pending || !image.trim() || mode === 'create' && !serviceName.trim()}>{#if pending}<Loader2 class="h-4 w-4 animate-spin" />{/if} {mode === 'create' ? 'Create service' : 'Save & update'}</Button></Dialog.Footer>
	</Dialog.Content>
</Dialog.Root>
