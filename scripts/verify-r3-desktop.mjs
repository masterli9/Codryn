import { verifyBuild } from './r3-build-identity.mjs';
import { runGate } from './r3-run-gate.mjs';
await verifyBuild();await runGate('npm.cmd',['exec','--','vitest','run','--project','desktop-e2e','tests/desktop'],{env:{CODRYN_DESKTOP_E2E:'1'}});
