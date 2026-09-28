import {uid,validDate,clampStr} from './utils.js';
import {cents,dollars,accountBalances} from './accounting.js';
import {transactModules,journalOperations} from './db.js';
export const put=(collection,data)=>({type:'set',collection,id2:data.id,data});
export function moneyValue(value,positive=false){
 const text=String(value).trim();
 if(!/^-?\d+(\.\d{1,2})?$/.test(text) || !Number.isSafeInteger(cents(text)) || (positive && cents(text)<=0))throw Error('Enter a valid amount with at most two decimal places.');
 return dollars(cents(text));
}
function account(data,id,types){const a=data.accounts.find(a=>a.id===id && a.isActive!==false && types.includes(a.type));if(!a)throw Error('Choose an active account of the correct type.');return a;}
function vendor(data,id){if(!data.vendors.some(v=>v.id===id))throw Error('Choose a vendor.');}
export const unpaid=(data,invoice)=>dollars(cents(invoice.amount)-data.payments.filter(p=>p.invoiceId===invoice.id).reduce((n,p)=>n+cents(p.amount),0));
export const saveVendor=(userId,input)=>transactModules(userId,data=>{
 const name=clampStr(input.name,120);if(!name)throw Error('Enter a vendor name.');
 if(data.vendors.some(v=>v.id!==input.id && v.name.toLowerCase()===name.toLowerCase()))throw Error('A vendor with this name already exists.');
 return [put('vendors',{id:input.id || uid(),name,email:clampStr(input.email,160),notes:clampStr(input.notes,500)})];
});
export const postInvoice=(userId,input)=>transactModules(userId,data=>{
 vendor(data,input.vendorId);account(data,input.expenseAccount,['Expense']);account(data,input.payableAccount,['Liability']);
 const number=clampStr(input.number,80),amount=moneyValue(input.amount,true);
 if(!number)throw Error('Enter an invoice number.');
 if(data.invoices.some(i=>i.vendorId===input.vendorId && i.number.toLowerCase()===number.toLowerCase()))throw Error('This vendor invoice number has already been posted.');
 if(!validDate(input.dueDate) || input.dueDate<input.date)throw Error('Due date must be on or after the invoice date.');
 const memo=clampStr(input.memo || `Invoice ${number}`,500);
 const ops=journalOperations(data,{date:input.date,ref:number,memo,lines:[{accountId:input.expenseAccount,debit:amount},{accountId:input.payableAccount,credit:amount}]},'invoice');
 return [...ops,put('invoices',{id:uid(),vendorId:input.vendorId,number,date:input.date,dueDate:input.dueDate,amount,memo,expenseAccount:input.expenseAccount,payableAccount:input.payableAccount,headerId:ops[0].data.id})];
});
export const payInvoice=(userId,input)=>transactModules(userId,data=>{
 const invoice=data.invoices.find(i=>i.id===input.invoiceId);if(!invoice)throw Error('Invoice not found.');
 const amount=moneyValue(input.amount,true);account(data,input.paymentAccount,['Asset','Liability']);
 if(input.paymentAccount===invoice.payableAccount)throw Error('Payment account must differ from accounts payable.');
 if(cents(amount)>cents(unpaid(data,invoice)))throw Error('Payment exceeds the invoice outstanding balance.');
 if(input.date<invoice.date)throw Error('Payment cannot predate the invoice.');
 const ops=journalOperations(data,{date:input.date,ref:clampStr(input.reference,100),memo:`Payment for invoice ${invoice.number}`,lines:[{accountId:invoice.payableAccount,debit:amount},{accountId:input.paymentAccount,credit:amount}]},'invoice-payment');
 return [...ops,put('payments',{id:uid(),invoiceId:invoice.id,date:input.date,amount,paymentAccount:input.paymentAccount,reference:clampStr(input.reference,100),headerId:ops[0].data.id})];
});
export const postExpense=(userId,input)=>transactModules(userId,data=>{
 account(data,input.expenseAccount,['Expense']);account(data,input.paymentAccount,['Asset','Liability']);
 const amount=moneyValue(input.amount,true),payee=clampStr(input.payee,120);if(!payee)throw Error('Enter a payee.');
 if(!['bank','debit','credit','cash'].includes(input.method))throw Error('Choose a payment method.');
 account(data,input.paymentAccount,input.method==='credit'?['Liability']:['Asset']);
 const memo=clampStr(input.memo || payee,500);
 const ops=journalOperations(data,{date:input.date,ref:clampStr(input.reference,100),memo,lines:[{accountId:input.expenseAccount,debit:amount},{accountId:input.paymentAccount,credit:amount}]},'expense');
 return [...ops,put('expenses',{id:uid(),date:input.date,amount,payee,memo,method:input.method,expenseAccount:input.expenseAccount,paymentAccount:input.paymentAccount,headerId:ops[0].data.id})];
});
export const postTransfer=(userId,input)=>transactModules(userId,data=>{
 account(data,input.fromAccount,['Asset']);account(data,input.toAccount,['Asset','Liability']);
 if(input.fromAccount===input.toAccount)throw Error('Choose two different accounts.');
 const amount=moneyValue(input.amount,true);
 return journalOperations(data,{date:input.date,ref:input.reference,memo:input.memo || 'Transfer / credit card payment',lines:[{accountId:input.toAccount,debit:amount},{accountId:input.fromAccount,credit:amount}]},'transfer');
});
// RFC-style CSV quoting, including embedded commas and newlines; no code evaluation.
export function parseStatementCSV(text){
 if(text.length>1000000)throw Error('CSV must be under 1 MB.');
 const records=[];let row=[],cell='',quoted=false;
 text=text.replace(/^\uFEFF/,'');
 for(let i=0;i<text.length;i++){
  const c=text[i];
  if(c==='"'){if(quoted && text[i+1]==='"'){cell+='"';i++;}else quoted=!quoted;}
  else if(c===',' && !quoted){row.push(cell);cell='';}
  else if((c==='\n' || c==='\r') && !quoted){if(c==='\r' && text[i+1]==='\n')i++;row.push(cell);if(row.some(v=>v.trim()))records.push(row);row=[];cell='';}
  else cell+=c;
 }
 if(quoted)throw Error('CSV has an unclosed quoted field.');
 row.push(cell);if(row.some(v=>v.trim()))records.push(row);
 const heads=records.shift()?.map(x=>x.trim().toLowerCase()) || [];
 if(!['date','description','amount'].every(x=>heads.includes(x)))throw Error('CSV needs date,description,amount headers.');
 if(!records.length || records.length>2000)throw Error('Import between 1 and 2,000 statement rows.');
 return records.map((r,i)=>{
  if(r.length!==heads.length)throw Error(`CSV row ${i+2} has the wrong number of columns.`);
  const date=r[heads.indexOf('date')].trim(),description=clampStr(r[heads.indexOf('description')],300),amount=moneyValue(r[heads.indexOf('amount')].trim().replace(/,/g,''));
  if(!validDate(date) || !description || cents(amount)===0)throw Error(`Invalid date, description, or zero amount on CSV row ${i+2}. Use YYYY-MM-DD dates.`);
  return {id:uid(),date,description,amount,bookLineId:''};
 });
}
export const importStatement=(userId,input)=>transactModules(userId,data=>{
 account(data,input.accountId,['Asset','Liability']);
 if(!validDate(input.start) || !validDate(input.end) || input.start>input.end)throw Error('Choose a valid statement date range.');
 const rows=parseStatementCSV(input.csv),opening=moneyValue(input.opening),closing=moneyValue(input.closing);
 if(rows.some(r=>r.date<input.start || r.date>input.end))throw Error('Every CSV date must fall within the statement period.');
 if(cents(opening)+rows.reduce((n,r)=>n+cents(r.amount),0)!==cents(closing))throw Error('Opening balance plus statement transactions must equal closing balance. Check the amount signs.');
 if(data.statements.some(s=>s.accountId===input.accountId && s.start===input.start && s.end===input.end))throw Error('A statement for this account and period already exists.');
 if(data.reconciliations.some(r=>r.accountId===input.accountId && input.start<=r.end))throw Error('This period overlaps a completed reconciliation.');
 return [put('statements',{id:uid(),accountId:input.accountId,start:input.start,end:input.end,opening,closing,name:clampStr(input.name || 'Imported statement',120),rows,status:'open'})];
});
export function bookTransactions(data,accountId,end){
 const a=data.accounts.find(a=>a.id===accountId),heads=new Map(data.journalHeaders.map(h=>[h.id,h]));
 return data.journalLines.filter(l=>l.accountId===accountId && heads.get(l.headerId)?.date<=end).map(l=>({...l,date:heads.get(l.headerId).date,memo:heads.get(l.headerId).memo,amount:dollars((a.normalBalance==='Debit'?1:-1)*(cents(l.debit)-cents(l.credit)))})).sort((a,b)=>a.date.localeCompare(b.date));
}
export function reconciledIds(data,accountId){return new Set(data.reconciliations.filter(r=>r.accountId===accountId).flatMap(r=>r.lineIds));}
export function reconciliationCheck(data,statement){
 const prior=data.reconciliations.filter(r=>r.accountId===statement.accountId).sort((a,b)=>b.end.localeCompare(a.end))[0];
 const used=reconciledIds(data,statement.accountId),matched=statement.rows.filter(r=>r.bookLineId).map(r=>r.bookLineId);
 matched.forEach(id=>used.add(id));
 const books=bookTransactions(data,statement.accountId,statement.end),bookTotal=books.reduce((n,t)=>n+cents(t.amount),0),outstanding=books.filter(t=>!used.has(t.id)),outstandingTotal=outstanding.reduce((n,t)=>n+cents(t.amount),0);
 const adjusted=dollars(bookTotal-outstandingTotal),difference=dollars(cents(adjusted)-cents(statement.closing));
 return {prior,books,outstanding,bookTotal:dollars(bookTotal),outstandingTotal:dollars(outstandingTotal),adjusted,difference,openingMatches:cents(statement.opening)===cents(prior?.closing || 0),allMatched:statement.rows.every(r=>r.bookLineId),lineIds:matched};
}
export const matchStatementRow=(userId,statementId,rowId,lineId)=>transactModules(userId,data=>{
 const s=data.statements.find(s=>s.id===statementId);if(!s || s.status!=='open')throw Error('Choose an open statement.');
 const row=s.rows.find(r=>r.id===rowId);if(!row)throw Error('Statement row not found.');
 if(lineId){
  const line=bookTransactions(data,s.accountId,s.end).find(l=>l.id===lineId);
  if(!line || cents(line.amount)!==cents(row.amount))throw Error('Match a book transaction on this account for the exact signed amount.');
  if(reconciledIds(data,s.accountId).has(lineId) || data.statements.some(x=>x.rows.some(r=>r.bookLineId===lineId && r.id!==rowId)))throw Error('This book transaction is already matched or reconciled.');
 }
 return [put('statements',{...s,rows:s.rows.map(r=>r.id===rowId?{...r,bookLineId:lineId || ''}:r)})];
});
export const finishReconciliation=(userId,statementId)=>transactModules(userId,data=>{
 const s=data.statements.find(s=>s.id===statementId);if(!s || s.status!=='open')throw Error('Choose an open statement.');
 const c=reconciliationCheck(data,s);
 if(c.prior && s.start<=c.prior.end)throw Error('Reconcile statements in chronological order without overlaps.');
 if(!c.openingMatches)throw Error('Opening balance must equal the previous reconciliation closing balance. For first use, create an opening reconciliation.');
 if(!c.allMatched || cents(c.difference)!==0)throw Error('Match every statement row and resolve the reconciliation difference to zero.');
 return [put('statements',{...s,status:'reconciled'}),put('reconciliations',{id:uid(),accountId:s.accountId,statementId:s.id,start:s.start,end:s.end,opening:s.opening,closing:s.closing,lineIds:c.lineIds,completedAt:new Date().toISOString(),kind:'statement'})];
});
export const openingReconciliation=(userId,input)=>transactModules(userId,data=>{
 account(data,input.accountId,['Asset','Liability']);
 if(!validDate(input.end))throw Error('Enter a valid opening reconciliation date.');
 if(data.reconciliations.some(r=>r.accountId===input.accountId))throw Error('An opening reconciliation already exists for this account.');
 const closing=moneyValue(input.closing),transactions=bookTransactions(data,input.accountId,input.end);
 if(transactions.reduce((n,t)=>n+cents(t.amount),0)!==cents(closing))throw Error('Opening reconciliation must equal the book balance on that date. Resolve outstanding items first or reconcile from the start of your books.');
 if(data.statements.some(s=>s.accountId===input.accountId && (s.start<=input.end || s.rows.some(r=>transactions.some(t=>t.id===r.bookLineId)))))throw Error('Opening reconciliation must precede imported statements and their matched transactions.');
 return [put('reconciliations',{id:uid(),accountId:input.accountId,statementId:'',start:input.end,end:input.end,opening:0,closing,lineIds:transactions.map(t=>t.id),completedAt:new Date().toISOString(),kind:'opening'})];
});
export const deleteStatement=(userId,id)=>transactModules(userId,data=>{
 if(!data.statements.some(s=>s.id===id && s.status==='open'))throw Error('Only open statements can be removed.');
 return [{type:'delete',collection:'statements',id2:id}];
});
