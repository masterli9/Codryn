// @vitest-environment jsdom
import { act,cleanup,fireEvent,render,screen,waitFor } from '@testing-library/react';
import { afterEach,expect,it,vi } from 'vitest';
import { Composer } from '../src/renderer/components/composer.js';
afterEach(cleanup);
it('keeps the draft on rejected send and preserves IME and Shift+Enter',async()=>{
  const send=vi.fn(async()=>{throw new Error('Projekt je zaneprázdněný.');});render(<Composer chatId="a" busy={false} archived={false} send={send}/>);
  const text=screen.getByRole('textbox',{name:'Zadání úkolu'});fireEvent.change(text,{target:{value:'Oprav součet'}});fireEvent.keyDown(text,{key:'Enter',shiftKey:true});fireEvent.keyDown(text,{key:'Enter',isComposing:true});expect(send).not.toHaveBeenCalled();
  fireEvent.keyDown(text,{key:'Enter'});await waitFor(()=>expect(screen.getByRole('alert').textContent).toContain('zaneprázdněný'));expect((text as HTMLTextAreaElement).value).toBe('Oprav součet');
});
it('keeps per-chat drafts, clears only an accepted task, and reuses request identity on a lost answer',async()=>{
  const send=vi.fn().mockRejectedValueOnce(new Error('Spojení selhalo')).mockResolvedValueOnce(undefined);const view=render(<Composer chatId="a" busy={false} archived={false} send={send}/>);const text=screen.getByRole('textbox',{name:'Zadání úkolu'});
  fireEvent.change(text,{target:{value:'Úkol A'}});fireEvent.click(screen.getByRole('button',{name:'Odeslat úkol'}));await screen.findByRole('alert');fireEvent.click(screen.getByRole('button',{name:'Odeslat úkol'}));await waitFor(()=>expect((text as HTMLTextAreaElement).value).toBe(''));expect(send.mock.calls[0]?.[1]).toBe(send.mock.calls[1]?.[1]);
  fireEvent.change(text,{target:{value:'Nový koncept A'}});view.rerender(<Composer chatId="b" busy={false} archived={false} send={send}/>);expect((text as HTMLTextAreaElement).value).toBe('');fireEvent.change(text,{target:{value:'Koncept B'}});view.rerender(<Composer chatId="a" busy={false} archived={false} send={send}/>);expect((text as HTMLTextAreaElement).value).toBe('Nový koncept A');
});
it('edits a retry without sending, preserves its identity after a lost answer and isolates chat metadata',async()=>{
  const send=vi.fn().mockRejectedValueOnce(new Error('Spojení selhalo')).mockResolvedValue(undefined),retryDraft={chatId:'a',text:'Původní úkol',retryOfRequestId:'original',id:'draft-1'};
  const view=render(<Composer chatId="a" busy={false} archived={false} send={send} retryDraft={retryDraft}/>);const text=screen.getByRole('textbox',{name:'Zadání úkolu'}) as HTMLTextAreaElement;
  expect(text.value).toBe('Původní úkol');expect(send).not.toHaveBeenCalled();fireEvent.change(text,{target:{value:'Upravený úkol'}});fireEvent.click(screen.getByRole('button',{name:'Odeslat úkol'}));await screen.findByRole('alert');
  fireEvent.click(screen.getByRole('button',{name:'Odeslat úkol'}));await waitFor(()=>expect(text.value).toBe(''));expect(send.mock.calls[0]).toEqual(['Upravený úkol',expect.any(String),'original']);expect(send.mock.calls[0]?.[1]).toBe(send.mock.calls[1]?.[1]);expect(send.mock.calls[0]?.[1]).not.toBe('original');
  view.rerender(<Composer chatId="b" busy={false} archived={false} send={send} retryDraft={retryDraft}/>);expect(text.value).toBe('');fireEvent.change(text,{target:{value:'Úkol B'}});fireEvent.click(screen.getByRole('button',{name:'Odeslat úkol'}));await waitFor(()=>expect(send).toHaveBeenCalledTimes(3));expect(send.mock.calls[2]?.[2]).toBeUndefined();
});
it('gives a second explicit retry of the same text a new request identity',async()=>{
  const send=vi.fn().mockRejectedValue(new Error('Ztracená odpověď')),retry={chatId:'a',text:'Úkol',retryOfRequestId:'original',id:'first'};const view=render(<Composer chatId="a" busy={false} archived={false} send={send} retryDraft={retry}/>);
  fireEvent.click(screen.getByRole('button',{name:'Odeslat úkol'}));await screen.findByRole('alert');view.rerender(<Composer chatId="a" busy={false} archived={false} send={send} retryDraft={{...retry,id:'second'}}/>);fireEvent.click(screen.getByRole('button',{name:'Odeslat úkol'}));await waitFor(()=>expect(send).toHaveBeenCalledTimes(2));expect(send.mock.calls[0]?.[1]).not.toBe(send.mock.calls[1]?.[1]);
});
for(const outcome of ['accepted','rejected'] as const)it(`preserves a newer retry draft when an older same-chat submission is ${outcome} later`,async()=>{
  let finish:()=>void=()=>undefined;
  const send=vi.fn().mockImplementationOnce(()=>new Promise<void>((resolve,reject)=>{finish=outcome==='accepted'?resolve:()=>reject(new Error('Starší odeslání selhalo'));})).mockResolvedValue(undefined),retry={chatId:'a',text:'Stejné zadání',retryOfRequestId:'original',id:'first'};
  const view=render(<Composer chatId="a" busy={false} archived={false} send={send} retryDraft={retry}/>);fireEvent.click(screen.getByRole('button',{name:'Odeslat úkol'}));
  view.rerender(<Composer chatId="a" busy={false} archived={false} send={send} retryDraft={{...retry,id:'newer'}}/>);
  await act(async()=>finish());const text=screen.getByRole('textbox',{name:'Zadání úkolu'}) as HTMLTextAreaElement;
  expect(text.value).toBe('Stejné zadání');expect(screen.queryByRole('alert')).toBeNull();expect(send).toHaveBeenCalledTimes(1);
  fireEvent.click(screen.getByRole('button',{name:'Odeslat úkol'}));await waitFor(()=>expect(send).toHaveBeenCalledTimes(2));expect(send.mock.calls[1]).toEqual(['Stejné zadání',expect.any(String),'original']);expect(send.mock.calls[1]?.[1]).not.toBe(send.mock.calls[0]?.[1]);await waitFor(()=>expect(text.value).toBe(''));
});
