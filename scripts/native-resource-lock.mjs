import { DatabaseSync } from 'node:sqlite';
import { basename,dirname,join,resolve } from 'node:path';
import { lstat,mkdir,realpath } from 'node:fs/promises';

/** SQLite holds a native cross-process lock until release or process exit. */
export async function withNativeResourceLock(path, action, timeoutMs=30000) {
  if(!Number.isInteger(timeoutMs)||timeoutMs<1||timeoutMs>60000)throw new Error('R3_RESOURCE_TIMEOUT_INVALID');
  const absolute=resolve(path);
  await mkdir(dirname(absolute),{recursive:true});
  const filename=join(await realpath(dirname(absolute)),basename(absolute));
  const details=await lstat(filename).catch(error=>{if(error.code==='ENOENT')return null;throw error;});
  if(details&&(!details.isFile()||details.isSymbolicLink()))throw new Error('R3_RESOURCE_LOCK_INVALID');
  const database=new DatabaseSync(filename,{allowExtension:false});
  try{
    database.enableDefensive(true);
    try{database.exec(`PRAGMA busy_timeout=${timeoutMs};BEGIN IMMEDIATE;`);}
    catch(error){
      if(error.errcode===5||error.errcode===6)throw new Error('R3_RESOURCE_BUSY');
      throw error;
    }
    return await action();
  }finally{
    if(database.isTransaction)database.exec('ROLLBACK');
    database.close();
  }
}
