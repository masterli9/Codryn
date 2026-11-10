import { stat, realpath } from 'node:fs/promises';
import type { DatabaseSync } from 'node:sqlite';
import type { Clock, DesktopProjectStore } from '@codryn/core';
import { r3ProjectSchema, uuidSchema } from '@codryn/shared';
import type { R3Project, Uuid } from '@codryn/shared';
import { text } from './r3-sqlite-helpers.js';
export class SqliteDesktopProjectStore implements DesktopProjectStore {
  constructor(private readonly database: DatabaseSync, private readonly clock: Clock) {}
  async remember(projectId: Uuid, root: string, displayName: string): Promise<R3Project> {
    const existing = this.database.prepare('SELECT root FROM desktop_projects WHERE project_id=?').get(uuidSchema.parse(projectId));
    if (existing && existing.root !== root) throw new Error('R3_PROJECT_UNAVAILABLE');
    this.database.prepare('INSERT INTO desktop_projects VALUES(?,?,?,?) ON CONFLICT(project_id) DO UPDATE SET display_name=excluded.display_name').run(projectId, root, displayName, this.clock.now());
    const project = await this.get(projectId); if (!project) throw new Error('R3_NOT_FOUND'); return project;
  }
  async get(id: Uuid): Promise<R3Project | null> {
    const row = this.database.prepare('SELECT * FROM desktop_projects WHERE project_id=?').get(uuidSchema.parse(id));
    if (!row) return null;
    const root = text(row.root); let available = false;
    try { available = (await stat(root)).isDirectory() && (await realpath(root)).toLowerCase() === root.toLowerCase(); } catch { /* History remains readable. */ }
    return r3ProjectSchema.parse({ id: row.project_id, displayName: row.display_name, available, mode: 'non-git', limitations: available ? [] : [{ code: 'project_unavailable', message: 'Složka projektu není dostupná.' }] });
  }
  async list(): Promise<readonly R3Project[]> {
    const result: R3Project[] = [];
    for (const row of this.database.prepare('SELECT project_id FROM desktop_projects ORDER BY created_at,project_id').all()) { const project = await this.get(text(row.project_id)); if (project) result.push(project); }
    return result;
  }
  async root(id: Uuid): Promise<string> {
    const row = this.database.prepare('SELECT root FROM desktop_projects WHERE project_id=?').get(uuidSchema.parse(id));
    if (!row) throw new Error('R3_NOT_FOUND'); return text(row.root);
  }
}
