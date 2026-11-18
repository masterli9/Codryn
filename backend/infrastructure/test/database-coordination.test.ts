import { join,resolve } from 'node:path';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { pathToFileURL } from 'node:url';
import { readdir } from 'node:fs/promises';
import { expect,it } from 'vitest';
import { createR2Project } from '@codryn/test-support';
import { openR0Database } from '../src/persistence/open-database.js';
import { openDesktopDatabase } from '../src/persistence/open-desktop-database.js';
import { migrations } from '../src/persistence/migrations.js';
it('coordinates concurrent old-schema backup and migration on the same canonical database',async()=>{
  const fixture=await createR2Project('non-git'),handles:Awaited<ReturnType<typeof openDesktopDatabase>>[]=[];
  const old=openR0Database(join(fixture.userData,'codryn.sqlite'));
  try{
    old.exec('PRAGMA foreign_keys=OFF');
    for(const migration of migrations.slice(0,-1)){
      old.exec(migration.sql);
      old.prepare('INSERT INTO schema_migrations VALUES(?,?,?,?)').run(migration.version,migration.name,migration.checksum,'2026-11-18T00:00:00.000Z');
    }
  }finally{old.close();}
  try{
    const code=`import {openR0Database} from ${JSON.stringify(pathToFileURL(resolve('backend/infrastructure/src/persistence/open-database.ts')).href)};
      import {runMigrations} from ${JSON.stringify(pathToFileURL(resolve('backend/infrastructure/src/persistence/run-migrations.ts')).href)};
      const db=openR0Database(process.argv[1]);try{runMigrations(db,'2026-11-18T00:00:00.000Z');}finally{db.close();}`;
    const args=['--no-warnings','--experimental-loader',pathToFileURL(resolve('apps/cli/src/typescript-resolution-loader.mjs')).href,
      '--experimental-transform-types','--input-type=module','-e',code,join(fixture.userData,'codryn.sqlite')];
    await Promise.all([promisify(execFile)(process.execPath,args,{cwd:resolve('.'),timeout:15000,windowsHide:true}),
      promisify(execFile)(process.execPath,args,{cwd:resolve('.'),timeout:15000,windowsHide:true})]);
    // Recreate the last old-schema boundary to separately exercise async backup
    // coordination in this process.
    const boundary=openR0Database(join(fixture.userData,'codryn.sqlite'));
    try{
      boundary.exec('DROP TABLE r4_questions');
      boundary.prepare('DELETE FROM schema_migrations WHERE version=?').run(migrations.at(-1)?.version??-1);
    }finally{boundary.close();}
    handles.push(...await Promise.all([openDesktopDatabase(fixture.userData),openDesktopDatabase(join(fixture.userData,'.'))]));
    for(const handle of handles){
      expect(handle.database.prepare('SELECT MAX(version) AS version FROM schema_migrations').get()?.version).toBe(migrations.at(-1)?.version);
      expect(handle.database.prepare('PRAGMA foreign_key_check').all()).toEqual([]);
    }
    expect((await readdir(join(fixture.userData,'backups'))).filter(path=>path.endsWith('.sqlite'))).toHaveLength(1);
  }finally{for(const handle of handles)handle.close();await fixture.close();}
});
