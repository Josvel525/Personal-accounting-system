/**
 * accounting.js (pure functions)
 * Real double-entry rollups: Trial Balance, Income Statement, Balance Sheet
 */

import { safeNum, sum, groupBy } from "./utils.js";

export function validateEntry(lines) {
  const totalDebit = sum(lines, (l) => safeNum(l.debit));
  const totalCredit = sum(lines, (l) => safeNum(l.credit));
  const ok = Math.abs(totalDebit - totalCredit) < 0.000001 && totalDebit > 0;
  return { ok, totalDebit, totalCredit };
}

export function normalizeAccounts(accounts) {
  return accounts.map((a) => {
    let nb = a.normalBalance;
    if (!nb) nb = (a.type === "Asset" || a.type === "Expense") ? "Debit" : "Credit";
    return { ...a, normalBalance: nb };
  });
}

export function filterByDate(headers, lines, { start = null, end = null } = {}) {
  const hs = headers.filter((h) => {
    if (start && h.date < start) return false;
    if (end && h.date > end) return false;
    return true;
  });
  const headerIds = new Set(hs.map((h) => h.id));
  const ls = lines.filter((l) => headerIds.has(l.headerId));
  return { headers: hs, lines: ls, headerIds };
}

export function accountBalances(accounts, headers, lines, opts) {
  const accs = normalizeAccounts(accounts);
  const { lines: flines } = filterByDate(headers, lines, opts);
  const byAcc = groupBy(flines, (l) => l.accountId);

  const balances = new Map();
  for (const a of accs) {
    const arr = byAcc.get(a.id) || [];
    const deb = sum(arr, (x) => safeNum(x.debit));
    const cred = sum(arr, (x) => safeNum(x.credit));
    const bal = (a.normalBalance === "Debit") ? (deb - cred) : (cred - deb);
    balances.set(a.id, { debit: deb, credit: cred, balance: bal });
  }
  return balances;
}

export function trialBalance(accounts, headers, lines, opts) {
  const accs = normalizeAccounts(accounts).filter((a) => a.isActive !== false);
  const balances = accountBalances(accs, headers, lines, opts);

  const rows = accs.map((a) => {
    const bal = safeNum(balances.get(a.id)?.balance || 0);

    // show positive debits/credits in TB columns
    const debit = (a.normalBalance === "Debit") ? Math.max(0, bal) : Math.max(0, -bal);
    const credit = (a.normalBalance === "Credit") ? Math.max(0, bal) : Math.max(0, -bal);

    return { account: a, debit, credit };
  });

  const totalDebit = sum(rows, (r) => r.debit);
  const totalCredit = sum(rows, (r) => r.credit);
  const foots = Math.abs(totalDebit - totalCredit) < 0.000001;

  return { rows, totalDebit, totalCredit, foots };
}

export function incomeStatement(accounts, headers, lines, opts) {
  const accs = normalizeAccounts(accounts).filter((a) => a.isActive !== false);
  const balances = accountBalances(accs, headers, lines, opts);

  const revenue = accs
    .filter((a) => a.type === "Revenue")
    .map((a) => ({ account: a, amount: safeNum(balances.get(a.id)?.balance || 0) }));

  const expenses = accs
    .filter((a) => a.type === "Expense")
    .map((a) => ({ account: a, amount: safeNum(balances.get(a.id)?.balance || 0) }));

  const totalRevenue = sum(revenue, (x) => x.amount);
  const totalExpense = sum(expenses, (x) => x.amount);
  const netIncome = totalRevenue - totalExpense;

  return { revenue, expenses, totalRevenue, totalExpense, netIncome };
}

export function balanceSheet(accounts, headers, lines, opts) {
  const accs = normalizeAccounts(accounts).filter((a) => a.isActive !== false);
  const balances = accountBalances(accs, headers, lines, opts);

  const assets = accs
    .filter((a) => a.type === "Asset")
    .map((a) => ({ account: a, amount: safeNum(balances.get(a.id)?.balance || 0) }));

  const liabilities = accs
    .filter((a) => a.type === "Liability")
    .map((a) => ({ account: a, amount: safeNum(balances.get(a.id)?.balance || 0) }));

  const equityBase = accs
    .filter((a) => a.type === "Equity")
    .map((a) => ({ account: a, amount: safeNum(balances.get(a.id)?.balance || 0) }));

  const totalAssets = sum(assets, (x) => x.amount);
  const totalLiabilities = sum(liabilities, (x) => x.amount);

  // Add cumulative net income into Retained Earnings display (personal-friendly roll-up)
  const end = opts?.end || null;
  const cumulative = incomeStatement(accs, headers, lines, { start: null, end });
  const cumNet = safeNum(cumulative.netIncome);

  const equity = equityBase.map((x) => ({ ...x }));
  const reIdx = equity.findIndex(
    (x) => x.account.name.toLowerCase() === "retained earnings"
  );
  if (reIdx >= 0) equity[reIdx].amount = safeNum(equity[reIdx].amount) + cumNet;

  const totalEquity = sum(equity, (x) => x.amount);
  const balanced = Math.abs(totalAssets - (totalLiabilities + totalEquity)) < 0.000001;

  return {
    assets,
    liabilities,
    equity,
    totalAssets,
    totalLiabilities,
    totalEquity,
    balanced,
    equationDelta: totalAssets - (totalLiabilities + totalEquity),
    cumulativeNetIncome: cumNet,
  };
}

export function ledgerByAccount(accounts, headers, lines, opts) {
  const { lines: flines } = filterByDate(headers, lines, opts);
  const accMap = new Map(accounts.map((a) => [a.id, a]));
  const headMap = new Map(headers.map((h) => [h.id, h]));
  const grouped = groupBy(flines, (l) => l.accountId);

  const out = [];
  for (const [accountId, arr] of grouped.entries()) {
    const acc = accMap.get(accountId);
    if (!acc) continue;
    out.push({
      account: acc,
      entries: arr
        .map((l) => ({
          date: headMap.get(l.headerId)?.date || "",
          memo: headMap.get(l.headerId)?.memo || "",
          ref: headMap.get(l.headerId)?.ref || "",
          debit: safeNum(l.debit),
          credit: safeNum(l.credit),
          headerId: l.headerId,
        }))
        .sort((a, b) => String(a.date).localeCompare(String(b.date))),
    });
  }

  // optional include empty
  if (opts?.includeEmpty) {
    for (const a of accounts) {
      if (!out.find((x) => x.account.id === a.id)) {
        out.push({ account: a, entries: [] });
      }
    }
  }

  return out.sort((a, b) => {
    const ta = `${a.account.type}|${a.account.name}`.toLowerCase();
    const tb = `${b.account.type}|${b.account.name}`.toLowerCase();
    return ta.localeCompare(tb);
  });
}