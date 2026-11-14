import assert from 'node:assert/strict';
import { test } from 'node:test';
import { discount } from './src/discount.ts';

test('applies the price reduction', () => {
  assert.equal(discount(100), 90);
});
