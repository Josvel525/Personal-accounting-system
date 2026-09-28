import {createRequire} from 'node:module';
import {mkdtemp,rm} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import assert from 'node:assert/strict';
const require=createRequire(import.meta.url);
const {chromium}=require(require.resolve('playwright',{paths:[process.env.CODEX_PRIMARY_RUNTIME_NODE_MODULES || process.cwd()]}));
const base=process.env.TEST_BASE_URL || 'http://127.0.0.1:4173';
const profile=await mkdtemp(join(tmpdir(),'accounting-persistence-'));
let context;
try{
 context=await chromium.launchPersistentContext(profile,{headless:true,viewport:{width:1440,height:1000}});
 let page=await context.newPage();await page.goto(base);
 await page.getByRole('button',{name:'Use on this device',exact:true}).click();
 await page.getByRole('heading',{name:'Dashboard',exact:true}).waitFor();
 await page.getByRole('button',{name:'Create starter accounts',exact:true}).click();
 await page.getByText('0 posted entries',{exact:true}).waitFor();
 await page.getByRole('button',{name:'New journal entry',exact:true}).click();
 await page.getByLabel('Memo',{exact:true}).fill('Saved across browser restart');
 await page.getByLabel('Account 1',{exact:true}).selectOption({label:'1000 · Checking'});
 await page.getByLabel('Debit 1',{exact:true}).fill('123.45');
 await page.getByLabel('Account 2',{exact:true}).selectOption({label:'3000 · Opening equity'});
 await page.getByLabel('Credit 2',{exact:true}).fill('123.45');
 await page.getByRole('button',{name:'Post entry',exact:true}).click();
 await page.getByText('Entry saved.',{exact:true}).waitFor();
 const before=await page.evaluate(async()=>{const db=await import('./db.js');return (await db.exportData(db.LOCAL_UID)).data;});
 await context.close();
 // A new browser process, using the same profile and origin, must reopen saved books.
 context=await chromium.launchPersistentContext(profile,{headless:true});
 page=await context.newPage();await page.goto(base);
 await page.getByText('1 posted entries',{exact:true}).waitFor();
 const after=await page.evaluate(async()=>{const db=await import('./db.js');return (await db.exportData(db.LOCAL_UID)).data;});
 assert.deepEqual(after,before);
 await page.getByRole('button',{name:'Settings',exact:true}).click();
 assert.match(await page.locator('.storageInfo').innerText(),/Local database: available/);
 // A blocked preview must fail visibly rather than opening apparently saveable books.
 const blocked=await chromium.launch({headless:true});
 try{
  const blockedPage=await blocked.newPage();
  await blockedPage.addInitScript(()=>Object.defineProperty(window,'indexedDB',{value:{open(){throw Error('Storage blocked by preview');}}}));
  await blockedPage.goto(base);await blockedPage.getByRole('button',{name:'Use on this device',exact:true}).click();
  await blockedPage.getByText(/Local saving is unavailable in this preview/).waitFor();
  assert.equal(await blockedPage.locator('#authGate').isVisible(),true);
  assert.equal(await blockedPage.locator('#appViews').isVisible(),false);
 }finally{await blocked.close();}
 console.log('PASS: posted accounts and entries survive a full browser restart at the same origin; unavailable storage fails visibly.');
}finally{await context?.close();await rm(profile,{recursive:true,force:true});}
