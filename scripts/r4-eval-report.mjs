import { z } from 'zod';
export function isSafeR4EvalId(value) { return typeof value === 'string' && /^[a-z0-9]+(?:-[a-z0-9]+)*$/u.test(value); }
const count = z.number().int().nonnegative();
const metric = z.number().nonnegative().nullable();
export const r4EvalReportSchema = z.object({
  schemaVersion:z.literal(1),series:z.enum(['offline','live']),model:z.string().min(1),createdAt:z.iso.datetime(),
  datasetHash:z.string().regex(/^[a-f0-9]{64}$/u),sourceHash:z.string().regex(/^[a-f0-9]{64}$/u),
  evalIdentity:z.object({runnerSha256:z.string().regex(/^[a-f0-9]{64}$/u),fixtureBuilderSha256:z.string().regex(/^[a-f0-9]{64}$/u),counterOracleSha256:z.string().regex(/^[a-f0-9]{64}$/u),
    budgetSha256:z.string().regex(/^[a-f0-9]{64}$/u),safeOutputSha256:z.string().regex(/^[a-f0-9]{64}$/u),reportSchemaSha256:z.string().regex(/^[a-f0-9]{64}$/u),
    r4ModelEvalDiagnosticsSha256:z.string().regex(/^[a-f0-9]{64}$/u).optional(),
    selectionSha256:z.string().regex(/^[a-f0-9]{64}$/u).optional(),wrapperSha256:z.string().regex(/^[a-f0-9]{64}$/u).optional()}).strict().optional(),
  paidRequests:count,reservedUsd:z.number().nonnegative(),approvedBudgetUsd:metric,pricingSource:z.string().nullable(),
  pricing:z.object({inputUsdPerMillion:z.number().positive(),outputUsdPerMillion:z.number().positive(),maxRequests:count,maxOutputTokens:count}).strict().nullable().optional(),
  passed:count,total:count,
  selection:z.discriminatedUnion('kind',[
    z.object({kind:z.literal('full')}).strict(),
    z.object({kind:z.literal('case'),id:z.string().refine(isSafeR4EvalId)}).strict()
  ]).optional(),
  results:z.array(z.object({
    id:z.string().min(1),success:z.boolean(),taskCompleted:z.boolean(),recovery:z.boolean(),
    failureOwner:z.enum(['model','harness','provider','budget']).nullable(),reason:z.string().nullable(),
    toolCalls:count,validArguments:count,latencyMs:count,requests:count,
    inputTokens:count.nullable(),outputTokens:count.nullable(),reasoningTokens:count.nullable(),estimatedCostUsd:metric
  }).strict())
}).strict().superRefine((report,context)=>{
  const full=report.selection===undefined||report.selection.kind==='full';
  const valid=report.passed===report.results.filter(item=>item.success).length
    && report.total===report.results.length
    && (full?(report.total===9&&new Set(report.results.map(item=>item.id)).size===9)
      :(report.total===1&&report.results[0]?.id===report.selection.id))
    && report.paidRequests===report.results.reduce((count,item)=>count+item.requests,0)
    && report.results.every(item=>item.validArguments<=item.toolCalls && item.success===(item.failureOwner===null&&item.reason===null)
      && (item.reasoningTokens===null||item.outputTokens!==null))
    && (report.series!=='offline'||(report.paidRequests===0&&report.results.every(item=>item.inputTokens===null&&item.outputTokens===null&&item.reasoningTokens===null&&item.estimatedCostUsd===null)))
    && (report.series!=='live'||(report.approvedBudgetUsd!==null&&report.reservedUsd<=report.approvedBudgetUsd));
  if(!valid)context.addIssue({code:'custom',message:'Inconsistent R4 evaluation metrics.'});
});
