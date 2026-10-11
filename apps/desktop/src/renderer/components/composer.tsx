import { useEffect,useRef,useState } from 'react';
import { Icon } from './icon.js';
export function Composer({chatId,busy,archived,send}:{chatId:string;busy:boolean;archived:boolean;send:(text:string,requestId:string)=>Promise<unknown>}){
  const drafts=useRef(new Map<string,string>()),attempts=useRef(new Map<string,{text:string;requestId:string}>()),selected=useRef(chatId);
  const [text,setText]=useState(drafts.current.get(chatId)??''),[error,setError]=useState<string|null>(null),[sending,setSending]=useState(false);
  useEffect(()=>{selected.current=chatId;setText(drafts.current.get(chatId)??'');setError(null);},[chatId]);
  const submit=async()=>{if(sending||busy||archived||!text.trim())return;const owner=chatId,task=text.trim();let attempt=attempts.current.get(owner);if(!attempt||attempt.text!==task){attempt={text:task,requestId:crypto.randomUUID()};attempts.current.set(owner,attempt);}setSending(true);setError(null);
    try{await send(task,attempt.requestId);drafts.current.delete(owner);attempts.current.delete(owner);if(selected.current===owner)setText('');}
    catch(error){if(selected.current===owner)setError(error instanceof Error?error.message:'Odeslání selhalo. Koncept zůstává zachován.');}finally{setSending(false);}
  };
  return <footer className="composer-wrap"><form className="composer" onSubmit={event=>{event.preventDefault();void submit();}}><textarea aria-label="Zadání úkolu" placeholder="Zadejte nový samostatný úkol…" maxLength={16384} value={text} disabled={archived} onChange={event=>{drafts.current.set(chatId,event.target.value);setText(event.target.value);}} onKeyDown={event=>{if(event.key==='Enter'&&!event.shiftKey&&!event.nativeEvent.isComposing){event.preventDefault();void submit();}}}/><div className="composer-footer"><span className="meta">{archived?'Archivovaný chat':busy?'Probíhá běh':'Enter odešle · Shift+Enter nový řádek'}</span><button className="primary" type="submit" disabled={sending||busy||archived||!text.trim()} aria-label="Odeslat úkol"><Icon name="send"/>{sending?'Odesílání…':'Odeslat'}</button></div></form>{error&&<p role="alert" className="error">{error}</p>}<p className="hint">Nový úkol začíná samostatně. Starší zprávy zůstávají v historii.</p></footer>;
}
