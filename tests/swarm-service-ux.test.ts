import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import {
	adjustedReplicaCount,
	canScaleSwarmService,
	hasReplicaMismatch,
	isStackManagedSwarmService,
	swarmStatusPresentation,
	swarmTaskStatusPresentation
} from '../src/lib/swarm-service-ux';

describe('Swarm service status semantics', () => {
	it('maps positive, warning, destructive and neutral states consistently', () => {
		for (const state of ['healthy', 'stable', 'running', 'completed']) {
			assert.equal(swarmStatusPresentation(state).tone, 'positive');
		}
		for (const state of ['updating', 'pending', 'degraded', 'partial']) {
			assert.equal(swarmStatusPresentation(state).tone, 'warning');
		}
		for (const state of ['failed', 'rejected', 'unhealthy', 'orphaned', 'rollback_failed', 'blocked']) {
			assert.equal(swarmStatusPresentation(state).tone, 'destructive');
		}
		for (const state of ['shutdown', 'inactive', 'unknown', undefined]) {
			assert.equal(swarmStatusPresentation(state).tone, 'neutral');
		}
	});

	it('gives an actual task error destructive precedence over its desired state', () => {
		assert.equal(swarmTaskStatusPresentation('running', 'container exited').tone, 'destructive');
		assert.equal(swarmTaskStatusPresentation('running').tone, 'positive');
	});

	it('marks only replicated services with partial replicas as mismatched', () => {
		assert.equal(hasReplicaMismatch({ mode: 'replicated', runningTasks: 2, desiredTasks: 4 }), true);
		assert.equal(hasReplicaMismatch({ mode: 'replicated', runningTasks: 4, desiredTasks: 4 }), false);
		assert.equal(hasReplicaMismatch({ mode: 'global', runningTasks: 2, desiredTasks: 4 }), false);
	});

	it('increments and decrements replica values without going below zero', () => {
		assert.equal(adjustedReplicaCount('2', 1), 3);
		assert.equal(adjustedReplicaCount('2', -1), 1);
		assert.equal(adjustedReplicaCount('0', -1), 0);
		assert.equal(adjustedReplicaCount('invalid', 1), 1);
	});

	it('offers scaling only for replicated services', () => {
		assert.equal(canScaleSwarmService('replicated'), true);
		assert.equal(canScaleSwarmService('global'), false);
		assert.equal(canScaleSwarmService('replicated-job'), false);
		assert.equal(canScaleSwarmService('global-job'), false);
	});

	it('recognizes stack-managed services only from a non-empty stack namespace', () => {
		assert.equal(isStackManagedSwarmService({ stackName: 'platform' }), true);
		assert.equal(isStackManagedSwarmService({ stackName: '   ' }), false);
		assert.equal(isStackManagedSwarmService({ stackName: undefined }), false);
	});
});
