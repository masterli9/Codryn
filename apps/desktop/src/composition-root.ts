import { RunR0Diagnostics } from '@codryn/core';
import { createR0Infrastructure } from '@codryn/infrastructure';

export interface ApplicationServices {
  readonly runR0Diagnostics: RunR0Diagnostics;
  close(): void;
}

export async function createApplicationServices(
  userDataPath: string,
  fixtureDirectory: string
): Promise<ApplicationServices> {
  const infrastructure = await createR0Infrastructure({ userDataPath, fixtureDirectory });
  return {
    runR0Diagnostics: new RunR0Diagnostics(infrastructure),
    close: () => infrastructure.close()
  };
}
