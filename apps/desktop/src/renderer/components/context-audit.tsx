import type { R4ContextAuditSource, R4ContextAuditSummary } from '@codryn/shared';

const sourceLabels: Record<R4ContextAuditSource['source'], string> = {
  user_text: 'Zadání',
  chat_history: 'Historie chatu',
  project_rules: 'Pravidla projektu',
  project_reference: 'Reference @',
  repo_map: 'Mapa projektu',
  loaded_excerpt: 'Výřez souboru'
};

const reasonLabels: Readonly<Partial<Record<string, string>>> = {
  binary: 'Soubor nemá formát UTF-8.',
  blocked_reference: 'Zkontrolujte nedostupnou referenci.',
  byte_budget: 'Dosažen limit objemu kontextu.',
  cancelled: 'Běh byl zastaven.',
  changed: 'Obsah se od výběru změnil.',
  excerpt_limit: 'Dosažen limit výřezu.',
  ignored: 'Cesta je vynechaná pravidly projektu.',
  limit: 'Dosažen limit mapy projektu.',
  limited: 'Dosažen limit načítání.',
  map_building: 'Mapa se ještě vytváří.',
  missing: 'Soubor nebo složka už na této cestě nejsou.',
  outside_root: 'Cesta nemíří do otevřeného projektu.',
  oversized: 'Soubor přesahuje povolenou velikost.',
  partial: 'Mapa projektu je neúplná.',
  policy_changed: 'Pravidla projektu se změnila.',
  policy_invalid: 'Soubor .codrynignore obsahuje chybu.',
  sensitive: 'Cesta může obsahovat tajemství.',
  stale: 'Podklad je zastaralý.',
  unavailable: 'Zdroj není dostupný.',
  unread: 'Soubor se nepodařilo načíst.'
};

export function ContextAudit({ audit }: { readonly audit: R4ContextAuditSummary }) {
  return <section aria-labelledby="context-audit-title">
    <h3 id="context-audit-title">Kontext běhu</h3>
    <p>{audit.totalBytes.toLocaleString('cs-CZ')} B použitého obsahu</p>
    <ul>
      {audit.sources.map(item => <li key={item.source}>
        <strong>{sourceLabels[item.source]}</strong>
        <span>{` · použito ${item.used} · vynecháno ${item.omitted}`}</span>
        {item.truncated > 0 && <span>{` · zkráceno ${item.truncated}`}</span>}
        {item.reasons.length > 0 && <p>{item.reasons.map(reason => reasonLabels[reason] ?? reason).join(' ')}</p>}
      </li>)}
    </ul>
  </section>;
}
