import {
  el,
  fmt,
  uid,
  safeNum,
  sum,
  todayISO, // This now works because of the fix in utils.js
  clampStr
} from "./utils.js";

import {
  signOutUser
} from "./db.js";

import {
  ledgerForAccount,
  trialBalance,
  balanceSheet,
  incomeStatement
} from "./accounting.js";

/**
 * UI Renderer
 * Handles routing + screens only
 */
export function createUI(state, { toast }) {
  const host = document.getElementById("routeHost");

  function clear() {
    host.innerHTML = "";
  }

  function render() {
    clear();
    const route = state.route || "dashboard";

    let view;
    switch (route) {
      case "journal":
        view = viewJournal(state);
        break;
      case "ledger":
        view = viewLedger(state);
        break;
      case "trial":
        view = viewTrial(state);
        break;
      case "bs":
        view = viewBalanceSheet(state);
        break;
      case "is":
        view = viewIncomeStatement(state);
        break;
      case "coa":
        view = viewChartOfAccounts(state);
        break;
      default:
        view = viewDashboard(state);
    }

    host.appendChild(view);
  }

  /* =========================
     DASHBOARD
  ========================= */
  function viewDashboard(state) {
    const { data } = state;

    const cash = data.accounts.filter(a => a.type === "asset");
    const liab = data.accounts.filter(a => a.type === "liability");

    const cashTotal = sum(cash, a => safeNum(a.balance));
    const liabTotal = sum(liab, a => safeNum(a.balance));

    return el(`
      <div class="card">
        <div class="cardHeader">
          <h2>Dashboard</h2>
          <p class="muted">Overview</p>
        </div>
        <div class="grid2">
          <div>
            <div class="small">Assets</div>
            <div class="bigNumber">${fmt.money(cashTotal)}</div>
          </div>
          <div>
            <div class="small">Liabilities</div>
            <div class="bigNumber">${fmt.money(liabTotal)}</div>
          </div>
        </div>
      </div>
    `);
  }

  /* =========================
     JOURNAL
  ========================= */
  function viewJournal(state) {
    const wrap = el(`<div></div>`);
    wrap.appendChild(el(`<div class="card"><h2>Journal Entry</h2></div>`));
    return wrap;
  }

  /* =========================
     LEDGER
  ========================= */
  function viewLedger(state) {
    const wrap = el(`<div></div>`);
    wrap.appendChild(el(`<div class="card"><h2>General Ledger</h2></div>`));
    return wrap;
  }

  /* =========================
     TRIAL BALANCE
  ========================= */
  function viewTrial(state) {
    const tb = trialBalance(
      state.data.accounts,
      state.data.journalHeaders,
      state.data.journalLines
    );

    const rows = tb.map(r => `
      <tr>
        <td>${r.name}</td>
        <td class="right">${fmt.money(r.debit)}</td>
        <td class="right">${fmt.money(r.credit)}</td>
      </tr>
    `).join("");

    return el(`
      <div class="card">
        <h2>Trial Balance</h2>
        <table class="table">
          <thead>
            <tr>
              <th>Account</th>
              <th class="right">Debit</th>
              <th class="right">Credit</th>
            </tr>
          </thead>
          <tbody>${rows}</tbody>
        </table>
      </div>
    `);
  }

  /* =========================
     BALANCE SHEET
  ========================= */
  function viewBalanceSheet(state) {
    const bs = balanceSheet(
      state.data.accounts,
      state.data.journalHeaders,
      state.data.journalLines
    );

    return el(`
      <div class="card">
        <h2>Balance Sheet</h2>
        <pre>${JSON.stringify(bs, null, 2)}</pre>
      </div>
    `);
  }

  /* =========================
     INCOME STATEMENT
  ========================= */
  function viewIncomeStatement(state) {
    const is = incomeStatement(
      state.data.accounts,
      state.data.journalHeaders,
      state.data.journalLines
    );

    return el(`
      <div class="card">
        <h2>Income Statement</h2>
        <pre>${JSON.stringify(is, null, 2)}</pre>
      </div>
    `);
  }

  /* =========================
     CHART OF ACCOUNTS
  ========================= */
  function viewChartOfAccounts(state) {
    const rows = state.data.accounts.map(a => `
      <tr>
        <td>${a.name}</td>
        <td>${a.type}</td>
        <td class="right">${fmt.money(a.balance || 0)}</td>
      </tr>
    `).join("");

    return el(`
      <div class="card">
        <h2>Chart of Accounts</h2>
        <table class="table">
          <thead>
            <tr>
              <th>Name</th>
              <th>Type</th>
              <th class="right">Balance</th>
            </tr>
          </thead>
          <tbody>${rows}</tbody>
        </table>
      </div>
    `);
  }

  return { render };
}
