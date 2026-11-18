// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { afterEach, expect, it, vi } from 'vitest';
import type { GitSnapshot } from '@codryn/shared';
import { GitPanel } from '../src/renderer/components/git-panel.js';
import { R3Client } from '../src/renderer/r3-client.js';

afterEach(cleanup);
it('keeps an editable staged proposal and requires separate explicit confirmation for commit', async () => {
  const snapshotId = 'a'.repeat(64), projectId = '11111111-1111-4111-8111-111111111111';
  const ready: GitSnapshot = { mode:'git',snapshotId,projectPrefix:'',head:'b'.repeat(40),branch:'main',upstream:null,ahead:null,behind:null,
    branches:['main'],items:[{path:'src.ts',side:'staged',status:'M',actionable:true}],limited:false,reason:null,canCommit:true,canSwitch:false };
  const client = new R3Client({ invoke: vi.fn(), onUpdate: () => () => undefined });
  const call = vi.spyOn(client,'call').mockImplementation((async (operation:string) => {
    if(operation==='git.suggestMessage')return {sourceSnapshotId:snapshotId,message:'Návrh'};
    if(operation==='git.diff')return {snapshotId,text:'+ change',truncated:false};
    return ready;
  }) as typeof client.call);
  const show = vi.fn(function (this: HTMLDialogElement) { this.setAttribute('open', ''); });
  const hide = vi.fn(function (this: HTMLDialogElement) { this.removeAttribute('open'); });
  Object.defineProperties(HTMLDialogElement.prototype, {
    showModal: { configurable: true, value: show }, close: { configurable: true, value: hide }
  });
  const mounted = render(<GitPanel client={client} projectId={projectId} busy={false} close={vi.fn()} onChange={vi.fn()} />);
  try {
    fireEvent.click(await screen.findByRole('button',{name:'M · src.ts'}));
    await screen.findByText('+ change');
    fireEvent.click(screen.getByRole('button',{name:'Navrhnout zprávu'}));
    const input = await screen.findByDisplayValue('Návrh');
    fireEvent.change(input,{target:{value:'Upravená zpráva'}});
    fireEvent.click(screen.getByRole('button',{name:'Vytvořit commit'}));
    expect(call.mock.calls.some(([operation])=>operation==='git.commit')).toBe(false);
    fireEvent.click(screen.getByRole('button',{name:'Potvrdit commit'}));
    await waitFor(()=>expect(call).toHaveBeenCalledWith('git.commit',{projectId,snapshotId,message:'Upravená zpráva'}));
  } finally {
    mounted.unmount();
    Reflect.deleteProperty(HTMLDialogElement.prototype,'showModal');
    Reflect.deleteProperty(HTMLDialogElement.prototype,'close');
  }
});
