import assert from 'node:assert/strict';
import { test } from 'node:test';
import { fileReadInputSchema } from '@codryn/core';
import { patchInputSchema } from '@codryn/shared';
import { diagnoseFileReadArguments, diagnosePatchInputArguments, summarizeStaleResultsByTurn } from './r4-model-eval-diagnostics.mjs';

test('diagnoses file.read shape without serializing argument values or unknown field names', () => {
  const canary = 'SYNTHETIC_PRIVATE_PATH_CANARY';
  const result = diagnoseFileReadArguments({ path: canary, startLine: 1.5, extra_secret_canary: 'hidden' }, fileReadInputSchema);

  assert.deepEqual(result, {
    fields: [{ name: 'path', type: 'string' }, { name: 'startLine', type: 'number' }],
    unknownFieldCount: 1,
    reasons: ['startLine_not_integer', 'unknown_field']
  });
  assert.equal(JSON.stringify(result).includes(canary), false);
  assert.equal(JSON.stringify(result).includes('extra_secret_canary'), false);
});

test('labels only the exact redacted-history placeholder without exposing its field or value', () => {
  const exact = diagnoseFileReadArguments({ historical: true }, fileReadInputSchema);
  assert.deepEqual(exact, {
    fields: [],
    unknownFieldCount: 1,
    reasons: ['redacted_history_marker_echo']
  });
  assert.equal(JSON.stringify(exact).includes('historical'), false);
  assert.equal(JSON.stringify(exact).includes('true'), false);

  for (const nearMiss of [
    { historical: false },
    { historical: true, extra_secret_canary: 'NEAR_MISS_VALUE' }
  ]) {
    const result = diagnoseFileReadArguments(nearMiss, fileReadInputSchema);
    assert.equal(result.reasons.includes('redacted_history_marker_echo'), false);
    assert.equal(JSON.stringify(result).includes('historical'), false);
    assert.equal(JSON.stringify(result).includes('extra_secret_canary'), false);
    assert.equal(JSON.stringify(result).includes('NEAR_MISS_VALUE'), false);
  }
});

test('reports bounded schema failure classes for missing, wrong-type, and out-of-range arguments', () => {
  assert.deepEqual(diagnoseFileReadArguments({ startLine: '2', maxLines: 401 }, fileReadInputSchema).reasons,
    ['maxLines_above_maximum', 'missing_path', 'startLine_wrong_type']);
  assert.deepEqual(diagnoseFileReadArguments({ path: '../outside' }, fileReadInputSchema).reasons, ['path_invalid']);
  assert.deepEqual(diagnoseFileReadArguments(null, fileReadInputSchema).reasons, ['arguments_not_object']);
  assert.deepEqual(diagnoseFileReadArguments({ path: 'src/file.ts', startLine: 2, maxLines: 10 }, fileReadInputSchema).reasons, []);
});

test('counts stale historical results separately for every captured model turn', () => {
  const turns = summarizeStaleResultsByTurn([
    { previousToolResults: [] },
    { previousToolResults: [{ ok: true, output: { status: 'stale' } }, { ok: true, output: { status: 'ok' } }] },
    { previousToolResults: [{ ok: false, error: { code: 'R1_TOOL_INPUT_INVALID' } }, { ok: true, output: { status: 'stale' } }, { ok: true, output: { status: 'stale' } }] }
  ]);

  assert.deepEqual(turns, [
    { turn: 1, previousToolResultCount: 0, staleResultCount: 0 },
    { turn: 2, previousToolResultCount: 2, staleResultCount: 1 },
    { turn: 3, previousToolResultCount: 3, staleResultCount: 2 }
  ]);
});

test('diagnoses valid file.patch schema using only allowlisted names and types',()=>{
  assert.deepEqual(diagnosePatchInputArguments({path:'src/a.ts',expectedHash:'a'.repeat(64),edits:[{oldText:'before',newText:'after'}]},patchInputSchema),{
    fields:[{name:'path',type:'string'},{name:'expectedHash',type:'string'},{name:'edits',type:'array'}],
    missingFields:[],unknownFieldCount:0,editCount:1,
    editShapes:[{fields:[{name:'oldText',type:'string'},{name:'newText',type:'string'}],missingFields:[],unknownFieldCount:0,reasons:[]}],
    reasons:[]
  });
});

test('categorizes invalid file.patch shape without paths, values, hashes, or unknown names',()=>{
  const canary='PATCH_SECRET_CANARY';
  const result=diagnosePatchInputArguments({path:canary,expectedHash:canary,edits:[{oldText:canary,extra_secret_canary:canary}],extra_top_canary:canary},patchInputSchema);
  assert.deepEqual(result,{
    fields:[{name:'path',type:'string'},{name:'expectedHash',type:'string'},{name:'edits',type:'array'}],
    missingFields:[],unknownFieldCount:1,editCount:1,
    editShapes:[{fields:[{name:'oldText',type:'string'}],missingFields:['newText'],unknownFieldCount:1,reasons:['missing_newText','unknown_field']}],
    reasons:['expectedHash_invalid','unknown_field']
  });
  for(const secret of [canary,'extra_secret_canary','extra_top_canary'])assert.equal(JSON.stringify(result).includes(secret),false);
  const wrongPathType=diagnosePatchInputArguments({path:42,expectedHash:'a'.repeat(64),edits:[{oldText:'a',newText:'b'}]},patchInputSchema);
  assert.deepEqual(wrongPathType.reasons,['path_wrong_type']);
});

test('reports missing patch fields, invalid edit types, and a bounded over-16 edit count',()=>{
  const missing=diagnosePatchInputArguments({path:'src/a.ts'},patchInputSchema);
  assert.deepEqual(missing.missingFields,['expectedHash','edits']);
  assert.deepEqual(missing.reasons,['edits_missing','expectedHash_missing']);
  const invalid=diagnosePatchInputArguments({path:'src/a.ts',expectedHash:'a'.repeat(64),edits:[{oldText:'',newText:9}]},patchInputSchema);
  assert.deepEqual(invalid.editShapes[0]?.reasons,['newText_wrong_type','oldText_below_minimum']);
  const excessive=diagnosePatchInputArguments({path:'src/a.ts',expectedHash:'a'.repeat(64),edits:Array.from({length:17},()=>({oldText:'a',newText:'b'}))},patchInputSchema);
  assert.equal(excessive.editCount,17);
  assert.equal(excessive.editShapes.length,16);
  assert.deepEqual(excessive.reasons,['edits_above_maximum']);
});

test('recognizes only the exact redacted-history placeholder for file.patch',()=>{
  const exact=diagnosePatchInputArguments({historical:true},patchInputSchema);
  assert.deepEqual(exact,{
    fields:[],missingFields:['path','expectedHash','edits'],unknownFieldCount:1,editCount:null,editShapes:[],
    reasons:['redacted_history_marker_echo']
  });
  assert.equal(JSON.stringify(exact).includes('historical'),false);
  assert.equal(JSON.stringify(exact).includes('true'),false);
});
