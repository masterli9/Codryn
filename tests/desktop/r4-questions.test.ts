import { expect,it } from 'vitest';
import { createR2Project } from '@codryn/test-support';
import { createR3Profile,launchR3Desktop } from '../support/src/r3-desktop.js';
it('reattaches the durable question after desktop restart and separately approves the next command',async()=>{
  const fixture=await createR2Project('non-git');
  const profileRoot=await createR3Profile('r4-question');
  const options={executable:process.env.CODRYN_PACKAGED_EXE??'apps/desktop/out/Codryn-win32-x64/Codryn.exe',profileRoot,projectRoot:fixture.root,scenario:'question' as const};
  let desktop=await launchR3Desktop(options);
  try{
    await desktop.window.getByRole('button',{name:'Otevřít projekt',exact:true}).click();
    await desktop.window.getByRole('textbox',{name:'Název chatu'}).fill('Trvalá otázka');
    await desktop.window.getByRole('button',{name:'Uložit chat',exact:true}).click();
    await desktop.window.getByRole('textbox',{name:'Zadání úkolu'}).fill('Upřesni ukládání hodnoty.');
    await desktop.window.getByRole('button',{name:'Odeslat úkol'}).click();
    await desktop.window.getByRole('region',{name:'Upřesňující otázka'}).waitFor();
    await desktop.window.reload();
    await desktop.window.getByRole('button',{name:'Otevřít projekt',exact:true}).click();
    await desktop.window.getByRole('region',{name:'Upřesňující otázka'}).waitFor();
    await desktop.close();
    desktop=await launchR3Desktop(options);
    await desktop.window.getByRole('button',{name:'Otevřít projekt',exact:true}).click();
    const question=desktop.window.getByRole('region',{name:'Upřesňující otázka'});
    await question.getByRole('radio',{name:'Lokálně'}).check();
    await question.getByRole('button',{name:'Odpovědět',exact:true}).click();
    const approval=desktop.window.getByRole('button',{name:'Povolit jednou',exact:true});
    await approval.waitFor();
    expect(await question.count()).toBe(0);
    await approval.click();
    await desktop.window.getByText('Odpověď přijata a samostatně povolená kontrola dokončena.',{exact:true}).waitFor();
  }finally{await desktop.close();await fixture.close();}
},90000);
