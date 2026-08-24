import type { ModelAdapter } from '@codryn/core';
import {
  modelStreamEventSchema,
  type ModelDescriptor,
  type ModelRequest,
  type ModelStreamEvent
} from '@codryn/shared';

export interface FakeScenarioStep {
  readonly assertRequest: (request: ModelRequest) => void;
  readonly events: readonly ModelStreamEvent[];
}

export interface FakeScenario {
  readonly id: string;
  readonly steps: readonly FakeScenarioStep[];
}

function deepFreeze<T>(value: T): T {
  if (typeof value !== 'object' || value === null || Object.isFrozen(value)) {
    return value;
  }
  for (const nested of Object.values(value as Record<string, unknown>)) {
    deepFreeze(nested);
  }
  return Object.freeze(value);
}

function cloneScenario(scenario: FakeScenario): FakeScenario {
  const steps = scenario.steps.map((step): FakeScenarioStep => {
    const events = step.events.map((event) => deepFreeze(modelStreamEventSchema.parse(event)));
    return Object.freeze({
      assertRequest: step.assertRequest,
      events: Object.freeze(events)
    });
  });
  return Object.freeze({
    id: scenario.id,
    steps: Object.freeze(steps)
  });
}

function createDescriptor(modelId: string): ModelDescriptor {
  return deepFreeze({
    adapterId: 'scripted-fake',
    modelId,
    capabilities: {
      streaming: 'supported',
      toolCalling: 'supported',
      structuredOutput: 'unknown',
      imageInput: 'unsupported',
      usageMetadata: 'supported',
      contextLimit: 'unknown',
      compaction: 'unsupported'
    }
  });
}

const mismatchEvent = deepFreeze<ModelStreamEvent>({
  type: 'failed',
  error: {
    code: 'R1_FAKE_SCENARIO_MISMATCH',
    message: 'Scripted scenario request mismatch.'
  }
});

const exhaustedEvent = deepFreeze<ModelStreamEvent>({
  type: 'failed',
  error: {
    code: 'R1_FAKE_SCENARIO_MISMATCH',
    message: 'Scripted scenario exhausted.'
  }
});

const cancelledEvent = deepFreeze<ModelStreamEvent>({
  type: 'failed',
  error: {
    code: 'R1_CANCELLED',
    message: 'Scripted model request cancelled.'
  }
});

export class ScriptedModelAdapter implements ModelAdapter {
  readonly descriptor: ModelDescriptor;
  readonly #scenario: FakeScenario;
  #nextStep = 0;

  constructor(scenario: FakeScenario) {
    this.#scenario = cloneScenario(scenario);
    this.descriptor = createDescriptor(this.#scenario.id);
  }

  async *stream(request: ModelRequest, signal: AbortSignal): AsyncIterable<ModelStreamEvent> {
    if (signal.aborted) {
      yield cancelledEvent;
      return;
    }

    const step = this.#scenario.steps[this.#nextStep];
    if (step === undefined) {
      yield exhaustedEvent;
      return;
    }

    try {
      step.assertRequest(request);
    } catch {
      yield mismatchEvent;
      return;
    }

    this.#nextStep += 1;
    for (const event of step.events) {
      if (signal.aborted) {
        yield cancelledEvent;
        return;
      }
      yield event;
    }
  }
}
