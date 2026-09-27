import {createRequire} from 'node:module';
import assert from 'node:assert/strict';
const require=createRequire(import.meta.url);
const {chromium}=require(require.resolve('playwright',{paths:[process.env.CODEX_PRIMARY_RUNTIME_NODE_MODULES || process.cwd()]}));
const browser=await chromium.launch({headless:true});
const context=await browser.newContext({viewport:{width:390,height:844},acceptDownloads:true});
const page=await context.newPage(),errors=[];page.on('pageerror',e=>errors.push(e.message));
page.on('dialog',d=>d.accept());
const base=process.env.TEST_BASE_URL || 'http://127.0.0.1:4173';
const nav=async(name)=>{
 const button=page.getByRole('button',{name,exact:true});
 if(['Dashboard','Journal Entry','General Ledger','Trial Balance','Balance Sheet','Income Statement','Chart of Accounts'].includes(name))await page.locator('#btnMenu').click();
 await button.click();
};
try{
 await page.goto(base);await nav('Use on this device');await page.getByRole('heading',{name:'Dashboard',exact:true}).waitFor();
 await nav('Create starter accounts');await page.getByText('0 posted entries',{exact:true}).waitFor();
 await nav('Chart of Accounts');await page.getByText('Checking',{exact:true}).waitFor();
 // Custom account and escaped user-provided text.
 await page.getByLabel('Code',{exact:true}).fill('5400');await page.getByLabel('Name',{exact:true}).fill('<img src=x onerror=alert(1)>');
 await page.getByLabel('Type',{exact:true}).selectOption('Expense');await nav('Save account');
 await page.getByText('<img src=x onerror=alert(1)>',{exact:true}).waitFor();assert.equal(await page.locator('#routeHost img').count(),0);
 async function entry(date,memo,debitAccount,creditAccount,amount){
  await nav('Journal Entry');await page.getByLabel('Date',{exact:true}).fill(date);await page.getByLabel('Memo',{exact:true}).fill(memo);
  await page.getByLabel('Account 1',{exact:true}).selectOption({label:debitAccount});await page.getByLabel('Debit 1',{exact:true}).fill(amount);
  await page.getByLabel('Account 2',{exact:true}).selectOption({label:creditAccount});await page.getByLabel('Credit 2',{exact:true}).fill(amount);
  await nav('Post entry');await page.getByText('Entry saved.',{exact:true}).waitFor();
 }
 await entry('2026-01-01','Opening balance','1000 · Checking','3000 · Opening equity','1000.00');
 await entry('2026-02-01','Earnings','1000 · Checking','4000 · Income','250.30');
 await entry('2026-02-02','Food','5100 · Groceries','1000 · Checking','50.10');
 await nav('Dashboard');await page.getByText('3 posted entries',{exact:true}).waitFor();
 assert.match(await page.locator('.stats').innerText(),/1,200.20/);
 await nav('Trial Balance');await page.getByText('Debits equal credits',{exact:true}).waitFor();
 await nav('Balance Sheet');await page.getByText('Balance sheet balances',{exact:true}).waitFor();assert.match(await page.locator('#routeHost').innerText(),/200.20/);
 await nav('Income Statement');await page.getByLabel('From',{exact:true}).fill('2026-02-02');await page.getByLabel('Through',{exact:true}).fill('2026-02-02');await nav('Apply');assert.match(await page.locator('.bigNumber').innerText(),/-\$50.10/);
 await nav('General Ledger');await page.getByLabel('Account',{exact:true}).selectOption({label:'1000 · Checking'});await page.getByLabel('From',{exact:true}).fill('2026-02-02');await page.getByLabel('Through',{exact:true}).fill('2026-02-02');await nav('Apply');
 assert.match(await page.locator('#routeHost').innerText(),/1,250.30/);assert.match(await page.locator('#routeHost').innerText(),/1,200.20/);
 await nav('Chart of Accounts');const cashRow=page.getByRole('row').filter({has:page.getByText('Checking',{exact:true})});
 await cashRow.getByRole('button',{name:'Delete',exact:true}).click();await page.getByText('This account has posted entries. Disable it to preserve its history.',{exact:true}).waitFor();
 await cashRow.getByRole('button',{name:'Disable',exact:true}).click();await nav('Trial Balance');await page.getByText('Debits equal credits',{exact:true}).waitFor();
 // Backup contains durable records, and refresh/offline launch preserve them.
 await nav('Settings');const downloadPromise=page.waitForEvent('download');await nav('Export backup');const download=await downloadPromise;const backupPath=await download.path();
 const fs=await import('node:fs/promises');const backup=JSON.parse(await fs.readFile(backupPath,'utf8'));assert.equal(backup.data.journalHeaders.length,3);
 await page.locator('#modalClose').click();await page.reload();await page.getByText('3 posted entries',{exact:true}).waitFor();
 await page.evaluate(()=>navigator.serviceWorker.ready);await context.setOffline(true);await page.reload();await page.getByText('3 posted entries',{exact:true}).waitFor();await nav('Balance Sheet');await page.getByText('Balance sheet balances',{exact:true}).waitFor();
 assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth>innerWidth),false);
 assert.equal(await page.locator('#navigationPanel').isVisible(),false);
 await page.locator('#btnMenu').click();assert.equal(await page.locator('#navigationPanel').isVisible(),true);
 await page.screenshot({path:'/tmp/personal-accounting-mobile.png',fullPage:true});
 await page.keyboard.press('Escape');assert.equal(await page.locator('#navigationPanel').isVisible(),false);
 await context.setOffline(false);await page.setViewportSize({width:1440,height:1000});await nav('Dashboard');assert.equal(await page.evaluate(()=>getComputedStyle(document.body).backgroundColor),'rgb(255, 255, 255)');
 await page.locator('#btnMenu').click();
 await page.screenshot({path:'/tmp/personal-accounting-desktop.png',fullPage:true});
 await page.locator('#routeHost h2').click();assert.equal(await page.locator('#navigationPanel').isVisible(),false);
 // Restore into an independent empty browser, not over existing books.
 const restoreContext=await browser.newContext();const restorePage=await restoreContext.newPage();await restorePage.goto(base);await restorePage.getByRole('button',{name:'Use on this device',exact:true}).click();
 await restorePage.getByRole('heading',{name:'Dashboard',exact:true}).waitFor();await restorePage.getByRole('button',{name:'Settings',exact:true}).click();
 await restorePage.locator('input[type=file]').setInputFiles({name:'backup.json',mimeType:'application/json',buffer:Buffer.from(JSON.stringify(backup))});await restorePage.getByText('3 posted entries',{exact:true}).waitFor();await restoreContext.close();
 assert.deepEqual(errors,[]);console.log('PASS: mobile navigation, accounts, HTML escaping, journal posting, reports, dated ledger, deletion guard, disabled history, backup export/restore, reload persistence, offline launch, no browser errors.');
}finally{await browser.close();}
