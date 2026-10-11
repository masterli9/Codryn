// @vitest-environment jsdom
import { cleanup,fireEvent,render,screen,waitFor } from '@testing-library/react';
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
