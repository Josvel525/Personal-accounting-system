import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {JSDOM} from 'jsdom';
import {indexedDB} from 'fake-indexeddb';
import * as db from '../db.js';
const html=await readFile(new URL('../index.html',import.meta.url),'utf8');
const dom=new JSDOM(html,{url:'https://accounting.test/'});
for(const [key,value] of Object.entries({window:dom.window,document:dom.window.document,localStorage:dom.window.localStorage,indexedDB,confirm:()=>true,navigator:dom.window.navigator}))Object.defineProperty(globalThis,key,{value,configurable:true,writable:true});
const $=selector=>document.querySelector(selector);
const click=selector=>{assert.ok($(selector),selector);$(selector).click();};
const fill=(selector,value)=>{$(selector).value=value;$(selector).dispatchEvent(new dom.window.Event('input',{bubbles:true}));};
const submit=selector=>$(selector).dispatchEvent(new dom.window.Event('submit',{bubbles:true,cancelable:true}));
const wait=async(predicate)=>{for(let i=0;i<200;i++){if(predicate())return;await new Promise(r=>setTimeout(r,5));}throw Error('Timed out: '+predicate.toString()+'\n'+document.body.textContent);};
const nav=async route=>{click(`[data-route="${route}"]`);await wait(()=>!!$('#routeHost h2'));};
test('complete local UI and persistence workflows with real DOM events and IndexedDB semantics',async()=>{
 await import('../app.js');click('#btnLocal');await wait(()=>$('#routeHost h2')?.textContent==='Dashboard');
 const starter=[...document.querySelectorAll('#routeHost button')].find(b=>b.textContent==='Create starter accounts');starter.click();
 await wait(()=>$('#toastText').textContent==='Starter accounts created.');
 let saved=(await db.exportData(db.LOCAL_UID)).data;assert.equal(saved.accounts.length,9);
 const cash=saved.accounts.find(a=>a.code==='1000'),capital=saved.accounts.find(a=>a.code==='3000'),income=saved.accounts.find(a=>a.code==='4000'),expense=saved.accounts.find(a=>a.code==='5100');
 async function entry(date,memo,debitId,creditId,amount){
  await nav('journal');fill('#entryDate',date);fill('#entryMemo',memo);const rows=document.querySelectorAll('.journalLine');
  rows[0].querySelector('select').value=debitId;rows[0].querySelector('[data-debit]').value=amount;
  rows[1].querySelector('select').value=creditId;rows[1].querySelector('[data-credit]').value=amount;
  $('#toastText').textContent='';submit('#routeHost form');await wait(()=>$('#toastText').textContent==='Entry saved.');
 }
 await entry('2026-01-01','Opening',cash.id,capital.id,'1000.00');await entry('2026-02-01','Income',cash.id,income.id,'250.30');await entry('2026-02-02','Food',expense.id,cash.id,'50.10');
 await nav('dashboard');assert.match($('#routeHost').textContent,/3 posted entries/);assert.match($('.stats').textContent,/1,200.20/);
 await nav('trial');assert.match($('#routeHost').textContent,/Debits equal credits/);
 await nav('bs');assert.match($('#routeHost').textContent,/Balance sheet balances/);assert.match($('#routeHost').textContent,/200.20/);
 await nav('is');fill('#reportStart','2026-02-02');fill('#reportEnd','2026-02-02');submit('.filters');assert.match($('.bigNumber').textContent,/-\$50.10/);
 await nav('ledger');fill('#ledgerAccount',cash.id);fill('#reportStart','2026-02-02');fill('#reportEnd','2026-02-02');submit('.filters');assert.match($('#routeHost').textContent,/1,250.30/);assert.match($('#routeHost').textContent,/1,200.20/);
 await nav('coa');fill('#accountCode','5400');fill('#accountName','<img src=x onerror=alert(1)>');fill('#accountType','Expense');fill('#accountNormal','Debit');$('#toastText').textContent='';submit('.accountForm');await wait(()=>$('#toastText').textContent==='Account saved.');assert.equal($('#routeHost img'),null);assert.match($('#routeHost').textContent,/<img src=x onerror=alert\(1\)>/);
 await assert.rejects(db.deleteAccount(db.LOCAL_UID,cash.id),/posted entries/);
 await db.saveAccount(db.LOCAL_UID,{...cash,isActive:false});
 click('#btnSignOut');click('#btnLocal');await wait(()=>$('#routeHost h2')?.textContent==='Dashboard');await nav('trial');assert.match($('#routeHost').textContent,/Debits equal credits/);
 saved=await db.exportData(db.LOCAL_UID);assert.equal(saved.data.journalHeaders.length,3);assert.equal(saved.data.journalLines.length,6);assert.equal(db.validateBackup(structuredClone(saved)).accounts.length,10);
 await assert.rejects(db.importLocalBackup(db.LOCAL_UID,saved),/empty local books/);
 // Invalid transactions cannot partially persist a header or lines.
 await assert.rejects(db.postEntry(db.LOCAL_UID,{date:'2026-02-30',lines:[{accountId:income.id,debit:1},{accountId:expense.id,credit:1}]}),/valid journal date/);
 await assert.rejects(db.postEntry(db.LOCAL_UID,{date:'2026-03-01',lines:[{accountId:income.id,debit:1},{accountId:expense.id,credit:.99}]}),/equal totals/);
 await assert.rejects(db.postEntry(db.LOCAL_UID,{date:'2026-03-01',lines:[{accountId:cash.id,debit:1},{accountId:income.id,credit:1}]}),/active account/);
 assert.equal((await db.exportData(db.LOCAL_UID)).data.journalHeaders.length,3);
 assert.equal(await db.getQueueSize(db.LOCAL_UID),0);
 // Cloud edits are durable and isolated per user before any network operation.
 await db.saveAccount('test-cloud-user',{id:'cloud1',name:'Cloud cash',type:'Asset',isActive:true});
 await db.saveAccount('test-cloud-user',{id:'cloud2',name:'Cloud capital',type:'Equity',isActive:true});
 await db.postEntry('test-cloud-user',{date:'2026-01-01',lines:[{accountId:'cloud1',debit:10},{accountId:'cloud2',credit:10}]});
 assert.equal(await db.getQueueSize('test-cloud-user'),3);assert.equal(await db.getQueueSize('another-user'),0);
 const queue=await new Promise((resolve,reject)=>{const r=indexedDB.open('pa_local_v1');r.onsuccess=()=>{const q=r.result.transaction('queue').objectStore('queue').getAll();q.onsuccess=()=>resolve(q.result);q.onerror=()=>reject(q.error);};});
 assert.equal(queue.find(q=>q.ops.some(o=>o.collection==='journalHeaders')).ops.length,3);
 Object.defineProperty(navigator,'onLine',{value:false,configurable:true});
 const offline=await db.loadAll('test-cloud-user');assert.equal(offline.pending,3);assert.equal(offline.data.journalHeaders.length,1);assert.equal(offline.source,'cache');
 assert.equal((await db.loadAll('unknown-user')).unavailable,true);
 dom.window.close();
});
