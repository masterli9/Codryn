import { createElement } from 'react';
import { createRoot } from 'react-dom/client';
import styles from './styles.css';
import font from './assets/instrument-sans.woff2';
import { Workspace } from './workspace.js';
import { R3Client } from './r3-client.js';
const style=document.createElement('style');style.textContent=styles.replaceAll('__INSTRUMENT_FONT__',font);document.head.append(style);
const root=document.getElementById('root');if(!root)throw new Error('R3_ROOT_MISSING');createRoot(root).render(createElement(Workspace,{client:new R3Client(window.codryn.r3,window.codryn.runR0Diagnostics)}));
