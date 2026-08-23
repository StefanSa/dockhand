import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import {
	parseSwarmCapability,
	unknownSwarmCapability,
	isSwarmEnvironment
} from '../src/lib/types/swarm';

const detectedAt = '2026-08-22T00:00:00.000Z';
const version = { ApiVersion: '1.55', Version: '28.3.3' };

describe('parseSwarmCapability', () => {
	it('classifies an active control node as a Swarm manager', () => {
		const capability = parseSwarmCapability({
			ServerVersion: '28.3.3',
			Swarm: {
				LocalNodeState: 'active',
				ControlAvailable: true,
				NodeID: 'manager-node',
				NodeAddr: '10.0.0.10',
				Nodes: 3,
				Managers: 1,
				Cluster: { ID: 'cluster-one' },
				RemoteManagers: [{ NodeID: 'manager-node', Addr: '10.0.0.10:2377' }]
			}
		}, version, detectedAt);

		assert.equal(capability.kind, 'swarm-manager');
		assert.equal(capability.controlAvailable, true);
		assert.equal(capability.clusterId, 'cluster-one');
		assert.equal(capability.nodeCount, 3);
		assert.deepEqual(capability.managerAddresses, ['10.0.0.10:2377']);
		assert.equal(capability.apiVersion, '1.55');
	});

	it('classifies an active non-control node as a Swarm worker', () => {
		const capability = parseSwarmCapability({
			Swarm: {
				LocalNodeState: 'active',
				ControlAvailable: false,
				NodeID: 'worker-node',
				NodeAddr: '10.0.0.20',
				RemoteManagers: [{ Addr: '10.0.0.10:2377' }]
			}
		}, version, detectedAt);

		assert.equal(capability.kind, 'swarm-worker');
		assert.equal(capability.nodeId, 'worker-node');
		assert.equal(capability.clusterId, undefined);
	});

	it('classifies an inactive Engine as standalone Docker', () => {
		const capability = parseSwarmCapability({
			Swarm: { LocalNodeState: 'inactive', ControlAvailable: false }
		}, version, detectedAt);

		assert.equal(capability.kind, 'standalone');
		assert.equal(capability.localNodeState, 'inactive');
	});

	it('classifies locked, pending, and error states as unavailable', () => {
		for (const state of ['locked', 'pending', 'error'] as const) {
			const capability = parseSwarmCapability({
				Swarm: { LocalNodeState: state, Error: `${state} fixture` }
			}, version, detectedAt);
			assert.equal(capability.kind, 'swarm-unavailable');
			assert.equal(capability.error, `${state} fixture`);
		}
	});

	it('does not silently treat missing or malformed Swarm data as standalone', () => {
		assert.equal(parseSwarmCapability({}, version, detectedAt).kind, 'unknown');
		assert.equal(parseSwarmCapability({ Swarm: { LocalNodeState: 'surprise' } }, version, detectedAt).kind, 'unknown');
		assert.equal(parseSwarmCapability({ Swarm: { LocalNodeState: 'active' } }, version, detectedAt).kind, 'unknown');
		assert.equal(parseSwarmCapability(null, version, detectedAt).kind, 'unknown');
	});

	it('represents a Docker connection error as unknown', () => {
		const capability = unknownSwarmCapability(new Error('connection refused'), detectedAt);
		assert.equal(capability.kind, 'unknown');
		assert.equal(capability.error, 'connection refused');
	});

	it('shows Swarm navigation for managers and workers, but not standalone Docker', () => {
		assert.equal(isSwarmEnvironment({ kind: 'swarm-manager', detectedAt }), true);
		assert.equal(isSwarmEnvironment({ kind: 'swarm-worker', detectedAt }), true);
		assert.equal(isSwarmEnvironment({ kind: 'standalone', detectedAt }), false);
		assert.equal(isSwarmEnvironment(null), false);
	});
});
