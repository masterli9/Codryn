import { useEffect, useRef, useState } from 'react';
import type { GitItem, GitSnapshot, R3ResponseFor } from '@codryn/shared';
import type { R3Client } from '../r3-client.js';
import { Dialog } from './dialog.js';

const sides = { staged: 'Připravené', unstaged: 'Nepřipravené', untracked: 'Nové', conflict: 'Konflikty' } as const;
type HistoryPage = R3ResponseFor<'git.history'>;
type CommitItem = Extract<HistoryPage,{ok:true}>['value']['commits'][number];

export function GitPanel({ client, projectId, busy, close, onChange }: { client: R3Client; projectId: string; busy: boolean; close(): void; onChange(): void }) {
  const [view, setView] = useState<GitSnapshot | null>(null);
  const [error, setError] = useState<string | null>(null), [pending, setPending] = useState(false);
  const [patch, setPatch] = useState<{ label: string; text: string; truncated: boolean } | null>(null);
  const [history, setHistory] = useState<{ commits: CommitItem[]; next: number | null } | null>(null);
  const [files, setFiles] = useState<{ hash: string; paths: string[] } | null>(null);
  const [message, setMessage] = useState(''), [proposal, setProposal] = useState<string | null>(null);
  const [branch, setBranch] = useState(''), [confirm, setConfirm] = useState<'switch'|'commit'|null>(null);
  const epoch = useRef(0), actionLock = useRef(false), current = useRef<string | null>(null);
  const clearDerived = () => { setPatch(null); setHistory(null); setFiles(null); setProposal(null); setConfirm(null); };

  function apply(next: GitSnapshot) {
    if (current.current !== next.snapshotId) clearDerived();
    current.current = next.snapshotId;
    setView(next);
  }

  useEffect(() => {
    let disposed = false, checking = false;
    async function poll() {
      if (checking || actionLock.current) return;
      checking = true;
      const request = ++epoch.current;
      try {
        const next = await client.call('git.status', { projectId });
        if (!disposed && request === epoch.current) apply(next);
      } catch (error) {
        if (!disposed && request === epoch.current) {
          current.current = null; setView(null); clearDerived();
          setError(error instanceof Error ? error.message : 'Git stav nelze načíst.');
        }
      } finally { checking = false; }
    }
    void poll();
    const timer = setInterval(() => void poll(), 3500);
    return () => { disposed = true; clearInterval(timer); ++epoch.current; };
  }, [client, projectId]);

  async function run(action: (identity: string) => Promise<void>) {
    const id = current.current;
    if (!id || actionLock.current) return;
    actionLock.current = true; const job = ++epoch.current; setPending(true); setError(null);
    try { await action(id); }
    catch (error) {
      if (job === epoch.current) {
        const message = error instanceof Error ? error.message : 'Git akce se nezdařila.';
        setError(message);
        if (message.startsWith('R3_STALE_VIEW:')) {
          clearDerived();
          const fresh = await client.call('git.status', { projectId }).catch(() => null);
          if (job === epoch.current && fresh) apply(fresh);
        }
      }
    } finally { actionLock.current = false; if (job === epoch.current) setPending(false); }
  }

  const showDiff = (item: GitItem) => run(async snapshotId => {
    const result = await client.call('git.diff', { projectId, snapshotId, path: item.path, side: item.side });
    if (snapshotId === current.current) setPatch({ label: item.path, text: result.text, truncated: result.truncated });
  });
  const mutate = (item: GitItem) => run(async snapshotId => {
    apply(await client.call(item.side === 'staged' ? 'git.unstage' : 'git.stage', { projectId, snapshotId, path: item.path }));
    onChange();
  });
  const showHistory = (cursor: number) => run(async snapshotId => {
    const page = await client.call('git.history', { projectId, snapshotId, cursor });
    if (snapshotId === current.current) setHistory(last => ({ commits: cursor ? [...(last?.commits ?? []), ...page.commits] : page.commits, next: page.next }));
  });

  return <Dialog title="Lokální Git" close={() => { if (!pending) close(); }}>
    {error && <p role="alert" className="error">{error}</p>}
    {!view && !error && <p role="status">Načítám stav Gitu…</p>}
    {view?.reason && <p role="status">{view.reason}</p>}
    {view?.mode === 'git' && <>
      <p><strong>{view.branch ?? 'Odpojený HEAD'}</strong> · {view.head?.slice(0, 10) ?? 'Bez prvního commitu'}</p>
      {view.upstream && <p className="meta">{view.upstream} · před {view.ahead ?? '—'} · za {view.behind ?? '—'}</p>}
      {view.projectPrefix && <p className="meta">Podadresář worktree · {view.projectPrefix}</p>}
      {view.items.length === 0 && <p>Žádné změny k zobrazení.</p>}
      {(Object.keys(sides) as GitItem['side'][]).map(side => {
        const items = view.items.filter(item => item.side === side);
        return items.length ? <section key={side}><h3>{sides[side]}</h3><ul className="git-paths">
          {items.map(item => <li key={item.path}>
            <button disabled={pending} onClick={() => void showDiff(item)}>{item.status} · {item.originalPath ? `${item.originalPath} → ` : ''}{item.path}</button>
            {item.actionable && side !== 'conflict' && <button type="button" disabled={busy || pending} onClick={() => void mutate(item)} aria-label={`${side === 'staged' ? 'Odebrat z indexu' : 'Přidat do indexu'} ${item.path}`}>
              {side === 'staged' ? 'Odebrat z indexu' : 'Přidat do indexu'}
            </button>}
          </li>)}
        </ul></section> : null;
      })}
      {patch && <section><h3>Změny {patch.label}</h3><pre>{patch.text || 'Žádný textový rozdíl.'}</pre>{patch.truncated && <p>Výstup je zkrácený.</p>}</section>}
      {view.branches.length > 1 && <section><h3>Větve</h3><label>Cílová větev<select value={branch} onChange={event => {setBranch(event.target.value);setConfirm(null);}}>
        <option value="">Vyberte větev</option>{view.branches.filter(name => name !== view.branch).map(name => <option key={name}>{name}</option>)}
      </select></label><button disabled={busy || pending || !branch || !view.canSwitch} onClick={() => setConfirm('switch')}>Přepnout větev</button></section>}
      <section><h3>Commit</h3>
        <label>Zpráva commitu<textarea value={message} maxLength={4096} onChange={event => {setMessage(event.target.value);setConfirm(null);}} /></label>
        {proposal && <p className="meta">Upravitelný návrh ze souborů připravených v indexu.</p>}
        <button disabled={pending || busy || !view.canCommit} onClick={() => void run(async snapshotId => {
          const result = await client.call('git.suggestMessage', { projectId, snapshotId });
          if (result.sourceSnapshotId === current.current) { setMessage(result.message);setProposal(snapshotId); }
        })}>Navrhnout zprávu</button>
        <button className="primary" disabled={pending || busy || !view.canCommit || !message.trim()} onClick={() => setConfirm('commit')}>Vytvořit commit</button>
      </section>
      {confirm && <section aria-label="Potvrzení Git akce">
        <p>{confirm === 'switch' ? `Přepnout celý pracovní strom na větev ${branch}?` : 'Vytvořit místní commit z právě zobrazeného indexu?'}</p>
        <button disabled={pending || busy} onClick={() => void run(async snapshotId => {
          const next = confirm === 'switch' ? await client.call('git.switchBranch', { projectId, snapshotId, branch })
            : await client.call('git.commit', { projectId, snapshotId, message });
          apply(next); setConfirm(null); if (confirm === 'commit') setMessage(''); onChange();
        })}>Potvrdit {confirm === 'switch' ? 'přepnutí' : 'commit'}</button>
        <button disabled={pending} onClick={() => setConfirm(null)}>Zrušit</button>
      </section>}
      <section><h3>Historie</h3>
        {!history ? <button disabled={pending || !view.head} onClick={() => void showHistory(0)}>Načíst historii</button> : <>
          <ul className="git-paths">{history.commits.map(item => <li key={item.hash}><div>
            <button disabled={pending} onClick={() => void run(async snapshotId => {
              const selected = await client.call('git.commitFiles', { projectId, snapshotId, hash: item.hash });
              if (selected.snapshotId === current.current) setFiles({ hash: item.hash, paths: selected.paths });
            })}>{item.hash.slice(0, 10)} · {item.title}</button>
            <p className="meta">{item.author} · {item.at}{item.refs ? ` · ${item.refs}` : ''}</p>
            {item.parents.length > 0 && <p className="meta">Rodiče {item.parents.map(parent => parent.slice(0, 10)).join(', ')}</p>}
            {files?.hash === item.hash && <ul>{files.paths.map(path => <li key={path}>{path}</li>)}</ul>}
          </div></li>)}</ul>
          {history.next !== null && <button disabled={pending} onClick={() => void showHistory(history.next ?? 0)}>Další commity</button>}
        </>}
      </section>
    </>}
  </Dialog>;
}
