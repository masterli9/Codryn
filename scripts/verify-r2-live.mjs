const args = process.argv.slice(2);
const valueAfter = (flag) => { const index = args.indexOf(flag); return index < 0 ? undefined : args[index + 1]; };
const report = {
  schemaVersion: 1,
  status: 'blocked',
  reason: 'Live verification is opt-in and requires provider, model, positive cost cap and a session-only key.',
  attempts: []
};
if (!args.includes('--live')) { process.stdout.write(`${JSON.stringify(report)}\n`); process.exit(2); }
const provider = valueAfter('--provider');
const model = valueAfter('--model');
const maxCost = Number(valueAfter('--max-cost-usd'));
const key = process.env.R2_PROVIDER_API_KEY;
if (provider === undefined || model === undefined || !Number.isFinite(maxCost) || maxCost <= 0 || typeof key !== 'string' || key.length === 0) {
  process.stdout.write(`${JSON.stringify(report)}\n`);
  process.exit(2);
} else {
  process.stdout.write(`${JSON.stringify({ ...report, status: 'unverified', provider, model, maxCostUsd: maxCost, reason: 'Live transport wiring is available, but no run was authorized by this command.' })}\n`);
  process.exitCode = 3;
}
