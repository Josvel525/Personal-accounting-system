import {readCSV,encodeCSV} from './csv-utils.js';
import {completeData} from './settings.js';
import {TYPES} from './accounting.js';
import {accountOperations,journalOperations,transactBooks,transactModules,LOCAL_UID} from './db.js';
import {saveVendorOperations,postInvoiceOperations,payInvoiceOperations,postExpenseOperations,postTransferOperations,importStatementOperations} from './operations.js';
export const CSV_TYPES={
 accounts:{title:'Chart of Accounts',headers:['code','name','type','normal_balance','is_active'],required:['code','name','type'],help:'One account per row. Types: Asset, Liability, Equity, Revenue, Expense. normal_balance: Debit or Credit (blank uses the type default). is_active: true or false (blank is true). Account codes must be unique. Opening balances belong in Journal Entry.'},
 vendors:{title:'Vendors / AP Vendors',headers:['name','email','notes'],required:['name'],help:'One vendor per row. Name is required and must be unique. Email and notes may be blank. These vendors are shared with Accounts Payable.'},
 journal:{title:'Journal Entries',headers:['entry_id','date','reference','memo','account_code','debit','credit'],required:['entry_id','date','account_code','debit','credit'],help:'One journal line per row. Repeat entry_id, date, reference, and memo for all lines in the same entry. Each entry needs at least two lines with equal debit and credit totals. Fill only debit or credit on each line; leave the other blank. Keep entry_id unique across imports.'},
 invoices:{title:'AP Invoices',headers:['import_id','vendor_name','invoice_number','date','due_date','amount','expense_account_code','payable_account_code','memo'],required:['import_id','vendor_name','invoice_number','date','due_date','amount','expense_account_code','payable_account_code'],help:'One invoice per row. Import vendors and accounts first. Match the vendor name and account codes in your books. Amount must be positive. Payable account must be a Liability. Due date cannot precede invoice date. Use a unique import_id for each invoice.'},
 payments:{title:'Invoice Payments',headers:['import_id','vendor_name','invoice_number','date','amount','payment_account_code','reference'],required:['import_id','vendor_name','invoice_number','date','amount','payment_account_code'],help:'One payment per row. vendor_name + invoice_number identify an existing invoice. Partial payments are allowed; the total cannot exceed its unpaid balance. Amount must be positive. Use a unique import_id for each payment.'},
 expenses:{title:'Daily Expenses',headers:['import_id','date','payee','amount','payment_method','expense_account_code','payment_account_code','reference','memo'],required:['import_id','date','payee','amount','payment_method','expense_account_code','payment_account_code'],help:'One expense per row. payment_method: bank, debit, credit, or cash. Use an Asset payment account for bank/debit/cash, or a Liability for credit cards. Amount must be positive. Use a unique import_id for each expense.'},
 transfers:{title:'Transfers & Card Payments',headers:['import_id','date','amount','from_account_code','to_account_code','reference','memo'],required:['import_id','date','amount','from_account_code','to_account_code'],help:'One transfer per row. From account must be an Asset. To account may be an Asset or Liability, including a credit card. Amount must be positive. Use a unique import_id for each transfer.'},
 statements:{title:'Bank & Card Statements',headers:['statement_id','account_code','statement_name','period_start','period_end','opening_balance','closing_balance','date','description','amount'],required:['statement_id','account_code','period_start','period_end','opening_balance','closing_balance','date','description','amount'],help:'One bank transaction per row. Repeat the statement_id and statement details on each row of that statement. Bank deposits are positive; withdrawals negative. For credit-card accounts, charges are positive and payments negative. Opening + transactions must equal closing. Importing does not post ledger entries.'}
};
export const templateCSV=kind=>encodeCSV(CSV_TYPES[kind].headers);
const textLimits={code:30,name:120,email:160,notes:500,entry_id:100,import_id:100,statement_id:100,reference:100,memo:500,vendor_name:120,invoice_number:80,payee:120,statement_name:120,description:300};
function accountId(data,code){const matches=data.accounts.filter(a=>a.code===code);if(matches.length!==1)throw Error(`Account code "${code}" ${matches.length?'is ambiguous':'was not found'}. Import accounts first.`);return matches[0].id;}
function vendorId(data,name){const matches=data.vendors.filter(v=>v.name.toLowerCase()===name.toLowerCase());if(matches.length!==1)throw Error(`Vendor "${name}" ${matches.length?'is ambiguous':'was not found'}. Import vendors first.`);return matches[0].id;}
const decimal=(v,blank=false)=>{if(blank && v==='')return '';if(!/^-?\d+(\.\d{1,2})?$/.test(v))throw Error(`Invalid amount "${v}". Use plain numbers with at most two decimals, without currency symbols or thousands separators.`);return v;};
function entryInput(kind,v,d){
 const acc=key=>accountId(d,v[key]);
 if(kind==='accounts'){
  const type=TYPES.find(t=>t.toLowerCase()===v.type.toLowerCase());if(!type)throw Error('type must be Asset, Liability, Equity, Revenue, or Expense.');
  const normal=v.normal_balance || '';if(normal && !['debit','credit'].includes(normal.toLowerCase()))throw Error('normal_balance must be Debit or Credit.');
  const active=(v.is_active || 'true').toLowerCase();if(!['true','false','yes','no','1','0'].includes(active))throw Error('is_active must be true or false.');
  return accountOperations(d,{code:v.code,name:v.name,type,normalBalance:normal || undefined,isActive:['true','yes','1'].includes(active)});
 }
 if(kind==='vendors'){if(v.email && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(v.email))throw Error('Enter a valid email address or leave email blank.');return saveVendorOperations(d,v);}
 const amount=decimal(v.amount);
 if(kind==='invoices')return postInvoiceOperations(d,{vendorId:vendorId(d,v.vendor_name),number:v.invoice_number,date:v.date,dueDate:v.due_date,amount,expenseAccount:acc('expense_account_code'),payableAccount:acc('payable_account_code'),memo:v.memo});
 if(kind==='payments'){
  const vid=vendorId(d,v.vendor_name),invoice=d.invoices.find(i=>i.vendorId===vid && i.number.toLowerCase()===v.invoice_number.toLowerCase());if(!invoice)throw Error(`Invoice "${v.invoice_number}" was not found for this vendor.`);
  return payInvoiceOperations(d,{invoiceId:invoice.id,date:v.date,amount,paymentAccount:acc('payment_account_code'),reference:v.reference});
 }
 if(kind==='expenses')return postExpenseOperations(d,{date:v.date,payee:v.payee,amount,method:v.payment_method.toLowerCase(),expenseAccount:acc('expense_account_code'),paymentAccount:acc('payment_account_code'),reference:v.reference,memo:v.memo});
 if(kind==='transfers')return postTransferOperations(d,{date:v.date,amount,fromAccount:acc('from_account_code'),toAccount:acc('to_account_code'),reference:v.reference,memo:v.memo});
 throw Error('Unknown import type.');
}
export class CSVImportError extends Error {constructor(errors){super(errors.map(e=>`Line ${e.line}: ${e.message}`).join('\n'));this.name='CSVImportError';this.errors=errors;}}
export function prepareCSVImport(kind,text,current,{cloud=false}={}){
 const schema=CSV_TYPES[kind];if(!schema)throw Error('Choose a supported CSV import.');
 const parsed=readCSV(text);const missing=schema.required.filter(h=>!parsed.headers.includes(h)),unknown=parsed.headers.filter(h=>!schema.headers.includes(h));
 if(missing.length || unknown.length)throw Error([missing.length?`Missing columns: ${missing.join(', ')}.`:'',unknown.length?`Unexpected columns: ${unknown.join(', ')}. Download this module’s template.`:''].filter(Boolean).join(' '));
 const errors=[],records=parsed.records.map(r=>({...r,values:Object.fromEntries(schema.headers.map(h=>[h,r.values[h] || '']))}));
 for(const r of records)for(const [key,value] of Object.entries(r.values)){if(textLimits[key] && value.length>textLimits[key])errors.push({line:r.line,message:`${key} exceeds ${textLimits[key]} characters.`});if(schema.required.includes(key) && !value && !['debit','credit'].includes(key))errors.push({line:r.line,message:`${key} is required.`});}
 if(errors.length)throw new CSVImportError(errors);
 const grouped=kind==='journal' || kind==='statements',groups=new Map();
 for(const r of records){const key=grouped?r.values[kind==='journal'?'entry_id':'statement_id']:String(r.line);if(!groups.has(key))groups.set(key,[]);groups.get(key).push(r);}
 const d=structuredClone(completeData(current)),ops=[];let count=0;
 for(const rows of groups.values()){
  const {values:v,line}=rows[0];
  try{
   const external=kind==='journal'?v.entry_id:kind==='statements'?v.statement_id:v.import_id;
   const key=external?`${kind}:${external}`:'';
   if(key && [...d.journalHeaders,...d.statements].some(x=>x.csvImportKey===key))throw Error(`Import ID "${external}" was already used. Nothing from this file will be imported.`);
   let next;
   if(grouped){
    const consistent=kind==='journal'?['date','reference','memo']:['account_code','statement_name','period_start','period_end','opening_balance','closing_balance'];
    for(const r of rows)if(consistent.some(h=>r.values[h]!==v[h]))throw Error(`Inconsistent details in group "${external}" (line ${r.line}). Repeat the same group details on every row.`);
    if(kind==='journal')next=journalOperations(d,{date:v.date,ref:v.reference,memo:v.memo,lines:rows.map(r=>({accountId:accountId(d,r.values.account_code),debit:decimal(r.values.debit,true),credit:decimal(r.values.credit,true)}))},'journal');
    else next=importStatementOperations(d,{accountId:accountId(d,v.account_code),name:v.statement_name,start:v.period_start,end:v.period_end,opening:decimal(v.opening_balance),closing:decimal(v.closing_balance),csv:encodeCSV(['date','description','amount'],rows.map(r=>[r.values.date,r.values.description,decimal(r.values.amount)]))});
   }else next=entryInput(kind,v,d);
   for(const op of next){if(key && ['journalHeaders','statements'].includes(op.collection))op.data.csvImportKey=key;const list=d[op.collection],index=list.findIndex(x=>x.id===op.id2);if(index>=0)list[index]=op.data;else list.push(op.data);}
   ops.push(...next);count++;
  }catch(e){errors.push({line,message:e.message});}
 }
 if(errors.length)throw new CSVImportError(errors);
 if(cloud && ops.length>450)throw Error(`This file creates ${ops.length} records. For one atomic cloud save, split it into files creating at most 450 records (roughly 100 invoice/payment rows or 150 two-line journals). Local mode supports up to 2,000 CSV rows.`);
 return {ops,count,rowCount:records.length,headers:schema.headers,preview:records.slice(0,20).map(r=>r.values)};
}
export async function importCSV(userId,kind,text){
 const transact=['accounts','journal'].includes(kind)?transactBooks:transactModules;
 return transact(userId,data=>prepareCSVImport(kind,text,data,{cloud:userId!==LOCAL_UID}).ops);
}
