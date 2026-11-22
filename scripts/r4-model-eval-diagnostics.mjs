import { Buffer } from 'node:buffer';

const FILE_READ_FIELDS = Object.freeze(['path', 'startLine', 'maxLines']);
const fileReadFieldSet = new Set(FILE_READ_FIELDS);
const PATCH_FIELDS = Object.freeze(['path','expectedHash','edits']);
const PATCH_FIELD_SET = new Set(PATCH_FIELDS);
const PATCH_EDIT_FIELDS = Object.freeze(['oldText','newText']);
const patchEditFieldSet = new Set(PATCH_EDIT_FIELDS);
const PRE_SCHEMA_SENSITIVE_ASSIGNMENT = /(?:API[_-]?KEY|TOKEN|SECRET|PASSWORD)\s*[=:]\s*\S+/i;
const MAX_TOOL_INPUT_BYTES = 64 * 1024;

function isRecord(value) {
  return value !== null && typeof value === 'object' && !Array.isArray(value);
}

function safeType(value) {
  if (value === null) return 'null';
  if (Array.isArray(value)) return 'array';
  if (typeof value === 'number') return Number.isInteger(value) ? 'integer' : 'number';
  if (typeof value === 'object') return 'object';
  return typeof value;
}

function classifyIssue(issue, args) {
  const field = issue.path?.[0];
  if (issue.code === 'unrecognized_keys') return 'unknown_field';
  if (!FILE_READ_FIELDS.includes(field)) return 'invalid_arguments';
  if (issue.code === 'custom' && field === 'path') return 'path_invalid';
  if (issue.code === 'too_small') return `${field}_below_minimum`;
  if (issue.code === 'too_big') return `${field}_above_maximum`;
  if (issue.code === 'invalid_type') {
    if (field === 'path') return Object.hasOwn(args, 'path') ? 'path_wrong_type' : 'missing_path';
    if (field === 'startLine' && typeof args.startLine === 'number' && !Number.isInteger(args.startLine)) return 'startLine_not_integer';
    return `${field}_wrong_type`;
  }
  return 'invalid_arguments';
}

/** Returns only allowlisted argument names and types plus bounded validation categories. */
export function diagnoseFileReadArguments(args, schema) {
  if (!isRecord(args)) return { fields: [], unknownFieldCount: 0, reasons: ['arguments_not_object'] };
  const fields = FILE_READ_FIELDS.flatMap(name => Object.hasOwn(args, name)
    ? [{ name, type: safeType(args[name]) }]
    : []);
  const unknownFieldCount = Object.keys(args).filter(name => !fileReadFieldSet.has(name)).length;
  const redactedHistoryMarkerEcho = Object.keys(args).length === 1 && args.historical === true;
  const parsed = schema.safeParse(args);
  const reasons = new Set(redactedHistoryMarkerEcho ? ['redacted_history_marker_echo']
    : parsed.success ? [] : parsed.error.issues.map(issue => classifyIssue(issue, args)));
  if (unknownFieldCount > 0 && !redactedHistoryMarkerEcho) reasons.add('unknown_field');
  return { fields, unknownFieldCount, reasons: [...reasons].sort() };
}

function classifyPatchIssue(issue,args) {
  const field=issue.path?.[0],editIndex=issue.path?.[1],editField=issue.path?.[2];
  if(issue.code==='unrecognized_keys')return 'unknown_field';
  if(field==='edits'&&Number.isInteger(editIndex)&&PATCH_EDIT_FIELDS.includes(editField)){
    const edit=args.edits?.[editIndex];
    if(issue.code==='invalid_type')return isRecord(edit)&&Object.hasOwn(edit,editField)?`${editField}_wrong_type`:`missing_${editField}`;
    if(issue.code==='too_small')return `${editField}_below_minimum`;
    if(issue.code==='custom')return `${editField}_invalid`;
    return 'invalid_edit';
  }
  if(field==='edits'){
    if(issue.code==='invalid_type')return Object.hasOwn(args,'edits')?'edits_wrong_type':'edits_missing';
    if(issue.code==='too_small')return 'edits_below_minimum';
    if(issue.code==='too_big')return 'edits_above_maximum';
    if(issue.code==='custom')return 'edits_total_bytes_exceeded';
  }
  if(field==='path'){
    if(issue.code==='invalid_type')return Object.hasOwn(args,'path')?'path_wrong_type':'path_missing';
    if(issue.code==='too_small')return 'path_below_minimum';
    if(issue.code==='too_big')return 'path_above_maximum';
    if(issue.code==='custom')return 'path_invalid';
  }
  if(field==='expectedHash'){
    if(issue.code==='invalid_type')return Object.hasOwn(args,'expectedHash')?'expectedHash_wrong_type':'expectedHash_missing';
    if(issue.code==='invalid_format')return 'expectedHash_invalid';
  }
  return 'invalid_arguments';
}

/** Returns only allowlisted file.patch argument shapes and bounded schema failure categories. */
export function diagnosePatchInputArguments(args,schema) {
  if(!isRecord(args))return {fields:[],missingFields:[...PATCH_FIELDS],unknownFieldCount:0,editCount:null,editShapes:[],reasons:['arguments_not_object']};
  const fields=PATCH_FIELDS.flatMap(name=>Object.hasOwn(args,name)?[{name,type:safeType(args[name])}]:[]);
  const missingFields=PATCH_FIELDS.filter(name=>!Object.hasOwn(args,name));
  const unknownFieldCount=Object.keys(args).filter(name=>!PATCH_FIELD_SET.has(name)).length;
  const redactedHistoryMarkerEcho=Object.keys(args).length===1&&args.historical===true;
  const parsed=schema.safeParse(args);
  const issues=parsed.success?[]:parsed.error.issues;
  const edits=Array.isArray(args.edits)?args.edits:[];
  const editShapes=edits.slice(0,16).map((edit,index)=>{
    if(!isRecord(edit))return {fields:[],missingFields:[...PATCH_EDIT_FIELDS],unknownFieldCount:0,reasons:['edit_not_object']};
    const editFields=PATCH_EDIT_FIELDS.flatMap(name=>Object.hasOwn(edit,name)?[{name,type:safeType(edit[name])}]:[]);
    const editMissing=PATCH_EDIT_FIELDS.filter(name=>!Object.hasOwn(edit,name));
    const editUnknown=Object.keys(edit).filter(name=>!patchEditFieldSet.has(name)).length;
    const reasons=issues.filter(issue=>issue.path?.[0]==='edits'&&issue.path?.[1]===index)
      .map(issue=>classifyPatchIssue(issue,args));
    if(editUnknown>0)reasons.push('unknown_field');
    for(const name of editMissing)reasons.push(`missing_${name}`);
    return {fields:editFields,missingFields:editMissing,unknownFieldCount:editUnknown,reasons:[...new Set(reasons)].sort()};
  });
  const topIssues=issues.filter(issue=>issue.path?.[0]!=='edits'||issue.path.length<2);
  const reasons=new Set(redactedHistoryMarkerEcho?['redacted_history_marker_echo']:topIssues.map(issue=>classifyPatchIssue(issue,args)));
  if(unknownFieldCount>0&&!redactedHistoryMarkerEcho)reasons.add('unknown_field');
  return {fields,missingFields,unknownFieldCount,editCount:Array.isArray(args.edits)?args.edits.length:null,editShapes,reasons:[...reasons].sort()};
}

/** Mirrors the fixed pre-schema guards without returning serialized input or match details. */
export function diagnosePatchPreSchemaGuards(args) {
  const serialized=JSON.stringify(args);
  const matches=[];
  if(Buffer.byteLength(serialized,'utf8')>MAX_TOOL_INPUT_BYTES)matches.push('over_size_limit');
  if(PRE_SCHEMA_SENSITIVE_ASSIGNMENT.test(serialized))matches.push('sensitive_assignment_pattern');
  return matches;
}

/** Preserves the generic cause when none of the mirrored guards matched. */
export function finalizePatchInputDiagnostic(shape,rejected,preSchemaGuardMatches) {
  return {
    ...shape,
    preSchemaGuardMatches,
    rejected,
    reasons:shape.reasons.length?shape.reasons:rejected?['pre_schema_safety_check']:[]
  };
}

/** Counts only stale statuses and result totals, never serializing tool result content. */
export function summarizeStaleResultsByTurn(requests) {
  return requests.map((request, index) => {
    const results = Array.isArray(request.previousToolResults) ? request.previousToolResults : [];
    const staleResultCount = results.filter(result => isRecord(result?.output) && result.output.status === 'stale').length;
    return { turn: index + 1, previousToolResultCount: results.length, staleResultCount };
  });
}
