// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { afterEach, expect, it, vi } from 'vitest';
import { QuestionCard } from '../src/renderer/components/question-card.js';
afterEach(cleanup);
it('shows the reason and choices and submits a custom answer once without approving tools', async () => {
  let finish:()=>void=()=>undefined;
  const answer=vi.fn(()=>new Promise<void>(resolve=>{finish=resolve;}));
  render(<QuestionCard question={{
    id:'11111111-1111-4111-8111-111111111111',runId:'22222222-2222-4222-8222-222222222222',chatId:'33333333-3333-4333-8333-333333333333',
    prompt:'Kam uložit data?',reason:'Volba mění rozsah.',options:[{id:'local',label:'Lokálně'},{id:'shared',label:'Sdíleně'}],
    status:'waiting',sequence:1,createdAt:'2026-11-18T12:00:00.000Z'
  }} answer={answer} cancel={vi.fn()} />);
  expect(screen.getByText('Volba mění rozsah.')).toBeTruthy();
  expect(screen.getAllByRole('radio')).toHaveLength(2);
  fireEvent.change(screen.getByRole('textbox',{name:'Vlastní odpověď'}),{target:{value:'Použij soubor v projektu.'}});
  const submit=screen.getByRole('button',{name:'Odpovědět'});
  fireEvent.click(submit);fireEvent.click(submit);
  expect(answer).toHaveBeenCalledTimes(1);
  expect(answer).toHaveBeenCalledWith({kind:'text',text:'Použij soubor v projektu.'},expect.any(String));
  finish();
  await waitFor(()=>expect(submit.hasAttribute('disabled')).toBe(false));
  expect(screen.queryByRole('button',{name:'Povolit jednou'})).toBeNull();
});
