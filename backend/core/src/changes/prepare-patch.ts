export function preparePatch(
  text: string,
  edits: readonly { oldText: string; newText: string }[]
): string {
  const ranges = edits.map((edit) => {
    if (!edit.oldText) throw new Error('R2_PATCH_SOURCE_MISSING');
    const start = text.indexOf(edit.oldText);
    if (start < 0) throw new Error('R2_PATCH_SOURCE_MISSING');
    if (text.indexOf(edit.oldText, start + 1) >= 0)
      throw new Error('R2_PATCH_AMBIGUOUS');
    return { start, end: start + edit.oldText.length, replacement: edit.newText };
  }).sort((left, right) => left.start - right.start);

  for (let index = 1; index < ranges.length; index += 1) {
    const previous = ranges[index - 1];
    const current = ranges[index];
    if (previous !== undefined && current !== undefined && current.start < previous.end) {
      throw new Error('R2_PATCH_OVERLAP');
    }
  }

  let output = text;
  for (const range of ranges.reverse()) {
    output = output.slice(0, range.start) + range.replacement + output.slice(range.end);
  }
  if (output === text) throw new Error('R2_PATCH_NO_CHANGE');
  return output;
}
