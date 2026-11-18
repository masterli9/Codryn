import { ExtensionRegistry } from '@codryn/core';
import { builtinWorkflowSchema } from '@codryn/shared';
import type { BuiltinWorkflow } from '@codryn/shared';

const registry = new ExtensionRegistry();
registry.register({
  id:'planning',kind:'skill',name:'Plán změny',version:'1.0.0',
  description:'Pročte relevantní podklady a navrhne kroky. Používá čtení projektu.',
  capabilities:['planning'],requiredPermissions:['read_project']
});
registry.register({
  id:'verification',kind:'plugin',name:'Ověření změny',version:'1.0.0',
  description:'Vybere dostupné kontroly a vyžádá samostatné povolení jejich spuštění.',
  capabilities:['verification'],requiredPermissions:['read_project','command_project']
});
export const builtinCatalog = () => registry.list();
export function prepareBuiltinWorkflow(raw: BuiltinWorkflow) {
  const selection = builtinWorkflowSchema.parse(raw);
  const [id, version] = selection.split('@');
  const manifest = registry.resolve(id ?? '',version ?? '');
  const instructions = id === 'planning'
    ? 'Read relevant project files and ask for any consequential missing decision with ask_user. Produce a concise step-by-step plan and explicit verification steps. This planning skill has read-only tools.'
    : 'Inspect the recommended checks. Use the existing command.run tool to request separate permission for relevant available typecheck and test candidates. Record actual results, explain unavailable checks and correct failures only through a subsequent explicitly requested change. Do not install dependencies or create a commit. A recommendation or an exit message alone is not verification evidence.';
  return {manifest,instructions,toolIds:id==='planning'?['file.read','text.search','typescript.query']:['file.read','text.search','typescript.query','command.run']};
}
