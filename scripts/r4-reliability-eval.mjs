export const counterPath = 'src/counter.ts';
export const protectedCounterFiles = ['package.json', 'tsconfig.json', 'counter.test.mjs', 'src/Counter.tsx'];
export const priorPreviewLabel = 'build-kedrov-194';
export const currentPreviewLabel = 'build-vesper-872';

export function continuationCounterSource(source, updated = false) {
  return source + `export const previewLabel = '${updated ? currentPreviewLabel : priorPreviewLabel}';\n`
    + `export const stableLabel = '${updated ? 'build-flint-619' : 'build-shale-315'}';\n`;
}

const repairNames = ['increments 1', 'increments 0', 'increments a negative count'];

export function isCompleteRepairTap(stdout) {
  const lines = stdout.split(/\r?\n/u);
  return ['# tests 3', '# pass 3', '# fail 0', '# skipped 0', '# todo 0'].every(line => lines.includes(line))
    && repairNames.every((name, index) => lines.includes(`ok ${index + 1} - ${name}`));
}

export function isExpectedRepairFailure(stdout) {
  const lines = stdout.split(/\r?\n/u);
  const assertionEnd = lines.indexOf('  ...');
  const firstFailure = assertionEnd === -1 ? [] : lines.slice(0, assertionEnd);
  return ['# tests 3', '# pass 0', '# fail 3', '# skipped 0', '# todo 0'].every(line => lines.includes(line))
    && repairNames.every((name, index) => lines.includes(`not ok ${index + 1} - ${name}`))
    && ["  code: 'ERR_ASSERTION'", '  expected: 2', '  actual: 0'].every(line => firstFailure.includes(line));
}

export function readRepairAudit(database, runId) {
  const mutations = database.prepare(`SELECT sequence, json_extract(payload_json,'$.path') AS path FROM events
    WHERE session_id=? AND event_type='change.mutation_applied' ORDER BY sequence`).all(runId);
  const checks = database.prepare(`SELECT json_extract(v.record_json,'$.kind') AS kind,
      json_extract(v.record_json,'$.result') AS outcome,
      p.sequence AS approvedAt, saved.sequence AS recordedAt, json_extract(c.result_json,'$.exitCode') AS exitCode,
      EXISTS (SELECT 1 FROM desktop_verification_coverage coverage, json_each(coverage.covered_paths_json)
        WHERE coverage.record_id=v.id AND coverage.profile_id='r4-ts-v1' AND value=?) AS coversTarget,
      (SELECT group_concat(text, '' ORDER BY sequence) FROM command_outputs WHERE call_id=v.call_id AND stream='stdout') AS stdout
    FROM verification_records v JOIN desktop_command_results c ON c.call_id=v.call_id
    JOIN events p ON p.correlation_id=v.call_id AND p.event_type='permission.claimed'
    JOIN events saved ON saved.event_id=v.id AND saved.event_type='verification.recorded'
    WHERE v.run_id=?`).all(counterPath, runId)
    .map(({ kind, outcome, approvedAt, recordedAt, exitCode, coversTarget, stdout }) => ({
      kind, outcome, approvedAt, recordedAt, exitCode, coversTarget: coversTarget === 1,
      completeOutput: kind !== 'test' || isCompleteRepairTap(stdout ?? ''),
      expectedFailure: kind === 'test' && isExpectedRepairFailure(stdout ?? '')
    }));
  return {
    firstMutationAt: mutations[0]?.sequence ?? null, lastMutationAt: mutations.at(-1)?.sequence ?? null,
    editedOnlyTarget: mutations.every(mutation => mutation.path === counterPath), checks
  };
}

export function evaluateRepair(evidence) {
  const initialFailure = evidence.firstMutationAt !== null && evidence.checks.some(check =>
    check.kind === 'test' && check.approvedAt !== null && check.approvedAt < check.recordedAt &&
    check.recordedAt < evidence.firstMutationAt && check.outcome === 'failed' && check.coversTarget &&
    check.exitCode === 1 && check.expectedFailure);
  const checkedFinalChange = kind => evidence.lastMutationAt !== null && evidence.checks.some(check =>
    check.kind === kind && check.approvedAt !== null && check.approvedAt > evidence.lastMutationAt &&
    check.recordedAt > check.approvedAt && check.outcome === 'passed' && check.exitCode === 0 && check.coversTarget && check.completeOutput);
  const testPassed = checkedFinalChange('test');
  const typecheckPassed = checkedFinalChange('typecheck');
  const success = evidence.taskCompleted && evidence.verificationStatus === 'verified' && initialFailure &&
    testPassed && typecheckPassed && evidence.editedOnlyTarget && evidence.protectedFilesIntact && evidence.targetChanged;
  return { success, initialFailure, testPassed, typecheckPassed, editedOnlyTarget: evidence.editedOnlyTarget,
    protectedFilesIntact: evidence.protectedFilesIntact, targetChanged: evidence.targetChanged };
}

function valueOnly(reply, expected) {
  const text = reply.trim();
  return [expected, `\`${expected}\``, `"${expected}"`, `'${expected}'`].includes(text);
}

export function evaluateContinuation(evidence) {
  const firstValueCorrect = valueOnly(evidence.firstReply, evidence.priorValue);
  const currentValueCorrect = valueOnly(evidence.secondReply, evidence.currentValue);
  const { firstCompleted, secondCompleted, distinctRuns, priorExchange, freshSource, noMutations, protectedFilesIntact } = evidence;
  const success = firstCompleted && secondCompleted && distinctRuns && priorExchange && freshSource && noMutations &&
    protectedFilesIntact && firstValueCorrect && currentValueCorrect;
  return { success, firstCompleted, secondCompleted, distinctRuns, priorExchange, freshSource, noMutations,
    protectedFilesIntact, firstValueCorrect, currentValueCorrect };
}

function toolOutputHasCurrentSource(result, currentHash, declaration) {
  if (!result.ok || typeof result.output !== 'object' || result.output === null) return false;
  const output = result.output;
  return (output.path === counterPath && output.contentHash === currentHash && output.content?.includes(declaration))
    || (Array.isArray(output.matches) && output.matches.some(match => match?.path === counterPath && match.preview?.includes(declaration)))
    || (output.status === 'ok' && output.targetHash === currentHash && Array.isArray(output.items)
      && output.items.some(item => item?.path === counterPath && item.name === 'previewLabel' && item.display?.includes(currentPreviewLabel)));
}

export function readContinuationEvidence(database, chatId, firstRun, secondRun, firstPrompt, requests, currentHash) {
  const lastReply = run => database.prepare(`SELECT text FROM chat_messages WHERE chat_id=? AND request_id=?
    AND role='assistant' AND state='complete' AND step=?`).get(chatId,run.requestId,run.stepCount)?.text ?? '';
  const firstReply = lastReply(firstRun);
  const secondReply = lastReply(secondRun);
  const finalRequest = requests.findLast(request => request.runId === secondRun.runId);
  const priorExchange = finalRequest?.priorConversation?.some((message, index, history) =>
    message.role === 'user' && message.text === firstPrompt && history[index + 1]?.role === 'assistant'
    && valueOnly(history[index + 1].text, priorPreviewLabel)) ?? false;
  const declaration = `previewLabel = '${currentPreviewLabel}'`;
  const freshSource = finalRequest?.context.some(item =>
    item.path === counterPath && item.contentHash === currentHash && item.content.includes(declaration)) ||
    (finalRequest?.previousToolResults.some(result => toolOutputHasCurrentSource(result, currentHash, declaration)) ?? false);
  const noMutations = database.prepare("SELECT 1 FROM events WHERE event_type='change.mutation_applied' LIMIT 1").get() === undefined;
  return { firstReply, secondReply, priorExchange, freshSource, noMutations };
}
