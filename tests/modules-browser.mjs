import {createRequire} from 'node:module';
import assert from 'node:assert/strict';
const require=createRequire(import.meta.url);
const {chromium}=require(require.resolve('playwright',{paths:[process.env.CODEX_PRIMARY_RUNTIME_NODE_MODULES || process.cwd()]}));
const browser=await chromium.launch({headless:true});
const context=await browser.newContext({viewport:{width:1440,height:1000},acceptDownloads:true});
const page=await context.newPage(),errors=[];page.on('pageerror',e=>errors.push(e.message));page.on('dialog',d=>d.accept());
const base=process.env.TEST_BASE_URL || 'http://127.0.0.1:4173';
const nav=async route=>{await page.locator('#btnMenu').click();await page.locator(`#navigationPanel [data-route="${route}"]`).first().click();};
const field=name=>page.locator(`#routeHost [name="${name}"]`);
const save=async title=>{await page.locator('#toastText').evaluate(e=>e.textContent='');await page.getByRole('button',{name:title,exact:true}).click();await page.getByText('Saved successfully.',{exact:true}).waitFor();};
const option=async(name,label)=>field(name).selectOption({label});
try{
 await page.goto(base);await page.getByRole('button',{name:'Use on this device',exact:true}).click();await page.getByRole('button',{name:'Create starter accounts',exact:true}).click();await page.getByText('0 posted entries',{exact:true}).waitFor();
 await nav('coa');await page.locator('[data-add-account]').click();await page.getByLabel('Code',{exact:true}).fill('2100');await page.getByLabel('Name',{exact:true}).fill('Accounts payable');await page.getByLabel('Type',{exact:true}).selectOption('Liability');await page.getByRole('button',{name:'Save account',exact:true}).click();await page.getByText('Accounts payable',{exact:true}).waitFor();
 await nav('settings');await field('bookName').fill('Household Books');await field('dueDays').fill('14');await option('expenseAccount','5100 · Groceries');await option('paymentAccount','1000 · Checking');await option('payableAccount','2100 · Accounts payable');await option('reconcileAccount','1000 · Checking');await field('requireMemo').check();await field('bsZero').uncheck();await field('isZero').uncheck();
 await page.getByRole('button',{name:'Save settings',exact:true}).click();await page.getByText('Settings saved.',{exact:true}).waitFor();assert.equal(await page.locator('.brandTitle').innerText(),'Household Books');
 await nav('journal');await page.getByLabel('Date',{exact:true}).fill('2026-01-01');await page.getByLabel('Memo',{exact:true}).fill('Opening balance');await page.getByLabel('Account 1',{exact:true}).selectOption({label:'1000 · Checking'});await page.getByLabel('Debit 1',{exact:true}).fill('1000');await page.getByLabel('Account 2',{exact:true}).selectOption({label:'3000 · Opening equity'});await page.getByLabel('Credit 2',{exact:true}).fill('1000');await page.getByRole('button',{name:'Post entry',exact:true}).click();await page.getByText('Entry saved.',{exact:true}).waitFor();
 await nav('vendors');await field('name').fill('Example supplier');await field('email').fill('supplier@example.com');await save('Save vendor');
 await nav('invoices');await option('vendorId','Example supplier');await field('number').fill('INV-100');await field('date').fill('2026-02-01');await field('dueDate').fill('2026-02-15');await field('amount').fill('100');await save('Post invoice');
 await page.getByRole('button',{name:'Pay',exact:true}).click();await field('date').fill('2026-02-02');await field('amount').fill('40');await save('Post payment');
 await field('invoiceId').selectOption({index:1});await field('date').fill('2026-02-03');await field('amount').fill('60');await save('Post payment');
 await nav('expenses');await field('date').fill('2026-02-04');await field('payee').fill('Neighborhood grocery');await field('amount').fill('25');await field('method').selectOption('debit');assert.match(await field('paymentAccount').locator('option:checked').innerText(),/Checking/);await save('Post expense');
 await field('date').fill('2026-02-05');await field('payee').fill('Card purchase');await field('amount').fill('30');await field('method').selectOption('credit');await option('paymentAccount','2000 · Credit card');await save('Post expense');
 await nav('transfers');await field('date').fill('2026-02-06');await field('amount').fill('30');await option('toAccount','2000 · Credit card');await save('Post transfer');
 await nav('reconcile');await page.getByText('First-time setup: opening reconciliation',{exact:true}).click();await page.getByLabel('Previously reconciled through',{exact:true}).fill('2026-01-31');await page.getByLabel('Confirmed opening balance',{exact:true}).fill('1000');await save('Save opening reconciliation');
 await nav('statements');await field('name').fill('February bank statement');await field('start').fill('2026-02-01');await field('end').fill('2026-02-28');await field('opening').fill('1000');await field('closing').fill('845');
 await field('file').setInputFiles({name:'february.csv',mimeType:'text/csv',buffer:Buffer.from('date,description,amount\n2026-02-02,Invoice part one,-40\n2026-02-03,Invoice part two,-60\n2026-02-04,Groceries,-25\n2026-02-06,Card payment,-30')});await save('Import statement');
 await page.getByRole('button',{name:'Review',exact:true}).click();assert.equal(await page.getByRole('button',{name:'Complete reconciliation',exact:true}).isEnabled(),false);

 for(const [label,amount] of [['Invoice part one',-40],['Invoice part two',-60],['Groceries',-25],['Card payment',-30]]){await page.locator('#toastText').evaluate(e=>e.textContent='');await page.getByLabel('Select bank transaction '+label,{exact:true}).check();const id=await page.evaluate(async amount=>{const db=await import('./db.js'),ops=await import('./operations.js'),d=(await db.exportData(db.LOCAL_UID)).data;return ops.reconciliationCheck(d,d.statements[0]).books.find(b=>b.amount===amount).id;},amount);await page.locator(`[data-book="${id}"]`).check();await page.getByRole('button',{name:'Match selected pair',exact:true}).click();await page.getByText('Match saved.',{exact:true}).waitFor();}
 await page.getByRole('button',{name:'Complete reconciliation',exact:true}).click();await page.getByText('Reconciliation completed. Cleared transactions are preserved.',{exact:true}).waitFor();
 await page.evaluate(()=>scrollTo(0,0));await page.screenshot({path:'/tmp/modules-reconciliation.png',fullPage:true});
 await nav('aging');await field('agingDate').fill('2026-02-02');await page.getByRole('button',{name:'Apply',exact:true}).click();assert.match(await page.locator('.table').innerText(),/60.00/);
 await nav('is');assert.match(await page.locator('.bigNumber').innerText(),/-\$155.00/);
 await nav('review');assert.equal(await page.locator('tbody tr').count(),7);
 await nav('expenseHub');await page.screenshot({path:'/tmp/modules-desktop.png',fullPage:true});
 await nav('settings');await field('closedThrough').fill('2026-02-28');await page.getByRole('button',{name:'Save settings',exact:true}).click();await page.getByText('Settings saved.',{exact:true}).waitFor();
 const before=await page.evaluate(async()=>{const db=await import('./db.js');return await db.exportData(db.LOCAL_UID);});await page.reload();await page.getByRole('heading',{name:'Dashboard',exact:true}).waitFor();assert.equal(await page.locator('.brandTitle').innerText(),'Household Books');
 const after=await page.evaluate(async()=>{const db=await import('./db.js');return await db.exportData(db.LOCAL_UID);});assert.deepEqual(after.data,before.data);
 for(const width of [320,390,768,1440]){await page.setViewportSize({width,height:900});for(const route of ['settings','invoices','reconcile','statements']){await nav(route);const overflow=await page.evaluate(()=>document.documentElement.scrollWidth>innerWidth);assert.equal(overflow,false,`${route} at ${width}`);}}
 await page.setViewportSize({width:390,height:844});await nav('expenseHub');await page.evaluate(()=>scrollTo(0,0));await page.screenshot({path:'/tmp/modules-mobile.png',fullPage:true});
 const other=await browser.newContext();const restore=await other.newPage();await restore.goto(base);await restore.getByRole('button',{name:'Use on this device',exact:true}).click();await restore.getByRole('heading',{name:'Dashboard',exact:true}).waitFor();await restore.getByRole('button',{name:'Backups',exact:true}).click();await restore.locator('input[type=file]').setInputFiles({name:'books.json',mimeType:'application/json',buffer:Buffer.from(JSON.stringify(before))});await restore.getByText('Backup restored.',{exact:true}).waitFor();
 const restored=await restore.evaluate(async()=>{const db=await import('./db.js');return (await db.exportData(db.LOCAL_UID)).data;});assert.deepEqual(restored,before.data);await other.close();
 assert.deepEqual(errors,[]);console.log('PASS: master settings, grouped navigation, invoices and partial payments, expenses and transfers, CSV import and reconciliation, dated aging, ledger/report integration, responsive layouts, reload and complete module backup restore.');
}finally{await browser.close();}
