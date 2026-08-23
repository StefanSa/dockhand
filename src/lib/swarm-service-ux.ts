import type { SwarmServiceSummary } from '$lib/types/swarm';

export type SwarmStatusTone = 'positive' | 'warning' | 'destructive' | 'neutral';
export type SwarmBadgeVariant = 'outline' | 'destructive';

export interface SwarmStatusPresentation {
	tone: SwarmStatusTone;
	variant: SwarmBadgeVariant;
	className: string;
}

const STATUS_TONES: Record<SwarmStatusTone, SwarmStatusPresentation> = {
	positive: {
		tone: 'positive',
		variant: 'outline',
		className: 'border-green-600/30 bg-green-500/10 text-green-700 dark:text-green-400'
	},
	warning: {
		tone: 'warning',
		variant: 'outline',
		className: 'border-amber-600/30 bg-amber-500/10 text-amber-700 dark:text-amber-400'
	},
	destructive: {
		tone: 'destructive',
		variant: 'destructive',
		className: ''
	},
	neutral: {
		tone: 'neutral',
		variant: 'outline',
		className: 'border-border bg-muted/30 text-muted-foreground'
	}
};

export function swarmStatusPresentation(status: string | null | undefined): SwarmStatusPresentation {
	const normalized = status?.trim().toLowerCase().replaceAll(' ', '_') ?? 'unknown';
	if (['healthy', 'stable', 'running', 'complete', 'completed', 'rollback_completed'].includes(normalized)) {
		return STATUS_TONES.positive;
	}
	if (['updating', 'pending', 'degraded', 'partial', 'allocated', 'assigned', 'accepted', 'preparing', 'ready', 'starting', 'paused', 'rollback_started', 'rollback_paused'].includes(normalized)) {
		return STATUS_TONES.warning;
	}
	if (['failed', 'rejected', 'unhealthy'].includes(normalized)) {
		return STATUS_TONES.destructive;
	}
	return STATUS_TONES.neutral;
}

export function swarmTaskStatusPresentation(
	state: string | null | undefined,
	error?: string | null
): SwarmStatusPresentation {
	return error ? STATUS_TONES.destructive : swarmStatusPresentation(state);
}

export function hasReplicaMismatch(
	service: Pick<SwarmServiceSummary, 'mode' | 'runningTasks' | 'desiredTasks'>
): boolean {
	return service.mode === 'replicated'
		&& service.desiredTasks !== null
		&& service.runningTasks !== service.desiredTasks;
}

export function canScaleSwarmService(mode: SwarmServiceSummary['mode']): boolean {
	return mode === 'replicated';
}

export function adjustedReplicaCount(value: string | number, delta: number): number {
	const parsed = Number(value);
	const current = Number.isSafeInteger(parsed) && parsed >= 0 ? parsed : 0;
	return Math.max(0, current + delta);
}
