import { useRef,useState } from 'react';
import type { R0DiagnosticReport } from '@codryn/shared';
import type { R3Client } from '../r3-client.js';
import { Dialog } from './dialog.js';
const labels={pass:'Prošlo',fail:'Selhalo',skipped:'Přeskočeno'};
export function Diagnostics({client,close}:{client:R3Client;close:()=>void}){
  const [report,setReport]=useState<R0DiagnosticReport|null>(null),[pending,setPending]=useState(false),[error,setError]=useState<string|null>(null),locked=useRef(false);
  const run=async()=>{if(locked.current)return;locked.current=true;setPending(true);setReport(null);setError(null);try{setReport(await client.runDiagnostics());}catch(error){setError(error instanceof Error?error.message:'Diagnostiku nelze dokončit. Zkuste to znovu.');}finally{locked.current=false;setPending(false);}};
  return <Dialog title="Diagnostika" close={close}><p>Kontrola databáze, procesů a lokálního Git testu R0. Používá připravené diagnostické soubory, bez volání modelu. Během aktivního běhu ji backend odmítne.</p><button className="primary" disabled={pending} onClick={()=>void run()}>{pending?'Probíhá diagnostika…':'Spustit diagnostiku'}</button>{pending&&<p role="status">Kontroluji technické základy aplikace…</p>}{error&&<p role="alert" className="error">{error}</p>}{report&&<section><h3>{report.overallStatus==='passed'?'Diagnostika prošla':'Diagnostika neprošla'}</h3><p className="meta">{report.finishedAt} · {report.durationMs} ms</p>{report.checks.map(check=><article className="diagnostic-check" key={check.checkId}><h4>{check.checkId}</h4><span className="status">{labels[check.status]}</span><p>{check.message}</p><p className="meta">{check.code} · {check.durationMs} ms</p><details><summary>Technické důkazy</summary><pre>{JSON.stringify(check.evidence,null,2)}</pre></details></article>)}</section>}</Dialog>;
}
