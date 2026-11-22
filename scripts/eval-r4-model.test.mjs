import { test } from 'node:test';
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { readFile } from 'node:fs/promises';
import { createHash } from 'node:crypto';
import { isSafeR4EvalId, r4EvalReportSchema } from './r4-eval-report.mjs';
import { effectiveR4EvalMaxSteps, readR4EvalOptions, selectR4EvalCases } from './r4-eval-selection.mjs';
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
  const selectionIdentity={...legacyIdentity,selectionSha256:'1'.repeat(64),wrapperSha256:'2'.repeat(64)};
  assert.equal(r4EvalReportSchema.safeParse({...report,evalIdentity:selectionIdentity}).success,true);
  assert.equal(r4EvalReportSchema.safeParse({...report,evalIdentity:{...selectionIdentity,selectionSha256:'invalid'}}).success,false);
  assert.equal(r4EvalReportSchema.safeParse({...report,evalIdentity:{...selectionIdentity,wrapperSha256:'invalid'}}).success,false);
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
test('case filter selects exactly one frozen case and rejects unknown IDs',async()=>{
  const bytes=await readFile('tests/support/r4-eval/dataset-v1.json');
  const dataset=JSON.parse(bytes.toString('utf8'));
  const selected=selectR4EvalCases(dataset.cases,'stale-patch');
  assert.equal(selected.length,1);
  assert.equal(selected[0].id,'stale-patch');
  assert.deepEqual(selectR4EvalCases(dataset.cases,undefined),dataset.cases);
  assert.throws(()=>selectR4EvalCases(dataset.cases,'unknown-case'),/R4_EVAL_CASE_UNKNOWN:unknown-case/u);
});
test('step overrides are strict, case-scoped, and leave the frozen default intact',()=>{
  assert.deepEqual(readR4EvalOptions(['--case','question']),{caseId:'question',maxStepsOverride:undefined});
  assert.deepEqual(readR4EvalOptions(['--case','question','--max-steps','1']),{caseId:'question',maxStepsOverride:1});
  assert.deepEqual(readR4EvalOptions(['--max-steps','32','--case','question']),{caseId:'question',maxStepsOverride:32});
  assert.equal(effectiveR4EvalMaxSteps(12,undefined),12);
  assert.equal(effectiveR4EvalMaxSteps(12,24),24);
  for(const value of ['0','33','1.5','1e1',' 12',''])
    assert.throws(()=>readR4EvalOptions(['--case','question','--max-steps',value]),/R4_EVAL_MAX_STEPS_INVALID/u);
  assert.throws(()=>readR4EvalOptions(['--max-steps','16']),/R4_EVAL_MAX_STEPS_REQUIRES_CASE/u);
  assert.throws(()=>readR4EvalOptions(['--case','question','--max-steps','16','--max-steps','18']),/R4_EVAL_MAX_STEPS_INVALID/u);
});
test('report schema distinguishes a one-case run and still accepts historical full reports',async()=>{
  const report=JSON.parse(await readFile('docs/evals/r4-offline-report.json','utf8'));
  const selected={...report,total:1,passed:1,results:[report.results[0]],selection:{kind:'case',id:report.results[0].id}};
  assert.equal(r4EvalReportSchema.safeParse(selected).success,true);
  assert.equal(r4EvalReportSchema.safeParse({...selected,selection:{kind:'case',id:'different-case'}}).success,false);
  const diagnostic={...selected,selection:{kind:'case',id:report.results[0].id,effectiveMaxSteps:24,maxStepsOverride:24,profile:'diagnostic_max_steps_override'}};
  assert.equal(r4EvalReportSchema.safeParse(diagnostic).success,true);
  assert.equal(r4EvalReportSchema.safeParse({...diagnostic,selection:{...diagnostic.selection,effectiveMaxSteps:12}}).success,false);
  assert.equal(r4EvalReportSchema.safeParse({...selected,selection:{kind:'case',id:report.results[0].id,effectiveMaxSteps:12,maxStepsOverride:null,profile:'frozen_dataset'}}).success,true);
  assert.equal(r4EvalReportSchema.safeParse({...report,total:1}).success,false);
  assert.equal(r4EvalReportSchema.safeParse(report).success,true);
});
test('live reports retain completed usage totals when a request times out',async()=>{
  const offline=JSON.parse(await readFile('docs/evals/r4-offline-report.json','utf8'));
  const base={...offline,series:'live',model:'gpt-6-luna',paidRequests:23,reservedUsd:0.11,approvedBudgetUsd:0.15,
    pricingSource:'https://developers.openai.com/api/docs/models/gpt-6-luna',total:1,passed:0,
    results:[{...offline.results[0],success:false,taskCompleted:false,recovery:false,failureOwner:'harness',reason:'run_did_not_finish',requests:23,
      inputTokens:null,outputTokens:null,reasoningTokens:null,estimatedCostUsd:null,observedUsage:{knownRequests:22,unknownRequests:1,
        inputTokens:42000,outputTokens:3500,reasoningTokens:1800,estimatedCostUsd:0.00595}}],
    selection:{kind:'case',id:offline.results[0].id}};
  assert.equal(r4EvalReportSchema.safeParse(base).success,true);
  assert.equal(r4EvalReportSchema.safeParse(offline).success,true,'legacy reports without partial usage remain valid');
  assert.equal(r4EvalReportSchema.safeParse({...base,results:[{...base.results[0],inputTokens:42000}]}).success,false,
    'partial observations must not be presented as complete totals');
  assert.equal(r4EvalReportSchema.safeParse({...base,results:[{...base.results[0],observedUsage:{...base.results[0].observedUsage,unknownRequests:2}}]}).success,false,
    'known and unknown request counts must sum to delegated requests');
  const zeroRequests={...base,paidRequests:0,results:[{...base.results[0],requests:0,inputTokens:42000,outputTokens:3500,
    reasoningTokens:1800,estimatedCostUsd:0.00595,observedUsage:{knownRequests:0,unknownRequests:0,inputTokens:42000,
      outputTokens:3500,reasoningTokens:1800,estimatedCostUsd:0.00595}}]};
  assert.equal(r4EvalReportSchema.safeParse(zeroRequests).success,false,'zero requests cannot report observed usage');
  const noKnownUsage={...base,paidRequests:1,results:[{...base.results[0],requests:1,observedUsage:{knownRequests:0,unknownRequests:1,
    inputTokens:1,outputTokens:0,reasoningTokens:null,estimatedCostUsd:0.0000001}}]};
  assert.equal(r4EvalReportSchema.safeParse(noKnownUsage).success,false,'zero known requests cannot have nonzero observed subtotals');
});
test('partial usage aggregation separates observed subtotals from incomplete totals',async()=>{
  const {createR4UsageMetrics}=await import('./r4-eval-report.mjs');
  assert.equal(typeof createR4UsageMetrics,'function');
  const partial=createR4UsageMetrics({live:true,requestCount:23,knownRequests:22,inputTokens:42000,outputTokens:3500,
    reasoningTokens:1800,usageKnown:false,reasoningKnown:false,observedReasoningKnown:true,estimatedCostUsd:0.00595});
  assert.deepEqual(partial,{inputTokens:null,outputTokens:null,reasoningTokens:null,estimatedCostUsd:null,
    observedUsage:{knownRequests:22,unknownRequests:1,inputTokens:42000,outputTokens:3500,reasoningTokens:1800,estimatedCostUsd:0.00595}});
});
test('unknown --case is rejected before live authorization or provider dispatch',()=>{
  const result=spawnSync(process.execPath,['scripts/eval-r4-model.mjs','--live','--case','unknown-case'],{cwd:process.cwd(),encoding:'utf8',timeout:5000,windowsHide:true});
  assert.equal(result.status,2);
  assert.deepEqual(JSON.parse(result.stdout),{status:'not_run',reason:'unknown_case',caseId:'unknown-case'});
});
test('invalid or unscoped --max-steps is rejected before live authorization or child dispatch',()=>{
  for(const args of [
    ['--live','--case','question','--max-steps','33'],
    ['--live','--max-steps','16']
  ]){
    const result=spawnSync(process.execPath,['scripts/eval-r4-model.mjs',...args],{cwd:process.cwd(),encoding:'utf8',timeout:5000,windowsHide:true});
    assert.equal(result.status,2);
    assert.equal(JSON.parse(result.stdout).status,'not_run');
  }
});
