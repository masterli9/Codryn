import { useRef, useState } from 'react';
import type { Question, QuestionAnswer } from '@codryn/shared';
export function QuestionCard({question,answer,cancel}:{question:Question;answer:(value:QuestionAnswer,requestId:string)=>Promise<void>;cancel:()=>void}){
  const [choice,setChoice]=useState(''),[text,setText]=useState(''),[pending,setPending]=useState(false),[error,setError]=useState('');
  const submitting=useRef(false),attempt=useRef<{key:string;id:string}|null>(null);
  const send=async(value:QuestionAnswer)=>{
    if(submitting.current)return;
    const key=JSON.stringify(value);
    if(attempt.current?.key!==key)attempt.current={key,id:crypto.randomUUID()};
    submitting.current=true;setPending(true);setError('');
    try{await answer(value,attempt.current.id);}
    catch(error){setError(error instanceof Error?error.message:'Odpověď se nepodařilo potvrdit.');}
    finally{submitting.current=false;setPending(false);}
  };
  return <section className="permission" aria-label="Upřesňující otázka">
    <h2>{question.prompt}</h2><p>{question.reason}</p>
    <form onSubmit={event=>{event.preventDefault();void send(text.trim()?{kind:'text',text:text.trim()}:{kind:'option',optionId:choice});}}>
      <fieldset disabled={pending}><legend>Vyberte možnost nebo napište vlastní odpověď</legend>
        {question.options.map(option=><label key={option.id}><input type="radio" name={question.id} value={option.id} checked={choice===option.id} onChange={()=>{setChoice(option.id);setText('');}}/>{option.label}{option.description&&<span className="meta">{option.description}</span>}</label>)}
        <label>Vlastní odpověď<textarea maxLength={2000} value={text} onChange={event=>{setText(event.target.value);setChoice('');}}/></label>
      </fieldset>
      {error&&<p role="alert">{error}</p>}
      <div className="actions"><button className="primary" disabled={pending||(!choice&&!text.trim())}>Odpovědět</button>
        <button type="button" disabled={pending} onClick={()=>void send({kind:'declined'})}>Nechci odpovědět</button>
        <button type="button" disabled={pending} onClick={cancel}>Zastavit běh</button></div>
    </form>
  </section>;
}
