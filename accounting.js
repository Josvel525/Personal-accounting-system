/** Pure double-entry calculations. Stored amounts remain dollars; arithmetic uses cents. */
import { groupBy } from './utils.js';
export const TYPES = ['Asset', 'Liability', 'Equity', 'Revenue', 'Expense'];
export const cents = value => Math.round(Number(value || 0) * 100);
export const dollars = value => value / 100;
export function normalizeAccounts(accounts) {
  return accounts.map(a => {
    const type = TYPES.find(t => t.toLowerCase() === String(a.type).toLowerCase()) || a.type;
    const normalBalance = ['debit','credit'].includes(String(a.normalBalance).toLowerCase())
      ? String(a.normalBalance).toLowerCase() === 'debit' ? 'Debit' : 'Credit'
      : ['Asset','Expense'].includes(type) ? 'Debit' : 'Credit';
    return {...a, type, normalBalance};
  });
}
export function validateEntry(lines = []) {
  const totalDebit = lines.reduce((n,l) => n + cents(l.debit), 0);
  const totalCredit = lines.reduce((n,l) => n + cents(l.credit), 0);
  const valid = lines.length >= 2 && lines.every(l => {
    const d = Number(l.debit || 0), c = Number(l.credit || 0);
    return Number.isFinite(d) && Number.isFinite(c) && d >= 0 && c >= 0
      && Math.abs(d * 100 - cents(d)) < 1e-6 && Math.abs(c * 100 - cents(c)) < 1e-6
      && Number.isSafeInteger(cents(d)) && Number.isSafeInteger(cents(c))
      && ((d > 0 && c === 0) || (c > 0 && d === 0));
  });
  return {ok: valid && totalDebit > 0 && totalDebit === totalCredit
    && Number.isSafeInteger(totalDebit), totalDebit: dollars(totalDebit), totalCredit: dollars(totalCredit)};
}
export function filterByDate(headers, lines, {start = null, end = null} = {}) {
  const hs = headers.filter(h => (!start || h.date >= start) && (!end || h.date <= end));
  const headerIds = new Set(hs.map(h => h.id));
  return {headers: hs, lines: lines.filter(l => headerIds.has(l.headerId)), headerIds};
}
export function accountBalances(accounts, headers, lines, opts) {
  const byAccount = groupBy(filterByDate(headers, lines, opts).lines, l => l.accountId);
  return new Map(normalizeAccounts(accounts).map(a => {
    const entries = byAccount.get(a.id) || [];
    const debit = entries.reduce((n,l) => n + cents(l.debit), 0);
    const credit = entries.reduce((n,l) => n + cents(l.credit), 0);
    return [a.id, {debit: dollars(debit), credit: dollars(credit),
      balance: dollars(a.normalBalance === 'Debit' ? debit-credit : credit-debit)}];
  }));
}
export function trialBalance(accounts, headers, lines, opts) {
  const balances = accountBalances(accounts, headers, lines, opts);
  // Disabled accounts keep their history and remain in every financial report.
  const rows = normalizeAccounts(accounts).map(account => {
    const b = balances.get(account.id);
    const net = cents(b.debit) - cents(b.credit);
    return {account, debit: dollars(Math.max(0,net)), credit: dollars(Math.max(0,-net))};
  });
  const d = rows.reduce((n,r) => n+cents(r.debit),0), c = rows.reduce((n,r) => n+cents(r.credit),0);
  return {rows,totalDebit:dollars(d),totalCredit:dollars(c),foots:d===c};
}
function reportRows(accounts, balances, type) {
  return accounts.filter(a=>a.type===type).map(account => {
    const b = balances.get(account.id);
    const net = cents(b.debit)-cents(b.credit);
    return {account, amount:dollars(['Asset','Expense'].includes(type) ? net : -net)};
  });
}
const total = rows => dollars(rows.reduce((n,r)=>n+cents(r.amount),0));
export function incomeStatement(accounts, headers, lines, opts) {
  const accs = normalizeAccounts(accounts), balances = accountBalances(accs,headers,lines,opts);
  const revenue=reportRows(accs,balances,'Revenue'), expenses=reportRows(accs,balances,'Expense');
  const totalRevenue=total(revenue), totalExpense=total(expenses);
  return {revenue,expenses,totalRevenue,totalExpense,netIncome:dollars(cents(totalRevenue)-cents(totalExpense))};
}
export function balanceSheet(accounts, headers, lines, opts = {}) {
  const accs=normalizeAccounts(accounts), asOf={end:opts.end || null};
  const balances=accountBalances(accs,headers,lines,asOf);
  const assets=reportRows(accs,balances,'Asset'), liabilities=reportRows(accs,balances,'Liability');
  const equity=reportRows(accs,balances,'Equity');
  const cumulativeNetIncome=incomeStatement(accs,headers,lines,asOf).netIncome;
  // Include unclosed earnings even when no account named "Retained Earnings" exists.
  equity.push({account:{id:'__unclosed_earnings',name:'Unclosed earnings',type:'Equity'},amount:cumulativeNetIncome});
  const totalAssets=total(assets), totalLiabilities=total(liabilities), totalEquity=total(equity);
  const delta=cents(totalAssets)-cents(totalLiabilities)-cents(totalEquity);
  return {assets,liabilities,equity,totalAssets,totalLiabilities,totalEquity,cumulativeNetIncome,
    balanced:delta===0,equationDelta:dollars(delta)};
}
export function ledgerForAccount(accountId, lines = []) { return lines.filter(l=>l.accountId===accountId); }
export function ledgerByAccount(accounts,headers,lines,opts) {
  const filtered=filterByDate(headers,lines,opts).lines, heads=new Map(headers.map(h=>[h.id,h]));
  return normalizeAccounts(accounts).map(account=>({account,entries:filtered.filter(l=>l.accountId===account.id)
    .map(l=>({...l,date:heads.get(l.headerId)?.date || '',memo:heads.get(l.headerId)?.memo || '',ref:heads.get(l.headerId)?.ref || ''}))
    .sort((a,b)=>a.date.localeCompare(b.date))})).filter(a=>opts?.includeEmpty || a.entries.length);
}
