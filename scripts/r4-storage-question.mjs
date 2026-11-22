import { lstat, readFile, realpath } from 'node:fs/promises';
import { join } from 'node:path';

export const storagePath = 'src/counter-storage.ts';
export const protectedStorageFiles = ['package.json', 'tsconfig.json', 'counter.test.mjs', 'src/counter.ts', 'src/Counter.tsx'];

const local = /\b(?:local|browser|this device|this computer|client[- ]side)|lokál|lokal|místn|mistn|prohlížeč|prohlizec|(?:tomto|jednom|stejném) (?:zařízení|počítači)/iu;
const shared = /\b(?:shar|sync|cloud|server|across devices|between devices|cross-device)|sdíl|sdil|synchron|účet|účtu|ucet|mezi (?:zařízeními|zarizenimi|počítači|pocitaci|prohlížeči|prohlizeci)/iu;
const negatedSharing = /(?:bez|vypnut\p{L}*|zakázan\p{L}*|without|no|not|disable\p{L}*)\s+(?:sdílen\p{L}*|sdilen\p{L}*|synchroniz\p{L}*|shar\p{L}*|sync\p{L}*)|ne(?:sdílen|sdilen|synchroniz)\p{L}*/giu;

function hasScopeAlternatives(alternatives) {
  const positiveSharing = alternatives.map(value => shared.test(value.replace(negatedSharing, '')));
  return positiveSharing.includes(true) && alternatives.some((value, index) => local.test(value) && !positiveSharing[index]);
}

export function isStorageScopeQuestion(question) {
  const options = question.options.map(option => [option.label, option.description].join(' '));
  return hasScopeAlternatives(options) || hasScopeAlternatives(question.prompt.split(/\s+(?:nebo|či|versus|vs\.?|or|\/)\s+/iu));
}

const storageTestNames = [
  'increments',
  'an empty store has the default count',
  'a new reader can load a previously stored count',
  'saving replaces the count and keeps different stores independent'
];

export function isCompleteStorageTap(stdout) {
  const lines = stdout.split(/\r?\n/u);
  return ['# tests 4', '# pass 4', '# fail 0', '# skipped 0', '# todo 0'].every(line => lines.includes(line))
    && storageTestNames.every(name => lines.some(line => /^ok \d+ - /u.test(line) && line.replace(/^ok \d+ - /u, '') === name));
}

export async function storageFilesMatch(root, protectedFiles) {
  for (const [path, original] of protectedFiles) {
    const absolute = join(root, path);
    try {
      if (!(await lstat(absolute)).isFile() || await realpath(absolute) !== absolute ||
          !(await readFile(absolute)).equals(original)) return false;
    } catch (error) {
      if (error?.code === 'ENOENT') return false;
      throw error;
    }
  }
  return true;
}

export function readStorageQuestionAudit(database, runId, questionId, answer, requests) {
  const question = database.prepare(`SELECT answer_json,
      json_extract(checkpoint_json,'$.history[#-1].calls[0].callId') AS call_id FROM r4_questions
    WHERE id=? AND run_id=? AND status='answered' AND resume_state='claimed'`).get(questionId, runId);
  const expectedAnswer = JSON.stringify({kind:'text',text:answer});
  const answerWasClaimed = question?.answer_json === expectedAnswer && typeof question.call_id==='string';
  const getQuestionSequence = kind => answerWasClaimed ? database.prepare(`SELECT sequence FROM events
    WHERE session_id=? AND event_type=? AND json_extract(payload_json,'$.questionId')=?`)
    .get(runId,kind,questionId)?.sequence ?? null : null;
  const mutations = database.prepare(`SELECT sequence,json_extract(payload_json,'$.path') AS path FROM events
    WHERE session_id=? AND event_type='change.mutation_applied' ORDER BY sequence`).all(runId);
  const checks = database.prepare(`SELECT json_extract(v.record_json,'$.kind') AS kind, p.sequence AS approvedAt,
      json_extract(c.result_json,'$.exitCode') AS exitCode,
      (SELECT group_concat(text, '' ORDER BY sequence) FROM command_outputs WHERE call_id=v.call_id AND stream='stdout') AS stdout
    FROM verification_records v JOIN desktop_command_results c ON c.call_id=v.call_id
    JOIN events p ON p.correlation_id=v.call_id AND p.event_type='permission.claimed'
    JOIN desktop_verification_coverage coverage ON coverage.record_id=v.id AND coverage.profile_id='r4-ts-v1'
    WHERE v.run_id=? AND json_extract(v.record_json,'$.result')='passed'
      AND EXISTS (SELECT 1 FROM json_each(coverage.covered_paths_json) WHERE value=?)`).all(runId,storagePath)
    .map(({kind,approvedAt,exitCode,stdout}) => ({kind,approvedAt,exitCode,
      completeOutput:kind!=='test'||isCompleteStorageTap(stdout??'')}));
  return {
    answerDelivered:answerWasClaimed && requests.some(request => request.previousToolResults.some(result =>
      result.callId===question.call_id && result.ok && JSON.stringify(result.output)===expectedAnswer)),
    answeredAt:getQuestionSequence('question.answered'), resumedAt:getQuestionSequence('question.resumed'),
    firstMutationAt:mutations[0]?.sequence ?? null, lastMutationAt:mutations.at(-1)?.sequence ?? null,
    editedOnlyStorage:mutations.every(mutation => mutation.path === storagePath), checks
  };
}

/** Evidence contains backend sequence numbers and check outcomes, with no tool arguments or source. */
export function evaluateStorageQuestion(evidence) {
  const resumedFromScopeAnswer = evidence.questionTotal > 0 && evidence.scopeQuestion && evidence.answerDelivered &&
    evidence.answeredAt !== null && evidence.resumedAt !== null && evidence.answeredAt < evidence.resumedAt;
  const changedAfterAnswer = resumedFromScopeAnswer && evidence.firstMutationAt !== null &&
    evidence.resumedAt < evidence.firstMutationAt;
  const checkedFinalChange = kind => evidence.lastMutationAt !== null &&
    evidence.checks.some(check => check.kind === kind && check.approvedAt !== null &&
      check.approvedAt > evidence.lastMutationAt && check.exitCode === 0 && check.completeOutput);
  const testPassed = checkedFinalChange('test');
  const typecheckPassed = checkedFinalChange('typecheck');
  const success = evidence.taskCompleted && evidence.verificationStatus === 'verified' &&
    changedAfterAnswer && evidence.editedOnlyStorage && evidence.protectedFilesIntact &&
    evidence.storageChanged && testPassed && typecheckPassed;
  return {
    success, resumedFromScopeAnswer, changedAfterAnswer, testPassed, typecheckPassed, answerDelivered:evidence.answerDelivered,
    editedOnlyStorage:evidence.editedOnlyStorage, protectedFilesIntact:evidence.protectedFilesIntact,
    storageChanged:evidence.storageChanged
  };
}
