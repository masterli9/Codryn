import type { ModelContextSource } from '@codryn/shared';

export function describeModelContext(source: ModelContextSource): string {
  switch (source.reason) {
    case 'project_rules': return `Project instructions (apply within this project): ${source.path}`;
    case 'chat_history': return `Prior chat history (historical conversation only): ${source.path}`;
    case 'directory_reference': return `Project directory metadata: ${source.path}`;
    case 'loaded_excerpt': return `Explicit project file excerpt: ${source.path}`;
    case 'repo_map': return `Repository map metadata: ${source.path}`;
    case 'explicit_reference': return `Context ${source.path}`;
  }
}
