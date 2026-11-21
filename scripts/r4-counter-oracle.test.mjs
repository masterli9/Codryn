import { test } from 'node:test';
import assert from 'node:assert/strict';
import { counterOracle } from './r4-counter-oracle.mjs';

test('evaluates the expected counter result from supported function and arrow ASTs', () => {
  assert.equal(counterOracle('export function nextCount(value: number) { return value + 1; }'), 'verified');
  assert.equal(counterOracle('export const nextCount = (value: number) => value + 1;'), 'verified');
  assert.equal(counterOracle('export function nextCount(value: number) { return value + 2; }'), 'mismatch');
});

test('does not infer behavior from test text or unsupported implementations', () => {
  assert.equal(counterOracle('export function nextCount(value: number) { return Math.max(2, value); }'), 'unsupported');
  assert.equal(counterOracle('export function nextCount(value: number) { log(value); return value + 1; }'), 'unsupported');
  assert.equal(counterOracle('export function nextCount(value: number) { return value +; }'), 'unsupported');
});
