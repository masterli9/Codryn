import { useEffect, useId, useLayoutEffect, useRef, useState } from 'react';
import type { KeyboardEvent } from 'react';
import { maxR4References } from '@codryn/shared';
import type { R4Reference, R4ReferencePermitInput, R4ReferenceSearchPage } from '@codryn/shared';
import { Icon } from './icon.js';

export interface RetryDraft {
  id: string;
  chatId: string;
  text: string;
  retryOfRequestId: string;
  references?: R4Reference[] | undefined;
}
interface Draft {
  text: string;
  references: R4Reference[];
  retryOfRequestId?: string;
  permitRequestId?: string;
}
interface ReferenceQuery { start: number; end: number; query: string; offset: number }
interface ComposerProps {
  chatId: string;
  busy: boolean;
  archived: boolean;
  send: (text: string, requestId: string, retryOfRequestId?: string, references?: R4Reference[]) => Promise<unknown>;
  retryDraft?: RetryDraft | null;
  searchReferences?: ((chatId: string, query: string, offset: number) => Promise<R4ReferenceSearchPage>) | undefined;
  permitReference?: (chatId: string, requestId: string, input: R4ReferencePermitInput) => Promise<R4Reference>;
}

const emptyDraft: Draft = { text: '', references: [] };

function referenceQuery(text: string, caret: number): ReferenceQuery | null {
  const token = /(?:^|\s)@([^@\n\r]*)$/u.exec(text.slice(0, caret));
  const query = token?.[1];
  return query !== undefined && query.length <= 200 ? { start: caret - query.length - 1, end: caret, query, offset: 0 } : null;
}

export function Composer({ chatId, busy, archived, send, retryDraft, searchReferences, permitReference }: ComposerProps) {
  const drafts = useRef(new Map<string, Draft>()), attempts = useRef(new Map<string, { identity: string; requestId: string }>());
  const selected = useRef(chatId), appliedRetry = useRef<string | null>(null), locked = useRef(false);
  const input = useRef<HTMLTextAreaElement>(null), nextCaret = useRef<number | null>(null);
  const [draft, setDraft] = useState<Draft>(emptyDraft), [error, setError] = useState<string | null>(null), [sending, setSending] = useState(false);
  const [picker, setPicker] = useState<ReferenceQuery | null>(null), [active, setActive] = useState(0);
  const [searchResult, setSearchResult] = useState<{ picker: ReferenceQuery; page?: R4ReferenceSearchPage; error?: string } | null>(null);
  const [permit, setPermit] = useState<R4ReferencePermitInput | null>(null), [authorizing, setAuthorizing] = useState(false);
  const listId = useId();
  const result = searchResult?.picker === picker ? searchResult : null;
  const page = result?.page;
  const items = page?.items ?? [];

  useEffect(() => {
    selected.current = chatId;
    if (retryDraft?.chatId === chatId && appliedRetry.current !== retryDraft.id) {
      drafts.current.set(chatId, { text: retryDraft.text, references: retryDraft.references ?? [], retryOfRequestId: retryDraft.retryOfRequestId });
      attempts.current.delete(chatId);
      appliedRetry.current = retryDraft.id;
      input.current?.focus();
    }
    setDraft(drafts.current.get(chatId) ?? emptyDraft);
    setPicker(null);
    setPermit(null);
    setError(null);
  }, [chatId, retryDraft]);

  useEffect(() => {
    if (!picker || !searchReferences || busy || archived || sending) return;
    let current = true;
    const timer = setTimeout(() => {
      void searchReferences(chatId, picker.query, picker.offset).then(page => {
        if (current) setSearchResult({ picker, page });
      }).catch(error => {
        if (current) setSearchResult({ picker, error: error instanceof Error ? error.message : 'Hledání v projektu selhalo.' });
      });
    }, 120);
    return () => { current = false; clearTimeout(timer); };
  }, [chatId, picker, searchReferences, busy, archived, sending]);

  useLayoutEffect(() => {
    if (nextCaret.current === null) return;
    input.current?.setSelectionRange(nextCaret.current, nextCaret.current);
    nextCaret.current = null;
  }, [draft.text]);

  useEffect(() => {
    if (picker && items[active]) document.getElementById(`${listId}-${active}`)?.scrollIntoView?.({ block: 'nearest' });
  }, [picker, items, active, listId]);

  function updateDraft(value: Draft) {
    drafts.current.set(chatId, value);
    setDraft(value);
  }

  function chooseReference(reference: R4Reference) {
    if (!picker) return;
    const alreadySelected = draft.references.some(item => item.path === reference.path);
    if (!alreadySelected && draft.references.length >= maxR4References) {
      setError(`K zadání lze připojit nejvýše ${maxR4References} referencí.`);
      return;
    }
    const references = alreadySelected ? draft.references.map(item => item.path === reference.path ? reference : item) : [...draft.references, reference];
    const text = draft.text.slice(0, picker.start) + draft.text.slice(picker.end);
    nextCaret.current = picker.start;
    updateDraft({ ...draft, text, references });
    setPicker(null);
    setError(null);
    input.current?.focus();
  }

  async function confirmPermit() {
    if (!permit || !picker || !permitReference || authorizing) return;
    const owner = chatId, snapshot = draft, requestId = crypto.randomUUID();
    setAuthorizing(true);
    try {
      const reference = await permitReference(owner, requestId, permit);
      if (selected.current !== owner || drafts.current.get(owner) !== snapshot) return;
      const references = draft.references.filter(item => item.path !== reference.path);
      if (references.length >= maxR4References) throw new Error(`K zadání lze připojit nejvýše ${maxR4References} referencí.`);
      const text = draft.text.slice(0, picker.start) + draft.text.slice(picker.end);
      nextCaret.current = picker.start;
      attempts.current.delete(owner);
      updateDraft({ ...draft, text, references: [...references, reference], permitRequestId: requestId });
      setPermit(null);
      setPicker(null);
      setError(null);
    } catch (error) {
      if (selected.current === owner) setError(error instanceof Error ? error.message : 'Výjimku se nepodařilo potvrdit.');
    } finally {
      setAuthorizing(false);
      if (selected.current === owner) input.current?.focus();
    }
  }

  async function submit() {
    if (locked.current || busy || archived || authorizing || !draft.text.trim()) return;
    const owner = chatId, task = draft.text.trim(), { retryOfRequestId, references } = draft;
    const identity = JSON.stringify([task, retryOfRequestId, references]);
    let attempt = attempts.current.get(owner);
    if (!attempt || attempt.identity !== identity) {
      attempt = { identity, requestId: attempt ? crypto.randomUUID() : draft.permitRequestId ?? crypto.randomUUID() };
      attempts.current.set(owner, attempt);
    }
    locked.current = true;
    setSending(true);
    setError(null);
    setPicker(null);
    try {
      if (references.length) await send(task, attempt.requestId, retryOfRequestId, references);
      else await send(task, attempt.requestId, retryOfRequestId);
      if (attempts.current.get(owner) === attempt) attempts.current.delete(owner);
      if (drafts.current.get(owner) === draft) {
        drafts.current.delete(owner);
        if (selected.current === owner) setDraft(emptyDraft);
      }
    } catch (error) {
      if (selected.current === owner && drafts.current.get(owner) === draft) {
        setError(error instanceof Error ? error.message : 'Odeslání selhalo. Koncept zůstává zachován.');
      }
    } finally {
      locked.current = false;
      setSending(false);
    }
  }

  function onKeyDown(event: KeyboardEvent<HTMLTextAreaElement>) {
    if (event.nativeEvent.isComposing) return;
    if (picker && event.key === 'Escape') {
      event.preventDefault();
      event.stopPropagation();
      setPicker(null);
      setPermit(null);
      return;
    }
    if (picker && (event.key === 'ArrowDown' || event.key === 'ArrowUp')) {
      if (items.length) {
        event.preventDefault();
        const direction = event.key === 'ArrowDown' ? 1 : -1;
        setActive((active + direction + items.length) % items.length);
      }
      return;
    }
    if (event.key === 'Enter' && !event.shiftKey) {
      event.preventDefault();
      if (picker) {
        const item = items[active];
        if (item) chooseReference(item);
      } else void submit();
    }
  }

  return <footer className="composer-wrap">
    {draft.retryOfRequestId && <p className="meta" role="status">Nový pokus · upravte zadání a odešlete jej.</p>}
    <form className="composer" onSubmit={event => { event.preventDefault(); void submit(); }}>
      {draft.references.length > 0 && <ul className="project-references" aria-label="Projektové reference">
        {draft.references.map(reference => <li key={reference.path}>
          <span title={reference.path}>{reference.kind === 'directory' ? 'Složka' : 'Soubor'} · {reference.path}</span>
          <button type="button" aria-label={`Odebrat referenci ${reference.path}`} disabled={archived || sending} onClick={() => {
            updateDraft({ ...draft, references: draft.references.filter(item => item.path !== reference.path) });
            setError(null);
            input.current?.focus();
          }}>×</button>
        </li>)}
      </ul>}
      <textarea ref={input} aria-label="Zadání úkolu" placeholder="Zadejte nový samostatný úkol…" maxLength={16384} value={draft.text}
        disabled={archived || sending || authorizing} aria-autocomplete={searchReferences ? 'list' : undefined}
        aria-controls={picker ? listId : undefined} aria-activedescendant={picker && items[active] ? `${listId}-${active}` : undefined}
        onChange={event => {
          const { value: text, selectionStart } = event.target;
          updateDraft({ ...draft, text });
          setPicker(searchReferences && !busy ? referenceQuery(text, selectionStart) : null);
          setPermit(null);
          setActive(0);
        }}
        onKeyDown={onKeyDown}
      />
      {picker && <div className="reference-picker">
        <ul id={listId} role="listbox" aria-label="Soubory a složky projektu">
          {items.map((reference, index) => <li key={reference.path} id={`${listId}-${index}`} role="option" aria-selected={index === active}
            onMouseDown={event => event.preventDefault()} onClick={() => chooseReference(reference)} title={reference.path}>
            <span>{reference.kind === 'directory' ? 'Složka' : 'Soubor'}</span>{reference.path}
          </li>)}
        </ul>
        {!result && <p role="status" className="meta">Hledám v projektu…</p>}
        {result?.error && <p role="status" className="meta">{result.error}</p>}
        {page && items.length === 0 && <p role="status" className="meta">Žádný dostupný soubor ani složka.</p>}
        {page?.limited && <p role="status" className="meta">{page.reason ?? 'Výsledky hledání jsou omezené.'}</p>}
        {page?.nextOffset != null && <button type="button" onClick={() => {
          setPicker({ ...picker, offset: page.nextOffset ?? 0 });
          setActive(0);
          input.current?.focus();
        }}>Další výsledky</button>}
        {permitReference && picker.query.trim() && items.length === 0 && page && !page.limited && !permit && <div className="actions">
          <button type="button" onClick={() => setPermit({ path: picker.query.trim(), kind: 'ignored' })}>Povolit ignorovaný soubor</button>
          <button type="button" onClick={() => setPermit({ path: picker.query.trim(), kind: 'sensitive' })}>Povolit citlivý soubor</button>
        </div>}
        {permit && <div className="reference-permit">
          <p>{permit.kind === 'sensitive'
            ? 'Tento soubor může obsahovat klíče nebo jiná tajemství. Potvrzením dovolíte načíst omezený výřez pro tento požadavek a předat ho zvolenému modelu.'
            : 'Potvrzením povolíte načíst omezený výřez tohoto ignorovaného souboru pro tento požadavek.'}</p>
          <p>{permit.path}</p>
          <div className="actions">
            <button type="button" disabled={authorizing} onClick={() => void confirmPermit()}>Povolit pro toto odeslání</button>
            <button type="button" disabled={authorizing} onClick={() => setPermit(null)}>Zrušit výjimku</button>
          </div>
        </div>}
      </div>}
      <div className="composer-footer">
        <span className="meta">{archived ? 'Archivovaný chat' : busy ? 'Běh nebo načítání chatu' : picker ? 'Šipky a Enter vyberou · Esc zavře' : searchReferences ? '@ hledá v projektu · Enter odešle · Shift+Enter nový řádek' : 'Enter odešle · Shift+Enter nový řádek'}</span>
        <button className="primary" type="submit" disabled={sending || authorizing || busy || archived || !draft.text.trim()} aria-label="Odeslat úkol"><Icon name="send" />{sending ? 'Odesílání…' : 'Odeslat'}</button>
      </div>
    </form>
    {error && <p role="alert" className="error">{error}</p>}
    <p className="hint">Nový úkol začíná samostatně. Starší zprávy zůstávají v historii.</p>
  </footer>;
}
