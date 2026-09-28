export const MODULES=[
 {id:'gl',name:'General Ledger',description:'Maintain accounts, post entries, and review your books.',pages:[['coa','Chart of Accounts'],['journal','Journal Entry'],['review','Review Journal'],['ledger','General Ledger']]},
 {id:'reports',name:'Reports',description:'Financial statements and accounts payable reporting.',pages:[['trial','Trial Balance'],['bs','Balance Sheet'],['is','Income Statement'],['aging','AP Aging']]},
 {id:'expenseHub',name:'Expenses',description:'Invoices, daily expenses, bank activity, and reconciliation.',pages:[['vendors','Vendors'],['invoices','Accounts Payable'],['payments','Invoice Payments'],['expenses','Daily Expenses'],['transfers','Transfers & Card Payments'],['statements','Bank & Card Statements'],['reconcile','Reconciliation']]},
 {id:'settings',name:'Master Settings',description:'Control defaults, reporting, posting periods, and local backups.',pages:[]}
];
export const routeTitle=route=>route==='dashboard'?'Dashboard':MODULES.find(m=>m.id===route)?.name || MODULES.flatMap(m=>m.pages).find(p=>p[0]===route)?.[1] || 'Dashboard';
export const moduleFor=route=>MODULES.find(m=>m.id===route || m.pages.some(p=>p[0]===route));
