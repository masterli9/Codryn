import { describe, expect, it } from 'vitest';
import {
  modelDescriptorSchema,
  modelRequestSchema,
  modelStreamEventSchema
} from '../src/index.js';

const runId = '22222222-2222-4222-8222-222222222222';
const callId = '33333333-3333-4333-8333-333333333333';

const descriptor = {
  adapterId: 'scripted',
  modelId: 'read-search-summary',
  capabilities: {
    streaming: 'supported',
    toolCalling: 'supported',
    structuredOutput: 'unsupported',
    imageInput: 'unknown',
    usageMetadata: 'supported',
    contextLimit: 'unknown',
    compaction: 'unsupported'
  }
};

const request = {
  runId,
  task: 'Najdi definici souhrnu.',
  project: { id: 'r1-fixture' },
  context: [{
    path: 'README.md',
    content: '# Fixture',
    contentHash: 'a'.repeat(64),
    byteLength: 9,
    reason: 'explicit_reference'
  }],
  tools: [{
    toolId: 'text.search',
    toolVersion: 1,
    description: 'Hledá doslovný text.',
    inputSchema: { type: 'object' }
  }],
  previousToolResults: []
};

describe('R1 model contracts', () => {
  it('accepts a complete descriptor and request', () => {
    expect(modelDescriptorSchema.parse(descriptor)).toEqual(descriptor);
    expect(modelRequestSchema.parse(request)).toEqual(request);
  });

  it('rejects unknown capability values and unknown descriptor fields', () => {
    expect(() => modelDescriptorSchema.parse({
      ...descriptor,
      capabilities: { ...descriptor.capabilities, streaming: 'yes' }
    })).toThrow();
    expect(() => modelDescriptorSchema.parse({ ...descriptor, unexpected: true })).toThrow();
  });

  it.each([
    { type: 'text_delta', text: 'Část odpovědi.' },
    {
      type: 'tool_call',
      call: { callId, toolId: 'text.search', toolVersion: 1, arguments: { query: 'summary' } }
    },
    { type: 'usage', inputTokens: 12, outputTokens: 4 },
    { type: 'completed' },
    { type: 'failed', error: { code: 'R1_MODEL_ADAPTER_FAILED', message: 'Adapter selhal.' } }
  ])('accepts the %s stream event variant', (event) => {
    expect(modelStreamEventSchema.parse(event)).toEqual(event);
  });

  it('rejects a stream event without a valid event type', () => {
    expect(() => modelStreamEventSchema.parse({ text: 'Bez typu.' })).toThrow();
    expect(() => modelStreamEventSchema.parse({ type: 'unknown' })).toThrow();
  });
});
