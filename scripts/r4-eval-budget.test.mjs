import { test } from 'node:test';
import assert from 'node:assert/strict';
import { R4RequestBudget } from './r4-eval-budget.mjs';
test('caps delegated provider attempts and retains reservations after failure or unknown usage',()=>{
  const budget=new R4RequestBudget({maxRequests:1,maxCostUsd:1,inputPrice:1,outputPrice:1});
  let calls=0;
  const remote=()=>{budget.reserve({input:'fixture'});calls++;throw new Error('provider_failed');};
  assert.throws(remote,/provider_failed/u);
  assert.throws(remote,/R4_EVAL_BUDGET_EXHAUSTED/u);
  assert.equal(calls,1);
  assert.equal(budget.requests,1);
  assert.ok(budget.reservedUsd>0);
});
test('refuses a request exceeding the cost reservation before provider delegation',()=>{
  const budget=new R4RequestBudget({maxRequests:10,maxCostUsd:0.000001,inputPrice:1,outputPrice:1});
  assert.throws(()=>budget.reserve({input:'fixture'}),/R4_EVAL_BUDGET_EXHAUSTED/u);
  assert.equal(budget.requests,0);
  assert.equal(budget.reservedUsd,0);
});
