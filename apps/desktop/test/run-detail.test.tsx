// @vitest-environment jsdom
import { cleanup,fireEvent,render,screen,act } from '@testing-library/react';
import { afterEach,expect,it,vi } from 'vitest';
import type { R3Snapshot } from '@codryn/shared';
import { R3Client } from '../src/renderer/r3-client.js';
import { RunDetail } from '../src/renderer/components/run-detail.js';
import { activity,snapshot } from './ui-fixtures.js';
afterEach(cleanup);
function setup(read:()=>Promise<unknown>){const client=new R3Client({invoke:vi.fn(),onUpdate:()=>()=>undefined});vi.spyOn(client,'call').mockImplementation(read as typeof client.call);const show=(value:R3Snapshot)=> <RunDetail client={client} snapshot={value} detail={null} busy={false} refresh={async()=>undefined} close={()=>undefined}/>;return {show,client};}
it('retains older activity through refresh, deduplicates overlap and keeps the oldest cursor',async()=>{
  const read=vi.fn(async()=>({items:[activity(1),activity(2)],beforeSequence:null})),{show}=setup(read),value=snapshot();const view=render(show(value));
  fireEvent.click(screen.getByRole('button',{name:'Starší aktivita'}));await screen.findByText('Aktivita 1');
  view.rerender(show({...value,cursor:3,activity:[activity(2),activity(3)],beforeActivitySequence:2}));
  expect(screen.getByText('Aktivita 1')).toBeTruthy();expect(screen.getAllByText('Aktivita 2')).toHaveLength(1);expect(screen.getByText('Aktivita 3')).toBeTruthy();expect(screen.queryByRole('button',{name:'Starší aktivita'})).toBeNull();
});
for(const change of ['run','chat'] as const)it(`ignores a delayed activity page after a ${change} switch`,async()=>{
  let resolve:(value:unknown)=>void=()=>undefined;const {show}=setup(()=>new Promise(done=>{resolve=done;}));const view=render(show(snapshot()));fireEvent.click(screen.getByRole('button',{name:'Starší aktivita'}));
  view.rerender(show(change==='run'?snapshot(1,11):snapshot(2)));await act(async()=>resolve({items:[activity(1)],beforeSequence:null}));expect(screen.queryByText('Aktivita 1')).toBeNull();
});
it('coalesces double pagination clicks',async()=>{const read=vi.fn(()=>new Promise(()=>undefined)),{show}=setup(read);render(show(snapshot()));const button=screen.getByRole('button',{name:'Starší aktivita'});fireEvent.click(button);fireEvent.click(button);expect(read).toHaveBeenCalledTimes(1);});
