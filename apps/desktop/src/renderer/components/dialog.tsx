import { useEffect,useRef } from 'react';
import type { ReactNode } from 'react';
import { Icon } from './icon.js';
export function Dialog({title,close,children}:{title:string;close:()=>void;children:ReactNode}){
  const ref=useRef<HTMLDialogElement>(null),onClose=useRef(close);onClose.current=close;
  useEffect(()=>{const previous=document.activeElement,dialog=ref.current;dialog?.showModal();return ()=>{dialog?.close();if(previous instanceof HTMLElement&&previous.isConnected)previous.focus();};},[]);
  return <dialog ref={ref} aria-label={title} onCancel={event=>{event.preventDefault();onClose.current();}}><header><h2>{title}</h2><button onClick={close} aria-label="Zavřít dialog"><Icon name="close"/></button></header>{children}</dialog>;
}
