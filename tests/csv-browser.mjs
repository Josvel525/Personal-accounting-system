import {createRequire} from 'node:module';
import {readFile} from 'node:fs/promises';
import assert from 'node:assert/strict';
import {CSV_TYPES} from '../csv-import.js';
import {encodeCSV} from '../csv-utils.js';
const require=createRequire(import.meta.url);
const {chromium}=require(require.resolve('playwright',{paths:[process.env.CODEX_PRIMARY_RUNTIME_NODE_MODULES || process.cwd()]}));
const browser=await chromium.launch({headless:true});
const context=await browser.newContext({viewport:{width:1440,height:1000},acceptDownloads:true});
const page=await context.newPage(),errors=[];
page.on('pageerror',e=>errors.push(e.message));page.on('dialog',d=>d.accept());
const base=process.env.TEST_BASE_URL || 'http://127.0.0.1:4173';
const nav=async route=>{await page.locator('#btnMenu').click();await page.locator(`#navigationPanel [data-route="${route}"]`).first().click();};
const data=()=>page.evaluate(async()=>{const db=await import('./db.js');return (await db.exportData(db.LOCAL_UID)).data;});
const clearToast=()=>page.locator('#toastText').evaluate(e=>e.textContent='');
const upload=async text=>page.getByLabel('CSV file',{exact:true}).setInputFiles({name:'import.csv',mimeType:'text/csv',buffer:Buffer.from(text)});
const importRows=async(kind,route,rows)=>{
 await nav(route);const downloadEvent=page.waitForEvent('download');await page.locator('[data-csv-template]').click();const download=await downloadEvent;
 assert.equal(download.suggestedFilename(),`${kind}-template.csv`);
 const template=await readFile(await download.path(),'utf8');assert.equal(template,encodeCSV(CSV_TYPES[kind].headers));
 const text=template+encodeCSV(CSV_TYPES[kind].headers,rows.map(row=>CSV_TYPES[kind].headers.map(h=>row[h] ?? ''))).split('\r\n').slice(1).join('\r\n');
 await page.locator('[data-csv-import]').click();await upload(text);await page.locator('.csvResult .alert').filter({hasText:'Ready:'}).waitFor();
 await clearToast();await page.locator('#modalFooter button').filter({hasText:/^Import \d+ records?$/}).click();await page.getByText('CSV import completed. All records saved.',{exact:true}).waitFor();
};
try{
 await page.goto(base);await page.getByRole('button',{name:'Use on this device',exact:true}).click();await page.getByRole('heading',{name:'Dashboard',exact:true}).waitFor();
 await importRows('accounts','coa',[{code:'0100',name:'Bank',type:'Asset'},{code:'2000',name:'Card',type:'Liability'},{code:'2100',name:'AP',type:'Liability'},{code:'3000',name:'Equity',type:'Equity'},{code:'5000',name:'Expense',type:'Expense'}]);
 assert.equal((await data()).accounts[0].code,'0100');
 await page.locator('[data-csv-import]').click();await upload('code,name,type\n6000,Valid,Expense\n0100,Duplicate,Asset');await page.getByText('Nothing was imported. Correct these errors and choose the file again.',{exact:true}).waitFor();assert.equal(await page.locator('#modalFooter button').last().isDisabled(),true);assert.equal((await data()).accounts.length,5);await page.getByRole('button',{name:'Cancel',exact:true}).click();
 await importRows('vendors','vendors',[{name:'Vendor, Inc.',email:'ap@example.com',notes:'Bulk supplier'}]);
 await importRows('journal','journal',[{entry_id:'opening',date:'2026-01-01',memo:'Opening bank',account_code:'0100',debit:1000},{entry_id:'opening',date:'2026-01-01',memo:'Opening bank',account_code:'3000',credit:1000}]);
 await importRows('invoices','invoices',[{import_id:'invoice-1',vendor_name:'Vendor, Inc.',invoice_number:'INV-1',date:'2026-01-02',due_date:'2026-01-31',amount:100,expense_account_code:'5000',payable_account_code:'2100',memo:'Supplies'}]);
 await importRows('payments','payments',[{import_id:'payment-1',vendor_name:'Vendor, Inc.',invoice_number:'INV-1',date:'2026-01-03',amount:100,payment_account_code:'0100'}]);
 await importRows('expenses','expenses',[{import_id:'expense-1',date:'2026-01-04',payee:'Grocer',amount:25,payment_method:'debit',expense_account_code:'5000',payment_account_code:'0100'}]);
 await importRows('transfers','transfers',[{import_id:'transfer-1',date:'2026-01-05',amount:20,from_account_code:'0100',to_account_code:'2000',memo:'Card payment'}]);
 await importRows('statements','statements',[{statement_id:'card-jan',account_code:'2000',statement_name:'January card',period_start:'2026-01-01',period_end:'2026-01-31',opening_balance:0,closing_balance:-20,date:'2026-01-05',description:'Payment received',amount:-20}]);
 await nav('reconcile');await page.locator('[data-bank-import]').click();
 const rawDownload=page.waitForEvent('download');await page.locator('[data-bank-template]').click();assert.equal(await readFile(await (await rawDownload).path(),'utf8'),encodeCSV(['date','description','amount']));
 const form=page.locator('.reconcileImport form');await form.getByLabel('Import account',{exact:true}).selectOption({label:'0100 · Bank'});await form.getByLabel('Statement name',{exact:true}).fill('January bank');await form.getByLabel('Period start',{exact:true}).fill('2026-01-01');await form.getByLabel('Period end',{exact:true}).fill('2026-01-31');await form.getByLabel('Closing statement balance',{exact:true}).fill('850');
 await form.getByLabel('Bank transactions CSV',{exact:true}).setInputFiles({name:'bank.csv',mimeType:'text/csv',buffer:Buffer.from('date,description,amount\n2026-01-01,Deposit,1000\n2026-01-03,Vendor payment,-100\n2026-01-04,Groceries,-25\n2026-01-05,Card payment,-20\n2026-01-06,Bank fee,-5')});
 await clearToast();await page.getByRole('button',{name:'Import bank CSV',exact:true}).click();await page.getByText('Saved successfully.',{exact:true}).waitFor();
 assert.equal(await page.locator('.comparePanel').count(),2);const desktop=await page.locator('.comparePanel').evaluateAll(es=>es.map(e=>({x:e.getBoundingClientRect().x,y:e.getBoundingClientRect().y})));assert.ok(desktop[1].x>desktop[0].x);assert.equal(desktop[0].y,desktop[1].y);
 assert.equal(await page.getByRole('button',{name:'Complete reconciliation',exact:true}).isDisabled(),true);
 await page.getByLabel('Select bank transaction Bank fee',{exact:true}).check();await page.getByLabel('Select system transaction Opening bank',{exact:true}).check();assert.equal(await page.getByRole('button',{name:'Match selected pair',exact:true}).isDisabled(),true);await page.getByText('Selected amounts differ. Choose a matching transaction or post an adjustment.',{exact:true}).waitFor();
 await page.getByRole('button',{name:'Add adjustment',exact:true}).click();assert.equal(await page.getByLabel('Signed balance change',{exact:true}).inputValue(),'-5');await page.getByLabel('Offset account',{exact:true}).selectOption({label:'5000 · Expense'});await clearToast();await page.getByRole('button',{name:'Post adjustment',exact:true}).click();await page.getByText('Saved successfully.',{exact:true}).waitFor();
 const match=async(description,amount)=>{
  await page.getByLabel('Select bank transaction '+description,{exact:true}).check();
  const id=await page.evaluate(async amount=>{const db=await import('./db.js'),ops=await import('./operations.js'),d=(await db.exportData(db.LOCAL_UID)).data;return ops.reconciliationCheck(d,d.statements.find(s=>s.name==='January bank')).books.find(b=>b.amount===amount).id;},amount);
  await page.locator(`[data-book="${id}"]`).check();await clearToast();await page.getByRole('button',{name:'Match selected pair',exact:true}).click();await page.getByText('Match saved.',{exact:true}).waitFor();
 };
 await match('Deposit',1000);await page.getByLabel('Show unmatched only',{exact:true}).check();assert.equal(await page.getByLabel('Select bank transaction Deposit',{exact:true}).isVisible(),false);await page.getByLabel('Show unmatched only',{exact:true}).uncheck();
 await clearToast();await page.getByRole('button',{name:'Unmatch',exact:true}).click();await page.getByText('Match removed.',{exact:true}).waitFor();assert.equal(await page.getByLabel('Select bank transaction Deposit',{exact:true}).isChecked(),false);
 await match('Deposit',1000);await match('Vendor payment',-100);await match('Groceries',-25);await match('Card payment',-20);await match('Bank fee',-5);
 await page.getByRole('button',{name:'Complete reconciliation',exact:true}).click();await page.getByText('Reconciliation completed. Cleared transactions are preserved.',{exact:true}).waitFor();assert.equal((await data()).statements.find(s=>s.name==='January bank').status,'reconciled');
 await page.screenshot({path:'/tmp/csv-reconciliation-desktop.png',fullPage:true});
 for(const width of [320,390,768,1440]){
  await page.setViewportSize({width,height:900});assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth>innerWidth),false,`reconciliation overflow ${width}`);
  if(width===390){const mobile=await page.locator('.comparePanel').evaluateAll(es=>es.map(e=>({x:e.getBoundingClientRect().x,y:e.getBoundingClientRect().y})));assert.equal(mobile[0].x,mobile[1].x);assert.ok(mobile[1].y>mobile[0].y);await page.screenshot({path:'/tmp/csv-reconciliation-mobile.png',fullPage:true});}
 }
 await nav('vendors');await page.setViewportSize({width:320,height:900});await page.locator('[data-csv-import]').click();await upload('name,email,notes\nMobile preview,test@example.com,Testing');await page.locator('.csvResult .alert').filter({hasText:'Ready:'}).waitFor();assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth>innerWidth),false,'CSV preview mobile overflow');await page.getByRole('button',{name:'Cancel',exact:true}).click();
 const before=await data();await page.reload();await page.getByRole('heading',{name:'Dashboard',exact:true}).waitFor();assert.deepEqual(await data(),before);assert.deepEqual(errors,[]);
 console.log('PASS: every downloaded CSV template filled and imported through UI; atomic error handling; direct reconciliation upload; side-by-side matching, mismatch, unmatch, adjustments and completion; mobile layout; persisted reload.');
}finally{await browser.close();}
