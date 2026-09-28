import {validDate} from './utils.js';
import {cents} from './accounting.js';
import {validateSettings} from './settings.js';
const fail=message=>{throw Error(`Backup: ${message}`);};
const amount=(v,positive=false)=>typeof v==='number' && Number.isFinite(v) && Number.isSafeInteger(cents(v)) && Math.abs(v*100-cents(v))<1e-6 && (!positive || v>0);
export function validateModules(d){
 const accounts=new Map(d.accounts.map(a=>[a.id,a])),heads=new Map(d.journalHeaders.map(h=>[h.id,h])),lines=new Map(d.journalLines.map(l=>[l.id,l]));
 for(const p of d.preferences){if(p.id!=='master')fail('unknown settings record');validateSettings(p,d);}
 for(const v of d.vendors)if(typeof v.name!=='string' || !v.name.trim())fail('invalid vendor');
 const pair=(item,debit,credit)=>{
  const h=heads.get(item.headerId),ls=d.journalLines.filter(l=>l.headerId===item.headerId);
  if(!h || h.date!==item.date || ls.length!==2 || !ls.some(l=>l.accountId===debit && cents(l.debit)===cents(item.amount) && !cents(l.credit)) || !ls.some(l=>l.accountId===credit && cents(l.credit)===cents(item.amount) && !cents(l.debit)))fail('document does not match its journal posting');
 };
 const documents=new Set();
 for(const item of [...d.invoices,...d.payments,...d.expenses]){if(documents.has(item.headerId))fail('duplicate document posting');documents.add(item.headerId);if(!validDate(item.date) || !amount(item.amount,true))fail('invalid document date or amount');}
 const invoiceNumbers=new Set();
 for(const i of d.invoices){
  if(!d.vendors.some(v=>v.id===i.vendorId) || typeof i.number!=='string' || !i.number.trim() || !validDate(i.dueDate) || i.dueDate<i.date || accounts.get(i.expenseAccount)?.type!=='Expense' || accounts.get(i.payableAccount)?.type!=='Liability')fail('invalid invoice');
  const key=i.vendorId+'|'+i.number.toLowerCase();if(invoiceNumbers.has(key))fail('duplicate invoice number');invoiceNumbers.add(key);pair(i,i.expenseAccount,i.payableAccount);
  if(d.payments.filter(p=>p.invoiceId===i.id).reduce((n,p)=>n+cents(p.amount),0)>cents(i.amount))fail('invoice overpayment');
 }
 for(const p of d.payments){const i=d.invoices.find(i=>i.id===p.invoiceId);if(!i || p.date<i.date || !['Asset','Liability'].includes(accounts.get(p.paymentAccount)?.type) || p.paymentAccount===i.payableAccount)fail('invalid invoice payment');pair(p,i.payableAccount,p.paymentAccount);}
 for(const e of d.expenses){if(!['bank','debit','credit','cash'].includes(e.method) || !e.payee || accounts.get(e.expenseAccount)?.type!=='Expense' || accounts.get(e.paymentAccount)?.type!==(e.method==='credit'?'Liability':'Asset'))fail('invalid expense');pair(e,e.expenseAccount,e.paymentAccount);}
 const signed=l=>(accounts.get(l.accountId)?.normalBalance==='Debit'?1:-1)*(cents(l.debit)-cents(l.credit));
 const matched=new Set(),rowIds=new Set(),periods=new Set();
 for(const s of d.statements){
  if(!['Asset','Liability'].includes(accounts.get(s.accountId)?.type) || !validDate(s.start) || !validDate(s.end) || s.start>s.end || !amount(s.opening) || !amount(s.closing) || !['open','reconciled'].includes(s.status) || !Array.isArray(s.rows) || !s.rows.length || s.rows.length>2000)fail('invalid statement');
  const period=s.accountId+'|'+s.start+'|'+s.end;if(periods.has(period))fail('duplicate statement');periods.add(period);
  for(const r of s.rows){
   if(typeof r.id!=='string' || !r.id || rowIds.has(r.id) || !validDate(r.date) || r.date<s.start || r.date>s.end || !amount(r.amount) || !r.amount || typeof r.description!=='string')fail('invalid statement row');rowIds.add(r.id);
   if(r.bookLineId){const l=lines.get(r.bookLineId);if(!l || l.accountId!==s.accountId || signed(l)!==cents(r.amount) || heads.get(l.headerId).date>s.end || matched.has(l.id))fail('invalid or duplicate statement match');matched.add(l.id);}
  }
  if(cents(s.opening)+s.rows.reduce((n,r)=>n+cents(r.amount),0)!==cents(s.closing))fail('statement does not balance');
 }
 const cleared=new Set(),statementIds=new Set();
 for(const a of d.accounts){let prior=null;for(const r of d.reconciliations.filter(r=>r.accountId===a.id).sort((x,y)=>x.end.localeCompare(y.end))){
  if(!['opening','statement'].includes(r.kind) || !validDate(r.start) || !validDate(r.end) || r.start>r.end || (prior && r.start<=prior.end) || !amount(r.opening) || !amount(r.closing) || !Array.isArray(r.lineIds))fail('invalid reconciliation');
  let change=0;
  for(const id of r.lineIds){const l=lines.get(id);if(!l || l.accountId!==a.id || heads.get(l.headerId).date>r.end || cleared.has(id))fail('invalid cleared transaction');cleared.add(id);change+=signed(l);}
  if(r.kind==='opening'){if(prior || r.opening!==0 || r.start!==r.end || d.journalLines.some(l=>l.accountId===a.id && heads.get(l.headerId).date<=r.end && !r.lineIds.includes(l.id)))fail('invalid opening reconciliation');}
  else{const s=d.statements.find(s=>s.id===r.statementId);if(!s || s.status!=='reconciled' || statementIds.has(s.id) || s.accountId!==a.id || s.start!==r.start || s.end!==r.end || cents(s.opening)!==cents(r.opening) || cents(s.closing)!==cents(r.closing) || s.rows.length!==r.lineIds.length || s.rows.some(row=>!r.lineIds.includes(row.bookLineId)))fail('invalid completed statement');statementIds.add(s.id);}
  if(cents(r.opening)!==cents(prior?.closing || 0) || cents(r.opening)+change!==cents(r.closing))fail('reconciliation does not balance');prior=r;
 }}
 if(d.reconciliations.some(r=>!accounts.has(r.accountId)))fail('reconciliation account is missing');
 if(d.statements.some(s=>s.status==='reconciled' && !statementIds.has(s.id)))fail('completed statement has no reconciliation');
}
