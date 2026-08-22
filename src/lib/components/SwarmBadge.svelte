<script lang="ts">
	import { Badge } from '$lib/components/ui/badge';
	import type { SwarmCapability } from '$lib/types/swarm';

	interface Props {
		capability?: SwarmCapability | null;
		compact?: boolean;
	}

	let { capability, compact = false }: Props = $props();

	const label = $derived(
		capability?.kind === 'swarm-manager' ? (compact ? 'Manager' : 'Swarm Manager')
			: capability?.kind === 'swarm-worker' ? (compact ? 'Worker' : 'Swarm Worker')
				: capability?.kind === 'swarm-unavailable' ? 'Swarm unavailable'
					: null
	);
</script>

{#if label}
	<Badge
		variant="outline"
		class="h-5 shrink-0 px-1.5 text-[10px] font-medium {capability?.kind === 'swarm-unavailable' ? 'border-amber-500/50 text-amber-600 dark:text-amber-400' : 'border-blue-500/50 text-blue-600 dark:text-blue-400'}"
	>
		{label}
	</Badge>
{/if}
