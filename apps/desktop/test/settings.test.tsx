// @vitest-environment jsdom
import { cleanup,fireEvent,render,screen } from '@testing-library/react';
import { afterEach,beforeAll,expect,it,vi } from 'vitest';
import { R3Client } from '../src/renderer/r3-client.js';
import { Settings } from '../src/renderer/components/settings.js';
import { provider } from './ui-fixtures.js';
beforeAll(()=>{HTMLDialogElement.prototype.showModal=function(){this.open=true;};HTMLDialogElement.prototype.close=function(){this.open=false;};});afterEach(cleanup);
it('offers a direct return to the active run after backend rejects busy provider settings',async()=>{
  const client=new R3Client({invoke:vi.fn(),onUpdate:()=>()=>undefined});vi.spyOn(client,'call').mockResolvedValueOnce(provider).mockRejectedValueOnce(new Error('R3_PROJECT_BUSY: Probíhá běh.'));const returnToRun=vi.fn();render(<Settings client={client} close={()=>undefined} changed={()=>undefined} returnToRun={returnToRun}/>);
  fireEvent.click(await screen.findByRole('button',{name:'Odstranit klíč'}));fireEvent.click(await screen.findByRole('button',{name:'Přejít k aktivnímu běhu'}));expect(returnToRun).toHaveBeenCalledTimes(1);
});
