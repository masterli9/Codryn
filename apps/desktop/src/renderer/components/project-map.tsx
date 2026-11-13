import { useEffect, useRef, useState } from 'react';
import type { R4RepoMapStatus } from '@codryn/shared';
import type { R3Client } from '../r3-client.js';

function message(status: R4RepoMapStatus): string {
  if (status.state === 'indexing') return status.mode === 'deep' ? 'Prohlubování mapy' : 'Příprava mapy projektu';
  if (status.state === 'ready') return 'Mapa projektu je připravená';
  if (status.reason === 'cancelled') return 'Prohlubování mapy bylo zrušeno';
  if (status.reason === 'changed') return 'Projekt se při mapování změnil';
  if (status.reason === 'policy_invalid') return status.policyLine === undefined
    ? 'Soubor .codrynignore nelze použít'
    : `Neplatné pravidlo .codrynignore na řádku ${status.policyLine}`;
  return status.state === 'partial' ? 'Mapa projektu je neúplná kvůli limitu' : 'Mapu projektu nelze vytvořit';
}

export function ProjectMap({ client, projectId }: { client: R3Client; projectId: string }) {
  const [status, setStatus] = useState<R4RepoMapStatus | null>(null);
  const [failed, setFailed] = useState(false);
  const [pending, setPending] = useState(false);
  const request = useRef(0);

  useEffect(() => {
    const id = ++request.current;
    setFailed(false);
    setPending(false);
    setStatus(null);
    void client.call('context.map.activate', { projectId }).then(value => {
      if (request.current === id) setStatus(value);
    }).catch(() => {
      if (request.current === id) setFailed(true);
    });
    return () => { ++request.current; };
  }, [client, projectId]);

  useEffect(() => {
    if (status?.state !== 'indexing' || pending) return;
    const id = request.current;
    let active = true;
    const timer = setTimeout(() => {
      void client.call('context.map.status', { projectId }).then(value => {
        if (active && id === request.current) setStatus(value);
      }).catch(() => {
        if (active && id === request.current) setFailed(true);
      });
    }, 400);
    return () => {
      active = false;
      clearTimeout(timer);
    };
  }, [client, projectId, status, pending]);

  const act = async (operation: 'context.map.init' | 'context.map.cancel') => {
    const id = ++request.current;
    setPending(true);
    setFailed(false);
    try {
      const value = await client.call(operation, { projectId });
      if (id === request.current) setStatus(value);
    } catch {
      if (id === request.current) setFailed(true);
    } finally {
      if (id === request.current) setPending(false);
    }
  };

  return <div className="project">
    <div role="status" className="meta">
      {failed ? 'Stav mapy projektu nelze načíst' : status && <>
        <div>{message(status)}</div>
        {status.state !== 'error' && <div>Položky {status.entries}/{status.scanned}{status.mode === 'deep' && ` · pravidla ${status.instructions}`}</div>}
      </>}
    </div>
    {status?.state === 'indexing' && status.mode === 'deep'
      ? <button type="button" disabled={pending} onClick={() => void act('context.map.cancel')}>Zrušit prohlubování mapy</button>
      : status && <button type="button" disabled={pending} onClick={() => void act('context.map.init')}>Prohloubit mapu projektu</button>}
  </div>;
}
