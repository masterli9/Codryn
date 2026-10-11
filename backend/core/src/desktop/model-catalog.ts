import type { ModelDescriptor,R3Mode } from '@codryn/shared';
export function r3ModelDescriptor(mode:R3Mode):ModelDescriptor {
  return mode==='demo'?{adapterId:'scripted-fake',modelId:'r3-demo-reference',capabilities:{streaming:'supported',toolCalling:'supported',structuredOutput:'unknown',imageInput:'unsupported',usageMetadata:'supported',contextLimit:'unknown',compaction:'unsupported'}}:{adapterId:'openai-responses',modelId:'gpt-6-luna',capabilities:{streaming:'supported',toolCalling:'supported',structuredOutput:'unknown',imageInput:'unsupported',usageMetadata:'supported',contextLimit:'unknown',compaction:'unsupported'}};
}
