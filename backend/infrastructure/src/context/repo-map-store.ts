import type { DatabaseSync } from 'node:sqlite';

export interface RepoMapMetadata {
  path: string;
  kind: 'file' | 'directory';
  role: 'source' | 'test' | 'config' | 'docs' | 'other';
  symbols: string[];
  imports: string[];
  contentHash: string | 'unread';
  freshness: 'current' | 'unread';
}

export interface RepoMapItem extends RepoMapMetadata {
  projectId: string;
  policyRevision: string;
  generation: number;
}

export interface RepoMapInstruction {
  path: string;
  contentHash: string;
  authority: 'project_rules';
}

export class RepoMapStore {
  constructor(private readonly database: DatabaseSync) {}

  begin(projectId: string): number {
    const row = this.database.prepare(`
      INSERT INTO repo_map_generations(project_id,next_generation) VALUES(?,1)
      ON CONFLICT(project_id) DO UPDATE SET next_generation=next_generation+1
      RETURNING next_generation
    `).get(projectId);
    return Number(row?.next_generation);
  }

  stage(projectId: string, generation: number, items: readonly RepoMapMetadata[], instructions: readonly RepoMapInstruction[]): void {
    this.database.exec('BEGIN IMMEDIATE');
    try {
      const item = this.database.prepare('INSERT INTO repo_map_items VALUES (?,?,?,?)');
      const instruction = this.database.prepare('INSERT INTO repo_map_instructions VALUES (?,?,?,?)');
      for (const value of items) item.run(projectId, generation, value.path, JSON.stringify(value));
      for (const value of instructions) instruction.run(projectId, generation, value.path, value.contentHash);
      this.database.exec('COMMIT');
    } catch (error) {
      this.database.exec('ROLLBACK');
      throw error;
    }
  }

  publish(projectId: string, generation: number, policyRevision: string): boolean {
    this.database.exec('BEGIN IMMEDIATE');
    try {
      const published = this.database.prepare(`
        UPDATE repo_map_generations SET published_generation=?,policy_revision=?
        WHERE project_id=? AND next_generation=?
      `).run(generation, policyRevision, projectId, generation).changes === 1;
      if (published) {
        this.database.prepare('DELETE FROM repo_map_items WHERE project_id=? AND generation<>?').run(projectId, generation);
        this.database.prepare('DELETE FROM repo_map_instructions WHERE project_id=? AND generation<>?').run(projectId, generation);
      }
      this.database.exec('COMMIT');
      return published;
    } catch (error) {
      this.database.exec('ROLLBACK');
      throw error;
    }
  }

  discard(projectId: string, generation: number): void {
    if (!this.database.isOpen) return;
    this.database.prepare('DELETE FROM repo_map_items WHERE project_id=? AND generation=?').run(projectId, generation);
    this.database.prepare('DELETE FROM repo_map_instructions WHERE project_id=? AND generation=?').run(projectId, generation);
  }

  current(projectId: string): { policyRevision: string; items: RepoMapItem[]; instructions: RepoMapInstruction[] } | null {
    const row = this.database.prepare('SELECT published_generation,policy_revision FROM repo_map_generations WHERE project_id=?').get(projectId);
    if (typeof row?.published_generation !== 'number' || typeof row.policy_revision !== 'string') return null;
    const generation = row.published_generation, policyRevision = row.policy_revision;
    const items = this.database.prepare('SELECT metadata_json FROM repo_map_items WHERE project_id=? AND generation=? ORDER BY path COLLATE BINARY').all(projectId, generation);
    const instructions = this.database.prepare('SELECT path,content_hash FROM repo_map_instructions WHERE project_id=? AND generation=? ORDER BY path COLLATE BINARY').all(projectId, generation);
    return {
      policyRevision,
      items: items.map(value => ({ ...JSON.parse(String(value.metadata_json)) as RepoMapMetadata, projectId, policyRevision, generation })),
      instructions: instructions.map(value => ({ path: String(value.path), contentHash: String(value.content_hash), authority: 'project_rules' }))
    };
  }
}
