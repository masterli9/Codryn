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

export function selectR4EvalCases(cases, caseId) {
  if(caseId===undefined)return cases;
  const selected=cases.find(item=>item.id===caseId);
  if(!selected)throw new Error(`R4_EVAL_CASE_UNKNOWN:${caseId}`);
  return [selected];
}
