const { app, safeStorage } = require('electron');
const { readFile, writeFile } = require('node:fs/promises');
const { join } = require('node:path');
const { ElectronSecretProtector } = require('../../apps/desktop/src/secrets/electron-secret-protector.ts');
const { EncryptedSecretStore } = require('../../backend/infrastructure/src/secrets/encrypted-secret-store.ts');
app.disableHardwareAcceleration();
app.setPath('userData', process.env.CODRYN_SECRET_PROBE_ROOT);
const marker = ['codryn', 'synthetic', 'secret', 'probe', '2026'].join('-');
app.whenReady().then(async () => {
  const protector = new ElectronSecretProtector(safeStorage);
  const store = new EncryptedSecretStore(app.getPath('userData'), protector);
  const file = join(app.getPath('userData'), 'secrets', 'openai.json');
  const phase = process.env.CODRYN_SECRET_PROBE_PHASE;
  if (process.platform !== 'win32' || !(await protector.available())) throw new Error('R3_SECRET_UNAVAILABLE');
  if (phase === 'store') {
    await store.save('openai', marker);
    const before = await readFile(file);
    const failing = new EncryptedSecretStore(app.getPath('userData'), { available: async () => true, encrypt: async () => { throw new Error('synthetic failure'); }, decrypt: (bytes) => protector.decrypt(bytes) });
    let rejected = false;
    try { await failing.save('openai', 'replacement'); } catch { rejected = true; }
    const replacePreserved = rejected && before.equals(await readFile(file)) && await store.read('openai') === marker;
    const unavailable = new EncryptedSecretStore(app.getPath('userData'), { available: async () => false, encrypt: async () => { throw new Error('unavailable'); }, decrypt: async () => { throw new Error('unavailable'); } });
    let deniedPlaintextFallback = false;
    try { await unavailable.save('openai', marker); } catch { deniedPlaintextFallback = before.equals(await readFile(file)); }
    process.stdout.write(JSON.stringify({ phase, encryption: true, replacePreserved, deniedPlaintextFallback }));
  } else if (phase === 'reopen') {
    const restartDecrypt = await store.read('openai') === marker;
    const ciphertext = await readFile(file);
    await writeFile(file, JSON.stringify({ version: 1, provider: 'openai', keyVersion: 1, ciphertext: Buffer.from([0, 1, 2]).toString('base64') }));
    const corruptRejected = await store.state('openai') === 'unavailable';
    await writeFile(file, ciphertext);
    process.stdout.write(JSON.stringify({ phase, restartDecrypt, corruptRejected }));
  } else if (phase === 'remove') {
    await store.remove('openai');
    process.stdout.write(JSON.stringify({ phase, removed: await store.state('openai') === 'missing' }));
  } else throw new Error('R3_INPUT_INVALID');
  app.exit(0);
}).catch(() => { process.stderr.write('R3_SECRET_PROBE_FAILED\n'); app.exit(1); });
