import { commandSpecSchema, permissionDecisionInputSchema, permissionViewSchema, uuidSchema, type CommandSpec, type PermissionDecisionInput, type PermissionView } from '@codryn/shared';
import type { Clock, IdGenerator } from '../diagnostics/ports.js';
import type { PermissionCallLookup, PermissionRequestSpec, PermissionStore } from './ports.js';

export interface PermissionServiceDependencies {
  readonly store: PermissionStore;
  readonly calls: PermissionCallLookup;
  readonly ids: IdGenerator;
  readonly clock: Clock;
  digest(input: unknown): string;
}

const secretAssignment = /(?:^|[\s"'`])(?:[A-Z0-9_]*(?:API[_-]?KEY|TOKEN|SECRET|PASSWORD|CREDENTIAL|PRIVATE[_-]?KEY)[A-Z0-9_]*)\s*[:=]\s*[^\s"'`]+/i;

function validateText(value: unknown, code: string, maxLength: number): string {
  if (typeof value !== 'string' || value.length === 0 || value.length > maxLength || value.includes('\0')) {
    throw new Error(code);
  }
  return value;
}

function rejectSecretInput(command: CommandSpec, reason: string, impact: string): void {
  const values = [command.executable, command.cwd, ...command.args, reason, impact];
  if (values.some((value) => secretAssignment.test(value))) throw new Error('R2_PERMISSION_SECRET_INPUT');
}

function normalizedCommand(command: CommandSpec): CommandSpec {
  return {
    executable: command.executable.trim(),
    args: [...command.args],
    cwd: command.cwd.trim(),
    timeoutMs: command.timeoutMs,
    maxOutputBytes: command.maxOutputBytes
  };
}

export class PermissionService {
  constructor(private readonly dependencies: PermissionServiceDependencies) {}

  async request(input: PermissionRequestSpec): Promise<PermissionView> {
    const callId = uuidSchema.parse(input.callId);
    const command = commandSpecSchema.parse(input.command);
    const reason = validateText(input.reason, 'R2_PERMISSION_REASON_INVALID', 4096);
    const impact = validateText(input.impact, 'R2_PERMISSION_IMPACT_INVALID', 4096);
    rejectSecretInput(command, reason, impact);
    const binding = await this.dependencies.calls.findBinding(callId);
    if (binding === null || uuidSchema.parse(binding.callId) !== callId) throw new Error('R2_PERMISSION_CALL_BINDING_MISSING');
    const projectId = uuidSchema.parse(binding.projectId);
    const runId = uuidSchema.parse(binding.runId);
    const safeCommand = normalizedCommand(command);
    const digest = this.dependencies.digest({
      toolId: 'command.run',
      toolVersion: 1,
      projectId,
      runId,
      callId,
      command: safeCommand
    });
    const view = permissionViewSchema.parse({
      id: this.dependencies.ids.next(),
      callId,
      digest,
      command: safeCommand,
      reason,
      impact,
      state: 'pending'
    });
    await this.dependencies.store.create(view);
    return view;
  }

  async decide(input: PermissionDecisionInput): Promise<'accepted' | 'duplicate' | 'rejected'> {
    return this.dependencies.store.decide(permissionDecisionInputSchema.parse(input));
  }

  async claim(idInput: string, digestInput: string): Promise<boolean> {
    const id = uuidSchema.parse(idInput);
    const digest = permissionDecisionInputSchema.shape.digest.parse(digestInput);
    return this.dependencies.store.claim(id, digest);
  }

  async get(idInput: string): Promise<PermissionView | null> {
    return this.dependencies.store.get(uuidSchema.parse(idInput));
  }

  async closePending(idInput: string, state: 'expired' | 'cancelled'): Promise<boolean> {
    return this.dependencies.store.closePending(uuidSchema.parse(idInput), state);
  }
}
