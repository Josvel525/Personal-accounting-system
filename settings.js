import {validDate} from './utils.js';
export const EXTRA_COLLECTIONS=['preferences','vendors','invoices','payments','expenses','statements','reconciliations'];
export const COLLECTIONS=['accounts','journalHeaders','journalLines',...EXTRA_COLLECTIONS];
export const DEFAULT_SETTINGS={id:'master',bookName:'Personal Accounting',density:'compact',pageSize:25,fiscalMonth:1,closedThrough:'',requireMemo:false,referencePrefix:'',showInactive:true,dashboardCount:10,expenseAccount:'',paymentAccount:'',payableAccount:'',dueDays:30,reconcileAccount:'',trialZero:true,bsZero:true,isZero:true,ledgerEmpty:true,isPeriod:'all',ledgerPeriod:'all',printLandscape:false};
export const settingsFor=data=>({...DEFAULT_SETTINGS,...data.preferences?.find(p=>p.id==='master')});
export function completeData(data={}){return Object.fromEntries(COLLECTIONS.map(name=>[name,data[name] || []]));}
export function validateSettings(value,data){
 const s={...DEFAULT_SETTINGS,...value,id:'master'};
 s.bookName=String(s.bookName).trim().slice(0,100);s.referencePrefix=String(s.referencePrefix).trim().slice(0,30);
 if(!s.bookName)throw Error('Enter a book name.');
 if(!['compact','comfortable'].includes(s.density))throw Error('Choose a display density.');
 for(const [key,min,max] of [['pageSize',10,100],['fiscalMonth',1,12],['dashboardCount',1,50],['dueDays',0,365]]){s[key]=Number(s[key]);if(!Number.isInteger(s[key]) || s[key]<min || s[key]>max)throw Error(`Invalid setting: ${key}.`);}
 if(s.closedThrough && !validDate(s.closedThrough))throw Error('Choose a valid closing date.');
 for(const key of ['isPeriod','ledgerPeriod'])if(!['all','month','year','fiscal'].includes(s[key]))throw Error('Invalid report period.');
 for(const key of ['requireMemo','showInactive','trialZero','bsZero','isZero','ledgerEmpty','printLandscape'])s[key]=!!s[key];
 for(const [key,types] of [['expenseAccount',['Expense']],['paymentAccount',['Asset','Liability']],['payableAccount',['Liability']],['reconcileAccount',['Asset','Liability']]])if(s[key] && !data.accounts.some(a=>a.id===s[key] && types.includes(a.type)))throw Error(`Choose a valid ${key}.`);
 return s;
}
export function periodStart(period,today,fiscalMonth=1){
 if(period==='all')return '';
 if(period==='month')return today.slice(0,7)+'-01';
 const year=Number(today.slice(0,4));
 if(period==='year')return `${year}-01-01`;
 return `${year-(Number(today.slice(5,7))<fiscalMonth?1:0)}-${String(fiscalMonth).padStart(2,'0')}-01`;
}
