import test from 'node:test';
import assert from 'node:assert/strict';
import {validateEntry,trialBalance,balanceSheet,incomeStatement,accountBalances,normalizeAccounts} from '../accounting.js';
import {validateBackup} from '../db.js';
const accounts=[{id:'cash',name:'Cash',type:'asset'},{id:'equity',name:'Capital',type:'Equity'},{id:'sales',name:'Income',type:'Revenue'},{id:'expense',name:'Food',type:'Expense'},{id:'contra',name:'Allowance',type:'Asset',normalBalance:'Credit'}];
const headers=[{id:'h1',date:'2026-01-01'},{id:'h2',date:'2026-02-01'},{id:'h3',date:'2026-02-02'},{id:'h4',date:'2026-03-01'}];
const lines=[['h1','cash',1000,0],['h1','equity',0,1000],['h2','cash',250.30,0],['h2','sales',0,250.30],['h3','expense',50.10,0],['h3','cash',0,50.10],['h4','expense',20,0],['h4','contra',0,20]].map(([headerId,accountId,debit,credit],i)=>({id:String(i),headerId,accountId,debit,credit}));
test('balanced journal accepts exact cents, rejects invalid money and line shapes',()=>{
  assert.equal(validateEntry([{debit:.10},{debit:.20},{credit:.30}]).ok,true);
  for(const ls of [[{debit:1},{credit:.99}],[{debit:-1},{credit:-1}],[{debit:1,credit:1}], [{debit:1.001},{credit:1.001}], [{debit:'wrong'},{credit:1}], [{debit:Infinity},{credit:Infinity}], [{debit:1},{credit:1},{debit:0,credit:0}]])assert.equal(validateEntry(ls).ok,false);
});
test('trial balance preserves disabled account history',()=>{
  const tb=trialBalance(accounts.map(a=>({...a,isActive:a.id!=='cash'})),headers,lines);
  assert.equal(tb.foots,true);assert.equal(tb.totalDebit,1270.30);assert.equal(tb.rows.find(r=>r.account.id==='cash').debit,1200.20);
});
test('date ranges include boundaries and exclude orphan lines',()=>{
  const report=incomeStatement(accounts,headers,[...lines,{headerId:'missing',accountId:'sales',credit:999}],{start:'2026-02-01',end:'2026-02-02'});
  assert.equal(report.totalRevenue,250.30);assert.equal(report.totalExpense,50.10);assert.equal(report.netIncome,200.20);
});
test('balance sheet includes earnings without a retained earnings account and ignores start date',()=>{
  const bs=balanceSheet(accounts,headers,lines,{start:'2026-02-01',end:'2026-02-02'});
  assert.equal(bs.totalAssets,1200.20);assert.equal(bs.totalEquity,1200.20);assert.equal(bs.balanced,true);
});
test('contra assets reduce total assets even with a credit normal balance',()=>{
  const bs=balanceSheet(accounts,headers,lines);assert.equal(bs.totalAssets,1180.20);assert.equal(bs.totalEquity,1180.20);assert.equal(bs.balanced,true);
});
test('normalizes legacy lowercase types and debit/credit names',()=>{
  assert.equal(normalizeAccounts([{type:'asset',normalBalance:'debit'}])[0].normalBalance,'Debit');
  assert.equal(accountBalances(accounts,headers,lines).get('cash').balance,1200.20);
});
test('validates backups before restore, including linkage, balance, dates, IDs',()=>{
  const good={version:1,data:{accounts,journalHeaders:headers,journalLines:lines}};
  assert.equal(validateBackup(structuredClone(good)).accounts.length,5);
  for(const mutate of [b=>b.data.journalLines[0].debit=999,b=>b.data.journalLines[0].accountId='missing',b=>b.data.journalHeaders[0].date='2026-02-30',b=>b.data.accounts.push(b.data.accounts[0]),b=>b.data.journalLines[0].id='bad/id']){
    const bad=structuredClone(good);mutate(bad);assert.throws(()=>validateBackup(bad));
  }
});
