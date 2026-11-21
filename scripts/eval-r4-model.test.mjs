import { test } from 'node:test';
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { readFile } from 'node:fs/promises';
import { createHash } from 'node:crypto';
import { isSafeR4EvalId, r4EvalReportSchema } from './r4-eval-report.mjs';
test('live evaluation stays opt-in before any provider call',()=>{
  const result=spawnSync(process.execPath,['scripts/eval-r4-model.mjs','--live'],{cwd:process.cwd(),encoding:'utf8',timeout:5000,windowsHide:true});
  assert.equal(result.status,2);
  assert.equal(JSON.parse(result.stdout).status,'not_run');
});
test('the frozen nine-case offline report has consistent metrics and unknown model usage',async()=>{
  const report=JSON.parse(await readFile('docs/evals/r4-offline-report.json','utf8'));
  const bytes=await readFile('tests/support/r4-eval/dataset-v1.json');
  const dataset=JSON.parse(bytes.toString('utf8'));
  assert.equal(report.datasetHash,createHash('sha256').update(bytes).digest('hex'));
  assert.deepEqual(report.results.map(item=>item.id),dataset.cases.map(item=>item.id));
  assert.equal(r4EvalReportSchema.safeParse(report).success,true);
  if (report.evalIdentity) assert.equal(Object.hasOwn(report.evalIdentity,'r4ModelEvalDiagnosticsSha256'),false);
  const legacyIdentity = { runnerSha256:'a'.repeat(64),fixtureBuilderSha256:'b'.repeat(64),counterOracleSha256:'c'.repeat(64),budgetSha256:'d'.repeat(64),safeOutputSha256:'e'.repeat(64),reportSchemaSha256:'f'.repeat(64) };
  assert.equal(r4EvalReportSchema.safeParse({ ...report, evalIdentity: legacyIdentity }).success,true);
  assert.equal(r4EvalReportSchema.safeParse({ ...report, evalIdentity: { ...legacyIdentity, r4ModelEvalDiagnosticsSha256: '1'.repeat(64) } }).success,true);
  assert.equal(r4EvalReportSchema.safeParse({ ...report, evalIdentity: { ...legacyIdentity, r4ModelEvalDiagnosticsSha256: 'invalid' } }).success,false);
  assert.equal(r4EvalReportSchema.safeParse({...report,passed:100}).success,false);
  assert.equal(r4EvalReportSchema.safeParse({...report,evalIdentity:{runnerSha256:'a'.repeat(64),fixtureBuilderSha256:'b'.repeat(64),counterOracleSha256:'c'.repeat(64),budgetSha256:'d'.repeat(64),safeOutputSha256:'e'.repeat(64),reportSchemaSha256:'f'.repeat(64)}}).success,true);
  const wrong=JSON.parse(JSON.stringify(report));wrong.results[0].validArguments=wrong.results[0].toolCalls+1;
  assert.equal(r4EvalReportSchema.safeParse(wrong).success,false);
});
test('eval case IDs are restricted to path-safe slugs',()=>{
  assert.equal(isSafeR4EvalId('counter-git'),true);
  assert.equal(isSafeR4EvalId('../outside'),false);
  assert.equal(isSafeR4EvalId('nested/path'),false);
});
