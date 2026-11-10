import { createHash } from 'node:crypto';
import { readFile,readdir } from 'node:fs/promises';
import { resolve,join } from 'node:path';
export const executable=resolve('apps/desktop/out/Codryn-win32-x64/Codryn.exe');
export async function fileHash(file){return createHash('sha256').update(await readFile(file)).digest('hex');}
export async function sourceHash(){const hash=createHash('sha256');const walk=async directory=>{for(const entry of (await readdir(directory,{withFileTypes:true})).sort((a,b)=>a.name.localeCompare(b.name))){if(['node_modules','out','.webpack','test'].includes(entry.name))continue;const file=join(directory,entry.name);if(entry.isDirectory())await walk(file);else if(/\.(ts|tsx|css|html|cs|ps1|woff2|json|txt)$/.test(entry.name)){hash.update(file.replaceAll('\\','/'));hash.update(await readFile(file));}}};for(const root of ['apps/desktop','backend','shared'])await walk(root);hash.update(await readFile('package-lock.json'));return hash.digest('hex');}
export async function currentBuild(){return {schemaVersion:1,executable,exeHash:await fileHash(executable),asarHash:await fileHash(join(executable,'..','resources','app.asar')),sourceHash:await sourceHash()};}
export async function verifyBuild(){const actual=await currentBuild(),saved=JSON.parse(await readFile('.r3-artifacts/build.json','utf8'));if(JSON.stringify(actual)!==JSON.stringify(saved))throw new Error('R3_BUILD_STALE');return actual;}
