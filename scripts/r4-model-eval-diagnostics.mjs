const FILE_READ_FIELDS = Object.freeze(['path', 'startLine', 'maxLines']);
const fileReadFieldSet = new Set(FILE_READ_FIELDS);

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

/** Counts only stale statuses and result totals, never serializing tool result content. */
export function summarizeStaleResultsByTurn(requests) {
  return requests.map((request, index) => {
    const results = Array.isArray(request.previousToolResults) ? request.previousToolResults : [];
    const staleResultCount = results.filter(result => isRecord(result?.output) && result.output.status === 'stale').length;
    return { turn: index + 1, previousToolResultCount: results.length, staleResultCount };
  });
}
