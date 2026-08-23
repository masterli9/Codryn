import { describe, expect, it } from 'vitest';
import {
  agentRunGraph,
  changeSetGraph,
  gitOperationGraph,
  permissionRequestGraph,
  toolCallGraph,
  transitionAgentRun,
  transitionChangeSet,
  transitionGitOperation,
  transitionPermissionRequest,
  transitionToolCall
} from '../src/index.js';

describe('R0 state machines', () => {
  it.each([
    ['idle', 'preparing_context'],
    ['preparing_context', 'waiting_for_model'],
    ['preparing_context', 'cancelled'],
    ['preparing_context', 'failed'],
    ['waiting_for_model', 'executing_tool'],
    ['waiting_for_model', 'waiting_for_approval'],
    ['waiting_for_model', 'verifying'],
    ['waiting_for_model', 'completed'],
    ['waiting_for_model', 'cancelled'],
    ['waiting_for_model', 'failed'],
    ['executing_tool', 'waiting_for_model'],
    ['executing_tool', 'verifying'],
    ['executing_tool', 'cancelled'],
    ['executing_tool', 'failed'],
    ['waiting_for_approval', 'executing_tool'],
    ['waiting_for_approval', 'waiting_for_model'],
    ['waiting_for_approval', 'cancelled'],
    ['waiting_for_approval', 'failed'],
    ['verifying', 'waiting_for_model'],
    ['verifying', 'completed'],
    ['verifying', 'cancelled'],
    ['verifying', 'failed']
  ] as const)('allows AgentRun %s -> %s', (from, to) => {
    expect(transitionAgentRun(from, to)).toEqual({ ok: true, state: to });
  });

  it.each([
    ['completed', 'executing_tool'],
    ['cancelled', 'idle'],
    ['failed', 'waiting_for_model'],
    ['idle', 'waiting_for_model'],
    ['executing_tool', 'completed']
  ] as const)('rejects forbidden AgentRun %s -> %s', (from, to) => {
    expect(transitionAgentRun(from, to)).toEqual({
      ok: false,
      code: 'INVALID_STATE_TRANSITION',
      from,
      to
    });
  });

  it.each([
    ['proposed', 'waiting_for_approval'],
    ['proposed', 'running'],
    ['proposed', 'cancelled'],
    ['waiting_for_approval', 'running'],
    ['waiting_for_approval', 'cancelled'],
    ['running', 'succeeded'],
    ['running', 'failed'],
    ['running', 'timed_out'],
    ['running', 'cancelled']
  ] as const)('allows ToolCall %s -> %s', (from, to) => {
    expect(transitionToolCall(from, to)).toEqual({ ok: true, state: to });
  });

  it.each([
    ['succeeded', 'running'],
    ['failed', 'running'],
    ['timed_out', 'running'],
    ['cancelled', 'proposed'],
    ['proposed', 'succeeded']
  ] as const)('rejects forbidden ToolCall %s -> %s', (from, to) => {
    expect(transitionToolCall(from, to)).toEqual({
      ok: false,
      code: 'INVALID_STATE_TRANSITION',
      from,
      to
    });
  });

  it.each([
    ['pending', 'approved'],
    ['pending', 'denied'],
    ['pending', 'expired'],
    ['pending', 'cancelled']
  ] as const)('allows PermissionRequest %s -> %s', (from, to) => {
    expect(transitionPermissionRequest(from, to)).toEqual({ ok: true, state: to });
  });

  it.each([
    ['approved', 'pending'],
    ['denied', 'approved'],
    ['expired', 'cancelled'],
    ['cancelled', 'approved'],
    ['pending', 'pending']
  ] as const)('rejects forbidden PermissionRequest %s -> %s', (from, to) => {
    expect(transitionPermissionRequest(from, to)).toEqual({
      ok: false,
      code: 'INVALID_STATE_TRANSITION',
      from,
      to
    });
  });

  it.each([
    ['open', 'sealed'],
    ['open', 'recovery_required'],
    ['sealed', 'reverting'],
    ['sealed', 'recovery_required'],
    ['reverting', 'reverted'],
    ['reverting', 'conflicted'],
    ['reverting', 'recovery_required']
  ] as const)('allows ChangeSet %s -> %s', (from, to) => {
    expect(transitionChangeSet(from, to)).toEqual({ ok: true, state: to });
  });

  it.each([
    ['reverted', 'reverting'],
    ['conflicted', 'open'],
    ['recovery_required', 'sealed'],
    ['open', 'reverting'],
    ['sealed', 'reverted']
  ] as const)('rejects forbidden ChangeSet %s -> %s', (from, to) => {
    expect(transitionChangeSet(from, to)).toEqual({
      ok: false,
      code: 'INVALID_STATE_TRANSITION',
      from,
      to
    });
  });

  it.each([
    ['proposed', 'preflight'],
    ['proposed', 'cancelled'],
    ['preflight', 'waiting_for_approval'],
    ['preflight', 'executing'],
    ['preflight', 'stale'],
    ['preflight', 'failed'],
    ['preflight', 'cancelled'],
    ['waiting_for_approval', 'preflight'],
    ['waiting_for_approval', 'cancelled'],
    ['executing', 'succeeded'],
    ['executing', 'failed'],
    ['executing', 'stale']
  ] as const)('allows GitOperation %s -> %s', (from, to) => {
    expect(transitionGitOperation(from, to)).toEqual({ ok: true, state: to });
  });

  it.each([
    ['succeeded', 'executing'],
    ['failed', 'preflight'],
    ['stale', 'executing'],
    ['cancelled', 'preflight'],
    ['proposed', 'executing'],
    ['waiting_for_approval', 'executing']
  ] as const)('rejects forbidden GitOperation %s -> %s', (from, to) => {
    expect(transitionGitOperation(from, to)).toEqual({
      ok: false,
      code: 'INVALID_STATE_TRANSITION',
      from,
      to
    });
  });

  it('keeps approval, changes and Git as independent machines', () => {
    expect(transitionPermissionRequest('pending', 'approved')).toEqual({ ok: true, state: 'approved' });
    expect(transitionChangeSet('reverting', 'conflicted')).toEqual({ ok: true, state: 'conflicted' });
    expect(transitionGitOperation('preflight', 'executing')).toEqual({ ok: true, state: 'executing' });
    expect(transitionToolCall('running', 'failed')).toEqual({ ok: true, state: 'failed' });
  });

  it.each([
    ['AgentRun', agentRunGraph],
    ['ToolCall', toolCallGraph],
    ['PermissionRequest', permissionRequestGraph],
    ['ChangeSet', changeSetGraph],
    ['GitOperation', gitOperationGraph]
  ] as const)('declares a total graph for %s', (_name, graph) => {
    const graphRecord = graph as Readonly<Record<string, readonly string[]>>;
    for (const state of Object.keys(graph)) {
      expect(Array.isArray(graphRecord[state])).toBe(true);
    }
  });

  it.each([
    ['AgentRun', agentRunGraph, ['completed', 'cancelled', 'failed']],
    ['ToolCall', toolCallGraph, ['succeeded', 'failed', 'timed_out', 'cancelled']],
    ['PermissionRequest', permissionRequestGraph, ['approved', 'denied', 'expired', 'cancelled']],
    ['ChangeSet', changeSetGraph, ['reverted', 'conflicted', 'recovery_required']],
    ['GitOperation', gitOperationGraph, ['succeeded', 'failed', 'stale', 'cancelled']]
  ] as const)('keeps terminal states terminal for %s', (_name, graph, terminals) => {
    const graphRecord = graph as Readonly<Record<string, readonly string[]>>;
    for (const terminal of terminals) {
      expect(graphRecord[terminal]).toEqual([]);
    }
  });

  it('returns transition values without mutating the graph', () => {
    const before = JSON.stringify(agentRunGraph);
    const result = transitionAgentRun('idle', 'preparing_context');

    expect(result).toEqual({ ok: true, state: 'preparing_context' });
    expect(JSON.stringify(agentRunGraph)).toBe(before);
  });
});
