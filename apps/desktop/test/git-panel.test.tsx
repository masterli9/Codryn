// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { afterEach, expect, it, vi } from 'vitest';
import type { GitSnapshot } from '@codryn/shared';
import { GitPanel } from '../src/renderer/components/git-panel.js';
import { R3Client } from '../src/renderer/r3-client.js';

afterEach(cleanup);
it('renders all five required Git statuses and opens each item diff from the current snapshot', async () => {
  const snapshotId = 'a'.repeat(64), projectId = '11111111-1111-4111-8111-111111111111';
  const ready: GitSnapshot = { mode:'git',snapshotId,projectPrefix:'',head:'b'.repeat(40),branch:'main',upstream:null,ahead:null,behind:null,
    branches:['main'],items:[
      {path:'changed.ts',side:'staged',status:'M',actionable:false},
      {path:'changed.ts',side:'unstaged',status:'M',actionable:false},
      {path:'deleted.ts',side:'unstaged',status:'D',actionable:false},
      {path:'new.ts',side:'untracked',status:'?',actionable:false},
      {path:'conflict.ts',side:'conflict',status:'U',actionable:false}
    ],limited:false,reason:'Vyřešte konflikty v Gitu.',canCommit:false,canSwitch:false };
  const client = new R3Client({ invoke: vi.fn(), onUpdate: () => () => undefined });
  const call = vi.spyOn(client,'call').mockImplementation((async (operation:string,input:{path?:string;side?:string}) => {
    if(operation==='git.diff')return {snapshotId,text:`DIFF:${input.side}:${input.path}`,truncated:false};
    return ready;
  }) as typeof client.call);
  const show = vi.fn(function (this: HTMLDialogElement) { this.setAttribute('open', ''); });
  const hide = vi.fn(function (this: HTMLDialogElement) { this.removeAttribute('open'); });
  Object.defineProperties(HTMLDialogElement.prototype, {
    showModal: { configurable: true, value: show }, close: { configurable: true, value: hide }
  });
  const mounted = render(<GitPanel client={client} projectId={projectId} busy={false} close={vi.fn()} onChange={vi.fn()} />);
  try {
    const items = [
      { section:'Připravené', label:'M · changed.ts', path:'changed.ts', side:'staged' },
      { section:'Nepřipravené', label:'M · changed.ts', path:'changed.ts', side:'unstaged' },
      { section:'Nepřipravené', label:'D · deleted.ts', path:'deleted.ts', side:'unstaged' },
      { section:'Nové', label:'? · new.ts', path:'new.ts', side:'untracked' },
      { section:'Konflikty', label:'U · conflict.ts', path:'conflict.ts', side:'conflict' }
    ] as const;
    for (const item of items) {
      const heading = await screen.findByRole('heading', { name:item.section });
      const section = heading.parentElement;
      if (!section) throw new Error(`Missing Git section: ${item.section}`);
      fireEvent.click(within(section).getByRole('button', { name:item.label }));
      await waitFor(() => expect(call).toHaveBeenCalledWith('git.diff', {
        projectId, snapshotId, path:item.path, side:item.side
      }));
      await screen.findByText(`DIFF:${item.side}:${item.path}`);
    }
  } finally {
    mounted.unmount();
    Reflect.deleteProperty(HTMLDialogElement.prototype,'showModal');
    Reflect.deleteProperty(HTMLDialogElement.prototype,'close');
  }
});

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
