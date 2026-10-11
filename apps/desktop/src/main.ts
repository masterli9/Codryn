import { existsSync } from 'node:fs';
import { writeFile } from 'node:fs/promises';
import path from 'node:path';
import { app, BrowserWindow, ipcMain,dialog } from 'electron';
import started from 'electron-squirrel-startup';
import { createApplicationServices,createDesktopApplicationServices, type ApplicationServices } from './composition-root.js';
import { registerR3Handlers } from './ipc/register-r3-handlers.js';
import { CloseController } from './lifecycle/close-controller.js';
import { createR0Handler } from './ipc/r0-handler.js';
import { assertR3Sender } from './ipc/r3-handler.js';
import { R0_DIAGNOSTICS_CHANNEL } from '@codryn/shared';
import { runR0Smoke } from './smoke/run-r0-smoke.js';
import { runR2Smoke } from './smoke/run-r2-smoke.js';
import { runR3Smoke,r3SmokePhases } from './smoke/run-r3-smoke.js';
import type { R3SmokePhase } from './smoke/run-r3-smoke.js';

let mainWindow: BrowserWindow | undefined;
let applicationServices: ApplicationServices | undefined;
let desktopServices:Awaited<ReturnType<typeof createDesktopApplicationServices>>|undefined;
let closeController:CloseController|undefined;
let closing=false;
let disposeR3:(()=>void)|undefined;
let diagnostics:Promise<unknown>|undefined;

export function resolveFixtureDirectory(isPackaged: boolean): string {
  return isPackaged
    ? path.join(process.resourcesPath, 'process')
    : path.resolve(process.cwd(), '../../tests/support/fixtures/process');
}

export function resolveR2FixtureDirectory(isPackaged: boolean): string {
  return isPackaged
    ? path.join(process.resourcesPath, 'r2-project')
    : path.resolve(process.cwd(), '../../tests/support/fixtures/r2-project');
}

function requireFixtures(directory: string): void {
  for (const filename of ['emit-output.ps1', 'exit-nonzero.ps1', 'spawn-child-tree.ps1', 'large-output.ps1']) {
    if (!existsSync(path.join(directory, filename))) throw new Error('R0_FIXTURES_MISSING');
  }
}

function createWindow(): BrowserWindow {
  const window = new BrowserWindow({
    width: 1_366,
    height: 768,
    minWidth: 900,
    minHeight: 640,
    show: false,
    webPreferences: {
      preload: MAIN_WINDOW_PRELOAD_WEBPACK_ENTRY,
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: true
    }
  });

  window.webContents.setWindowOpenHandler(() => ({ action: 'deny' }));
  window.webContents.on('will-attach-webview',event=>event.preventDefault());
  window.webContents.on('will-navigate', (event, navigationUrl) => {
    if (navigationUrl !== new URL(MAIN_WINDOW_WEBPACK_ENTRY).href) {
      event.preventDefault();
    }
  });
  window.once('ready-to-show', () => { window.show(); });
  if(desktopServices){disposeR3?.();disposeR3=registerR3Handlers(window,desktopServices,MAIN_WINDOW_WEBPACK_ENTRY);}
  window.on('close',event=>{if(!closing&&closeController){event.preventDefault();void closeController.requestClose().then(status=>{if(status==='failed')void dialog.showMessageBox(window,{type:'error',message:'Zastavení se nepodařilo potvrdit. Aplikace a databáze zůstávají otevřené. Zkuste zavření znovu.'});});}});
  window.on('closed', () => {
    if (mainWindow === window) {
      mainWindow = undefined;
    }
  });
  void window.loadURL(MAIN_WINDOW_WEBPACK_ENTRY);

  return window;
}

const r0SmokeMode = process.argv.includes('--r0-smoke');
const r2SmokeMode = process.argv.includes('--r2-smoke');
const r3SmokeMode=process.argv.includes('--r3-smoke');
const r3Phase=process.argv.find(value=>value.startsWith('--r3-phase='))?.slice('--r3-phase='.length);
const smokeMode = r0SmokeMode || r2SmokeMode||r3SmokeMode;
const testProfileArgument=process.argv.find(value=>value.startsWith('--r3-test-profile='));
const testProfile=testProfileArgument?.slice('--r3-test-profile='.length);
const testScenario=process.argv.find(value=>value.startsWith('--r3-test-scenario='))?.slice('--r3-test-scenario='.length);
if(testScenario&&(!testProfile||!['stream','two-patches','interrupted-model'].includes(testScenario)))throw new Error('R3_TEST_SCENARIO_INVALID');
if(testProfile){const relative=path.relative(path.resolve(process.cwd(),'.r3-artifacts'),path.resolve(testProfile));if(!path.isAbsolute(testProfile)||relative===''||path.isAbsolute(relative)||relative==='..'||relative.startsWith('..'+path.sep))throw new Error('R3_TEST_PROFILE_INVALID');app.setPath('userData',testProfile);}
if (smokeMode) {
  app.disableHardwareAcceleration();
  app.commandLine.appendSwitch('disable-gpu');
  app.commandLine.appendSwitch('disable-gpu-compositing');
  app.commandLine.appendSwitch('in-process-gpu');
  app.commandLine.appendSwitch('use-gl', 'swiftshader');
  app.commandLine.appendSwitch('disable-gpu-sandbox');
}
const userDataPrefix = r3SmokeMode?'--r3-user-data-dir=':r2SmokeMode ? '--r2-user-data-dir=' : '--r0-user-data-dir=';
const userDataArgument = process.argv.find((argument) => argument.startsWith(userDataPrefix));
const anyUserDataArgument = process.argv.find((argument) => argument.startsWith('--r0-user-data-dir=') || argument.startsWith('--r2-user-data-dir=')||argument.startsWith('--r3-user-data-dir='));
const r2NodeExecutableArgument = process.argv.find((argument) => argument.startsWith('--r2-node-executable='));
const r2NodeExecutable = r2NodeExecutableArgument?.slice('--r2-node-executable='.length);
const smokeUserDataPath = userDataArgument?.slice(userDataPrefix.length);
const smokeArgumentsValid = !smokeMode || (
  smokeUserDataPath !== undefined && path.isAbsolute(smokeUserDataPath) && [r0SmokeMode,r2SmokeMode,r3SmokeMode].filter(Boolean).length===1 && (!r3SmokeMode||(r3Phase!==undefined&&r3SmokePhases.includes(r3Phase as R3SmokePhase)&&path.relative(path.resolve(process.cwd(),'.r3-artifacts'),smokeUserDataPath)!==''&&!path.relative(path.resolve(process.cwd(),'.r3-artifacts'),smokeUserDataPath).startsWith('..')&&!path.isAbsolute(path.relative(path.resolve(process.cwd(),'.r3-artifacts'),smokeUserDataPath)))) &&
  (r2NodeExecutable === undefined || path.isAbsolute(r2NodeExecutable))
);

if (anyUserDataArgument !== undefined && !smokeMode) {
  process.stderr.write('R0 smoke startup failed.\n');
  app.exit(1);
} else if (!smokeArgumentsValid) {
  process.stderr.write('R0 smoke startup failed.\n');
  app.exit(1);
} else if (started) {
  app.quit();
} else {
  if (smokeMode && smokeUserDataPath !== undefined) app.setPath('userData', smokeUserDataPath);
  if(!smokeMode&&!app.requestSingleInstanceLock())app.exit(0);
  app.on('second-instance',()=>{mainWindow?.show();mainWindow?.focus();});

  void app.whenReady().then(async () => {
    try {
      const fixtureDirectory = resolveFixtureDirectory(app.isPackaged);
      if(r3SmokeMode&&smokeUserDataPath&&r3Phase){const report=await runR3Smoke(smokeUserDataPath,resolveR2FixtureDirectory(app.isPackaged),r3Phase as R3SmokePhase);app.exit(report.passed?0:1);return;}
      if (r0SmokeMode) {
        requireFixtures(fixtureDirectory);
        applicationServices = await createApplicationServices(app.getPath('userData'), fixtureDirectory);
      }

      if (r2SmokeMode && smokeUserDataPath !== undefined) {
        const report = await runR2Smoke(app.getPath('userData'), resolveR2FixtureDirectory(app.isPackaged), r2NodeExecutable ?? process.execPath);
        app.exit(report.database === 'pass' && report.guardedWrite === 'pass' && report.processTree === 'pass' && report.returnedToBaseline ? 0 : 1);
        return;
      }

      if (r0SmokeMode) {
        const services = applicationServices;
        if (services === undefined) throw new Error('R0 services were not initialized.');
        try {
          const report = await runR0Smoke(services, app.getPath('userData'));
          app.exit(report.overallStatus === 'passed' ? 0 : 1);
        } finally {
          services.close();
          if (applicationServices === services) applicationServices = undefined;
        }
        return;
      }

      desktopServices=await createDesktopApplicationServices(app.getPath('userData'),testScenario as 'stream'|'two-patches'|'interrupted-model'|undefined);
      const desktop=desktopServices;
      closeController=new CloseController({confirm:async()=>{const active=desktop.resources.database.prepare("SELECT 1 FROM desktop_jobs WHERE state IN ('queued','running','stopping') LIMIT 1").get();if(!active&&!diagnostics)return 'stop';const answer=await dialog.showMessageBox({type:'question',message:'Probíhá běh. Zastavit jej a zavřít Codryn?',buttons:['Zůstat','Zastavit a zavřít'],defaultId:0,cancelId:0});return answer.response===1?'stop':'stay';},shutdown:async signal=>{const result=await desktop.shutdown(signal);while(diagnostics&&!signal.aborted)await new Promise(resolve=>setTimeout(resolve,25));return {stopped:result.stopped&&!diagnostics&&!signal.aborted};},close:()=>{disposeR3?.();desktop.close();desktopServices=undefined;applicationServices?.close();applicationServices=undefined;},finish:()=>{closing=true;app.quit();}});
      mainWindow = createWindow();
      ipcMain.handle(R0_DIAGNOSTICS_CHANNEL,async(event,input:unknown)=>{try{if(!mainWindow)throw new Error('sender');assertR3Sender(event,mainWindow.webContents,MAIN_WINDOW_WEBPACK_ENTRY);if(diagnostics||desktop.resources.database.prepare("SELECT 1 FROM desktop_jobs WHERE state IN ('queued','running','stopping') LIMIT 1").get())throw new Error('busy');const running=(async()=>{applicationServices??=await createApplicationServices(app.getPath('userData'),fixtureDirectory);return createR0Handler(applicationServices.runR0Diagnostics)(event,input);})();diagnostics=running;try{return await running;}finally{diagnostics=undefined;}}catch{return {ok:false,error:{code:'R0_INTERNAL_ERROR',message:'Diagnostika není dostupná během jiného běhu.'}};}});

      app.on('activate', () => {
        if (BrowserWindow.getAllWindows().length === 0) mainWindow = createWindow();
      });
    } catch(error) {
      if(r3SmokeMode&&smokeUserDataPath){const code=error instanceof Error&&/^R3_[A-Z_]+$/.test(error.message)?error.message:error instanceof Error&&/^E[A-Z]+$/.test(String(Reflect.get(error,'code')))?String(Reflect.get(error,'code')):'R3_SMOKE_INTERNAL';await writeFile(path.join(smokeUserDataPath,'r3-failure.json'),JSON.stringify({schemaVersion:1,phase:r3Phase,code,passed:false})).catch(()=>undefined);process.stderr.write(`${code}\n`);}
      if(smokeMode){process.stderr.write('Smoke startup failed.\n');app.exit(1);}
      else {ipcMain.handle('r3:invoke',()=>({ok:false,error:{code:'R3_RECOVERY_REQUIRED',message:'Databázi se nepodařilo bezpečně otevřít nebo obnovit. Data zůstávají zachována.'}}));mainWindow=createWindow();}
    }
  });

  app.on('window-all-closed', () => {
    if (process.platform !== 'darwin') {
      app.quit();
    }
  });
  app.on('before-quit',event=>{if(!closing&&closeController){event.preventDefault();void closeController.requestClose();}});

  app.once('will-quit', () => {
    applicationServices?.close();
    applicationServices = undefined;
  });
}
