import { isSafeR4EvalId } from './r4-eval-report.mjs';

export function readR4EvalCase(args) {
  const indices=[];
  for(let index=0;index<args.length;index++)if(args[index]==='--case')indices.push(index);
  if(indices.length===0)return undefined;
  if(indices.length!==1||indices[0]===args.length-1||args[indices[0]+1]?.startsWith('--'))throw new Error('R4_EVAL_CASE_ARGUMENT_INVALID');
  const id=args[indices[0]+1];
  if(!isSafeR4EvalId(id))throw new Error('R4_EVAL_CASE_ID_INVALID');
  return id;
}

export function readR4EvalOptions(args) {
  const caseId=readR4EvalCase(args);
  const indices=[];
  for(let index=0;index<args.length;index++)if(args[index]==='--max-steps')indices.push(index);
  if(indices.length===0)return {caseId,maxStepsOverride:undefined};
  if(indices.length!==1||indices[0]===args.length-1||args[indices[0]+1]?.startsWith('--'))
    throw new Error('R4_EVAL_MAX_STEPS_INVALID');
  if(caseId===undefined)throw new Error('R4_EVAL_MAX_STEPS_REQUIRES_CASE');
  const raw=args[indices[0]+1];
  if(!/^(?:[1-9]|[12]\d|3[0-2])$/u.test(raw))throw new Error('R4_EVAL_MAX_STEPS_INVALID');
  return {caseId,maxStepsOverride:Number(raw)};
}

export function effectiveR4EvalMaxSteps(datasetMaxSteps, override) {
  return override===undefined?datasetMaxSteps:override;
}

export function selectR4EvalCases(cases, caseId) {
  if(caseId===undefined)return cases;
  const selected=cases.find(item=>item.id===caseId);
  if(!selected)throw new Error(`R4_EVAL_CASE_UNKNOWN:${caseId}`);
  return [selected];
}
