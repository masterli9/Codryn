import { extensionManifestSchema } from '@codryn/shared';
import type { ExtensionManifest } from '@codryn/shared';

/** Declarative metadata registry. Manifests carry no executable entry point. */
export class ExtensionRegistry {
  private readonly manifests = new Map<string, ExtensionManifest>();
  register(raw: ExtensionManifest): void {
    const manifest = extensionManifestSchema.parse(raw);
    const key = `${manifest.id}@${manifest.version}`;
    if (this.manifests.has(key)) throw new Error('R4_EXTENSION_DUPLICATE');
    this.manifests.set(key, manifest);
  }
  list(): ExtensionManifest[] {
    return [...this.manifests.values()].map(value => extensionManifestSchema.parse(value));
  }
  resolve(id: string, version: string): ExtensionManifest {
    const value = this.manifests.get(`${id}@${version}`);
    if (!value) throw new Error('R3_INPUT_INVALID');
    return extensionManifestSchema.parse(value);
  }
}
