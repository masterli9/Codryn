import type { R3Project,Uuid } from '@codryn/shared';
import type { ProjectBaseline } from '../changes/project-baseline.js';
import type { IdGenerator } from '../diagnostics/ports.js';
import type { DesktopProjectStore } from './ports.js';
export class R3ProjectService {
  constructor(private readonly dependencies:{store:DesktopProjectStore;ids:IdGenerator;canonicalizeRoot(root:string,signal:AbortSignal):Promise<{root:string;identity:string}>;openWorkspace(identity:string,proposedId:Uuid):Promise<Uuid>;inspectGit(root:string,signal:AbortSignal):Promise<ProjectBaseline>}){}
  async open(root:string,signal:AbortSignal):Promise<R3Project>{const canonical=await this.dependencies.canonicalizeRoot(root,signal);const id=await this.dependencies.openWorkspace(canonical.identity,this.dependencies.ids.next());const name=canonical.root.split(/[\\/]/).filter(Boolean).at(-1)??canonical.root;await this.dependencies.store.remember(id,canonical.root,name);const project=await this.get(id,signal);if(!project)throw new Error('R3_NOT_FOUND');return project;}
  async get(id:Uuid,signal:AbortSignal=new AbortController().signal):Promise<R3Project|null>{
    const project=await this.dependencies.store.get(id);if(!project||!project.available)return project;
    try{const stored=await this.dependencies.store.root(id);const canonical=await this.dependencies.canonicalizeRoot(stored,signal);if(canonical.root.toLowerCase()!==stored.toLowerCase())throw new Error('R3_PROJECT_UNAVAILABLE');const baseline=await this.dependencies.inspectGit(canonical.root,signal);
      return {...project,mode:baseline.mode==='git'?'git':baseline.reason==='git_unavailable'?'git-unavailable':'non-git',limitations:baseline.mode==='git'?[...(baseline.branch===null?[{code:'detached_head' as const,message:'Git je na konkrétním commitu bez větve.'}]:[]),...(baseline.conflicts.length?[{code:'git_conflict' as const,message:'Projekt obsahuje nevyřešené Git konflikty.'}]:[])]:baseline.reason==='git_unavailable'?[{code:'git_unavailable',message:'Git není dostupný; výchozí stav používá lokální návrat.'}]:[]};
    }catch{return {...project,available:false,limitations:[{code:'project_unavailable',message:'Složka projektu není dostupná.'}]};}
  }
  async list():Promise<readonly R3Project[]>{const result:R3Project[]=[];for(const project of await this.dependencies.store.list()){const current=await this.get(project.id);if(current)result.push(current);}return result;}
  async root(id:Uuid):Promise<string>{const project=await this.dependencies.store.get(id);if(!project)throw new Error('R3_NOT_FOUND');if(!project.available)throw new Error('R3_PROJECT_UNAVAILABLE');const stored=await this.dependencies.store.root(id),canonical=await this.dependencies.canonicalizeRoot(stored,AbortSignal.timeout(5000));if(canonical.root.toLowerCase()!==stored.toLowerCase())throw new Error('R3_PROJECT_UNAVAILABLE');return stored;}
}
