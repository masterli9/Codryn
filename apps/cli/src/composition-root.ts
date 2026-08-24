import { createR1Infrastructure } from '@codryn/infrastructure';
import { readSearchSummaryScenario } from './scenarios/read-search-summary.js';

export function createCliInfrastructure(input: { readonly userDataPath: string; readonly projectRoot: string; readonly scenario: 'read-search-summary' }) {
  return createR1Infrastructure({ ...input, scenario: readSearchSummaryScenario() });
}
