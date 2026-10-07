import type { PermissionView } from '@codryn/shared';

function quote(value: string): string {
  if (/^[^\s"']+$/.test(value)) return value;
  return JSON.stringify(value);
}

export function formatPermissionPrompt(view: PermissionView): string {
  const command = [view.command.executable, ...view.command.args].map(quote).join(' ');
  return [
    'Command approval required (allow once):',
    `  ${command}`,
    `  cwd: ${view.command.cwd}`,
    `  reason: ${view.reason}`,
    `  impact: ${view.impact}`,
    'Allow once? [y/N] '
  ].join('\n');
}

export function parsePermissionAnswer(answer: string): 'allow_once' | 'deny' {
  return ['y', 'yes', 'allow', 'allow_once'].includes(answer.trim().toLowerCase()) ? 'allow_once' : 'deny';
}
