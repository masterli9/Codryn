import { createR1Infrastructure, UuidGenerator } from '@codryn/infrastructure';
import { readSearchSummaryScenario } from './scenarios/read-search-summary.js';

export function createCliInfrastructure(input: { readonly userDataPath: string; readonly projectRoot: string; readonly scenario: 'read-search-summary' }) {
  const ids = new UuidGenerator();
  return createR1Infrastructure({
    ...input,
    ids,
    scenario: readSearchSummaryScenario({ first: ids.next(), second: ids.next() })
  });
}
