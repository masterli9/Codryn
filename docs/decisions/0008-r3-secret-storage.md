# ADR 0008: protected local OpenAI key

Status: Windows development probe passed on 2026-10-11; packaged evidence pending.

The Electron main process uses the asynchronous safeStorage API behind the core `SecretProtector` port. The decrypt result object is mapped explicitly to `value` and `shouldReEncrypt`. There is no plaintext fallback. Infrastructure stores a versioned JSON envelope containing provider, logical key version and ciphertext only.

The `secrets` directory has inheritance disabled and a grant only for the current Windows account. Its owner and effective allow rules are independently inspected before writing. Junctions and symbolic links are rejected. Replacement uses a private temporary file, fsync and rename; encryption failure preserves the previous ciphertext. Corruption produces a safe unavailable result.

Evidence: `node scripts/spikes/r3-secret-probe.mjs` ran three actual Electron 43.4.0 processes and returned `encryption=true`, `restartDecrypt=true`, `replacePreserved=true`, `deniedPlaintextFallback=true`, `corruptRejected=true`, `removed=true`, `passed=true`. The isolated profile and captured output were scanned for the synthetic marker. This is OS evidence from the development Electron executable, not packaged acceptance.

The ACL probe initially failed because Windows PowerShell inherited a PowerShell 7 module search path. The adapter now removes case-insensitive duplicates of PSModulePath and supplies the trusted Windows PowerShell module directory. Permission checks remain fail closed.

Protection does not isolate secrets from other programs running as the same Windows user. Deleting the encrypted file is not a promise to erase physical SSD sectors. E2 must repeat restart/remove and plaintext scanning in the distribution executable.
