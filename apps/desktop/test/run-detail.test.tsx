// @vitest-environment jsdom
import { cleanup,fireEvent,render,screen,act } from '@testing-library/react';
import { afterEach,beforeAll,expect,it,vi } from 'vitest';
import type { R3Snapshot } from '@codryn/shared';
import { R3Client } from '../src/renderer/r3-client.js';
import { RunDetail } from '../src/renderer/components/run-detail.js';
import { activity,snapshot } from './ui-fixtures.js';
afterEach(cleanup);
beforeAll(()=>{HTMLDialogElement.prototype.showModal=function(){this.open=true;};HTMLDialogElement.prototype.close=function(){this.open=false;};});
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
it('reaches all 101 activities by accessible controls and retains the oldest decision after refresh',async()=>{
  const oldest={...activity(1),summary:'Nejstarší rozhodnutí',details:[{label:'Důvod',value:'Výslovně zamítnuto uživatelem'}]},read=vi.fn(async()=>({items:[oldest,...Array.from({length:50},(_,n)=>activity(n+2))],beforeSequence:null})),{show}=setup(read),value={...snapshot(),activity:Array.from({length:50},(_,n)=>activity(n+52)),beforeActivitySequence:52};
  const view=render(show(value));const next=screen.getByRole('button',{name:'Starší aktivita'});next.focus();expect(document.activeElement).toBe(next);fireEvent.click(next);await screen.findByText('Nejstarší rozhodnutí');
  const decision=screen.getByText('Nejstarší rozhodnutí');expect(decision.tagName).toBe('SUMMARY');(decision as HTMLElement).focus();expect(document.activeElement).toBe(decision);decision.closest('details')?.setAttribute('open','');expect(screen.getByText('Důvod: Výslovně zamítnuto uživatelem')).toBeTruthy();expect(view.container.querySelectorAll('summary')).toHaveLength(101);
  view.rerender(show({...value,cursor:1000,activity:Array.from({length:50},(_,n)=>activity(n+53)),beforeActivitySequence:53}));expect(screen.getByText('Nejstarší rozhodnutí')).toBeTruthy();expect(view.container.querySelectorAll('summary')).toHaveLength(102);expect(screen.queryByRole('button',{name:'Starší aktivita'})).toBeNull();
  view.rerender(show(snapshot(2)));expect(screen.queryByText('Nejstarší rozhodnutí')).toBeNull();expect(screen.queryByText('Aktivita 102')).toBeNull();
});
it('renders model and command HTML as inert text and exposes both truncation notices',async()=>{
  const html='<script>globalThis.codrynInjected=1</script><img src=x onerror="globalThis.codrynInjected=2"><a href="javascript:alert(1)">odkaz</a>',{show}=setup(async()=>({callId:'call',chunks:[{sequence:1,stream:'stdout',text:html}],afterSequence:null,truncated:true})),value=snapshot();
  value.commands=[{callId:'call',executable:'node',args:['fixture'],cwd:'fixture',status:'succeeded',exitCode:0,durationMs:20,treeStopped:true,stdoutTail:html,stderrTail:html,truncated:true,outputAvailable:true}];value.activity=[{...activity(1),summary:html,details:[{label:'HTML',value:html}],detailsTruncated:true}];
  const view=render(show(value));expect(screen.getByText('Výstup je zkrácený.')).toBeTruthy();expect(screen.getByText('Podrobnosti byly zkráceny.')).toBeTruthy();fireEvent.click(screen.getByRole('button',{name:'Zobrazit výstup'}));await screen.findByText('Výstup byl zkrácen na uložený limit.');expect(view.container.querySelectorAll('script,img,a,iframe')).toHaveLength(0);expect(view.container.textContent).toContain(html);expect(Reflect.get(globalThis,'codrynInjected')).toBeUndefined();
});
