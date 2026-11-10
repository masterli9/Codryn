import type { R3Snapshot, R3Update, Uuid } from '@codryn/shared';
import type { IdGenerator } from '../diagnostics/ports.js';
import type { DesktopProjectionStore } from './ports.js';
interface Subscription { chatId: Uuid; cursor: number; ready: boolean; send(update: R3Update): void }
export class SubscriptionService {
  private readonly subscribers = new Map<Uuid, Subscription>();
  private readonly timer: ReturnType<typeof setInterval>;
  private draining = false;
  private closed = false;
  constructor(private readonly store: Pick<DesktopProjectionStore, 'snapshot' | 'updates'>, private readonly ids: IdGenerator) {
    this.timer = setInterval(() => { void this.drain().catch(() => { for(const subscriber of this.subscribers.values()){try{subscriber.send({kind:'resync_required',chatId:subscriber.chatId,cursor:subscriber.cursor});}catch{/* Disconnected renderer. */}}this.subscribers.clear(); }); }, 50);
    this.timer.unref();
  }
  async attach(chatId: Uuid, afterCursor: number, send: (update: R3Update) => void): Promise<{ id: Uuid; snapshot: R3Snapshot }> {
    if (this.closed || !Number.isSafeInteger(afterCursor) || afterCursor<0) throw new Error('R3_INPUT_INVALID');
    const id = this.ids.next(), subscriber = { chatId, cursor: afterCursor, ready: false, send }; this.subscribers.set(id, subscriber);
    try { const snapshot = await this.store.snapshot(chatId); subscriber.cursor=snapshot.cursor; subscriber.ready=true; return { id, snapshot }; }
    catch (error) { this.subscribers.delete(id); throw error; }
  }
  detach(id: Uuid): void { this.subscribers.delete(id); }
  async drain(): Promise<void> {
    if (this.draining || this.closed) return; this.draining=true;
    try {
      for (const [id, subscriber] of this.subscribers) {
        if (!subscriber.ready) continue;
        const updates = await this.store.updates(subscriber.chatId,subscriber.cursor,257);
        if (!this.subscribers.has(id) || this.closed) continue;
        if (updates.length>256 || new TextEncoder().encode(JSON.stringify(updates)).length>1024*1024 || updates[0]?.kind==='resync_required') {
          this.subscribers.delete(id); try { subscriber.send({kind:'resync_required',chatId:subscriber.chatId,cursor:updates.at(-1)?.cursor??subscriber.cursor}); } catch { /* Disconnected renderer. */ } continue;
        }
        for (const update of updates) {
          if (update.cursor<=subscriber.cursor) continue;
          try {
            if (update.cursor!==subscriber.cursor+1) { this.subscribers.delete(id); subscriber.send({kind:'resync_required',chatId:subscriber.chatId,cursor:update.cursor}); break; }
            subscriber.send(update); subscriber.cursor=update.cursor;
          } catch { this.subscribers.delete(id); break; }
        }
      }
    } finally { this.draining=false; }
  }
  close(): void { this.closed=true; clearInterval(this.timer); this.subscribers.clear(); }
}
