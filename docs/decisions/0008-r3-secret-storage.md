# ADR 0008: protected local OpenAI key

Status: Windows development probe passed on 2026-10-11; packaged synthetic-key evidence passed on 2026-10-31. Author acceptance and current live authentication remain separate.

The Electron main process uses the asynchronous safeStorage API behind the core `SecretProtector` port. The decrypt result object is mapped explicitly to `value` and `shouldReEncrypt`. There is no plaintext fallback. Infrastructure stores a versioned JSON envelope containing provider, logical key version and ciphertext only.

The `secrets` directory has inheritance disabled and a grant only for the current Windows account. Its owner and effective allow rules are independently inspected before writing. Junctions and symbolic links are rejected. Replacement uses a private temporary file, fsync and rename; encryption failure preserves the previous ciphertext. Corruption produces a safe unavailable result.

Evidence: `node scripts/spikes/r3-secret-probe.mjs` ran three actual Electron 43.4.0 processes and returned `encryption=true`, `restartDecrypt=true`, `replacePreserved=true`, `deniedPlaintextFallback=true`, `corruptRejected=true`, `removed=true`, `passed=true`. The isolated profile and captured output were scanned for the synthetic marker. This is OS evidence from the development Electron executable, not packaged acceptance.

The ACL probe initially failed because Windows PowerShell inherited a PowerShell 7 module search path. The adapter now removes case-insensitive duplicates of PSModulePath and supplies the trusted Windows PowerShell module directory. Permission checks remain fail closed.

Protection does not isolate secrets from other programs running as the same Windows user. Deleting the encrypted file is not a promise to erase physical SSD sectors. E2 repeated restart/remove and plaintext scanning in the distribution executable; see the evidence below.

## Packaged evidence, 31 October 2026

The final [step 5 record](../superpowers/plans/2026-10-31-r3-step5-packaged.md) records all eight R3 phases passing: store, reopen, replace, remove, removed, workflow-git, workflow-non-git and cancel. They use the distribution executable and actual Windows protection with a synthetic marker, without a paid API request. Source SHA-256 is `82eebf763379e3d9d094e7f97359968dddc095d308f5c16e563319836238b388`, ASAR `630361f2b1bb19b6757094eb5f2dfde2a2c1b70af56700fcdf7e48c6dc445773`, EXE `6aae3c142a09d1bf0d71307aec50121d9bca412a3c717a3e5513d6b3cf4e1224`.

Local machine evidence is `.r3-artifacts/packaged-FYnII3/r3-report.json`. Every phase has `passed:true` and `noPlaintextPassed:true`. After every packaged process exited, the full profile scan checked 53 files in UTF-8 and UTF-16LE, with no marker and no skipped files; `.r3-artifacts/2026-10-31-step5-packaged-postexit-scan.json` and the final inspection retain this result. The real desktop secrets tests also cover restart, replacement and removal. The [step 4 storage evidence](../superpowers/plans/2026-10-31-r3-step4-storage.md) documents corruption, unavailable protection, fault and race behavior.

This is OS-backed synthetic-key evidence, not current live provider authentication, personal author acceptance, or a claim about an unimplemented cloud layer. Step 5 is an explicit aggregate of successful phases after two failed individual gate invocations; it is not one successful `verify:r3` invocation.
