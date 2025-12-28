import { el, fmt, uid, safeNum, sum, todayISO, clampStr } from "./utils.js";
import {
  validateEntry,
  trialBalance,
  incomeStatement,
  balanceSheet,
  ledgerByAccount,
} from "./accounting.js";
import {
  upsertAccount,
  deleteAccount,
  upsertJournalEntry,
  deleteJournalEntry,
  flushQueue,
  getQueueSize,
} from "./db.js";

export function createUI({ getState, setRoute, openModal, closeModal, toast, setSyncText }) {
  const host = document.getElementById("routeHost");

  function render() {
    const state = getState();
    host.innerHTML = "";

    // highlight active nav
    document.querySelectorAll(".navItem").forEach((b) => {
      b.classList.toggle("active", b.dataset.route === state.route);
    });

    const viewMap = {
      dashboard: viewDashboard,
      journal: viewJournal,
      ledger: viewLedger,
      trial: viewTrial,
      bs: viewBalanceSheet,
      is: viewIncomeStatement,
      coa: viewCOA,
      settings: viewSettings,
    };

    host.appendChild((viewMap[state.route] || viewDashboard)(state));
  }

  function dateRangeBar(state) {
    const start = state.filters?.start || "";
    const end = state.filters?.end || todayISO();

    const bar = el(`
      <div class="card" style="margin-bottom:12px;">
        <div class="row" style="justify-content:space-between;">
          <div class="row">
            <span class="badge">Date Range</span>
            <span class="small">Applies to statements + ledger filters</span>
          </div>
          <div class="row">
            <button class="btn secondary" type="button" data-preset="this">This Month</button>
            <button class="btn secondary" type="button" data-preset="last">Last Month</button>
            <button class="btn secondary" type="button" data-preset="ytd">YTD</button>
          </div>
        </div>

        <div class="row" style="margin-top:10px;">
          <div class="field" style="min-width:170px;">
            <label>Start</label>
            <input type="date" id="rngStart" value="${start}" />
          </div>
          <div class="field" style="min-width:170px;">
            <label>End</label>
            <input type="date" id="rngEnd" value="${end}" />
          </div>
          <div class="spacer"></div>
          <button class="btn" type="button" id="applyRange">Apply</button>
          <button class="btn ghost" type="button" id="clearRange">Clear</button>
        </div>
      </div>
    `);

    const startEl = bar.querySelector("#rngStart");
    const endEl = bar.querySelector("#rngEnd");

    function setPreset(p) {
      const now = new Date();
      const y = now.getFullYear();
      const m = now.getMonth();

      let s = null, e = null;
      if (p === "this") {
        s = new Date(y, m, 1);
        e = new Date(y, m + 1, 0);
      } else if (p === "last") {
        s = new Date(y, m - 1, 1);
        e = new Date(y, m, 0);
      } else if (p === "ytd") {
        s = new Date(y, 0, 1);
        e = now;
      }
      startEl.value = fmt.dateISO(s);
      endEl.value = fmt.dateISO(e);
    }

    bar.querySelectorAll("[data-preset]").forEach((b) => {
      b.onclick = () => setPreset(b.dataset.preset);
    });

    bar.querySelector("#applyRange").onclick = () => {
      state.filters = state.filters || {};
      state.filters.start = startEl.value || null;
      state.filters.end = endEl.value || null;
      toast("Range applied.");
      render();
    };

    bar.querySelector("#clearRange").onclick = () => {
      state.filters = { start: null, end: null };
      toast("Range cleared.", "warn");
      render();
    };

    return bar;
  }

  function viewDashboard(state) {
    const { data } = state;
    const end = state.filters?.end || todayISO();

    const bs = balanceSheet(data.accounts, data.journalHeaders, data.journalLines, { end });
    const is = incomeStatement(
      data.accounts,
      data.journalHeaders,
      data.journalLines,
      { start: state.filters?.start || null, end: state.filters?.end || null }
    );

    const recent = [...data.journalHeaders]
      .sort((a, b) => String(b.date).localeCompare(String(a.date)))
      .slice(0, 10);

    const wrap = el(`<div></div>`);
    wrap.appendChild(dateRangeBar(state));

    const panel = el(`
      <div class="split">
        <div class="card">
          <div class="cardHeader">
            <h2>Snapshot</h2>
            <p class="muted">As of <b>${end}</b></p>
          </div>

          <div class="row">
            <div>
              <div class="small">Total Assets</div>
              <div class="bigNumber">${fmt.money(bs.totalAssets)}</div>
            </div>
            <div>
              <div class="small">Total Liabilities</div>
              <div class="bigNumber">${fmt.money(bs.totalLiabilities)}</div>
            </div>
            <div>
              <div class="small">Total Equity</div>
              <div class="bigNumber">${fmt.money(bs.totalEquity)}</div>
            </div>

            <div class="spacer"></div>
            <span class="badge ${bs.balanced ? "good" : "bad"}">
              ${bs.balanced ? "Balanced" : "Out of balance"}
            </span>
          </div>

          <div class="hr"></div>

          <div class="row">
            <div>
              <div class="small">Net Income (range)</div>
              <div class="bigNumber">${fmt.money(is.netIncome)}</div>
            </div>
            <div>
              <div class="small">Revenue</div>
              <div class="bigNumber">${fmt.money(is.totalRevenue)}</div>
            </div>
            <div>
              <div class="small">Expenses</div>
              <div class="bigNumber">${fmt.money(is.totalExpense)}</div>
            </div>
          </div>

          <div class="hr"></div>

          <div class="row">
            <button class="btn" id="btnNewJE" type="button">New Journal Entry</button>
            <button class="btn secondary" id="btnTB" type="button">Trial Balance</button>
            <button class="btn secondary" id="btnBS" type="button">Balance Sheet</button>
            <button class="btn secondary" id="btnIS" type="button">Income Statement</button>
          </div>

          ${!bs.balanced ? `<div class="alert bad"><b>Warning:</b> Balance Sheet is off by ${fmt.money(bs.equationDelta)}. Check Trial Balance / entries.</div>` : ""}
        </div>

        <div class="card">
          <div class="cardHeader">
            <h2>Recent Entries</h2>
            <p class="muted">Tap one to edit/delete.</p>
          </div>
          <table class="table">
            <thead>
              <tr>
                <th class="nowrap">Date</th>
                <th>Memo</th>
                <th class="right nowrap">Lines</th>
              </tr>
            </thead>
            <tbody id="recentBody"></tbody>
          </table>
        </div>
      </div>
    `);

    panel.querySelector("#btnNewJE").onclick = () => setRoute("journal");
    panel.querySelector("#btnTB").onclick = () => setRoute("trial");
    panel.querySelector("#btnBS").onclick = () => setRoute("bs");
    panel.querySelector("#btnIS").onclick = () => setRoute("is");

    const tb = panel.querySelector("#recentBody");
    for (const h of recent) {
      const lineCount = data.journalLines.filter((l) => l.headerId === h.id).length;
      const tr = el(`
        <tr style="cursor:pointer;">
          <td class="nowrap">${h.date}</td>
          <td>${(h.memo || "").slice(0, 80)}</td>
          <td class="right">${lineCount}</td>
        </tr>
      `);
      tr.onclick = () => openEditEntry(state, h.id);
      tb.appendChild(tr);
    }

    wrap.appendChild(panel);
    return wrap;
  }

  function openEditEntry(state, headerId) {
    const { data } = state;
    const h = data.journalHeaders.find((x) => x.id === headerId);
    if (!h) return toast("Entry not found.", "bad");
    const lines = data.journalLines.filter((l) => l.headerId === headerId);

    const accounts = data.accounts
      .filter((a) => a.isActive !== false)
      .sort((a, b) => a.name.localeCompare(b.name));

    const body = el(`
      <div>
        <div class="grid2">
          <div class="field">
            <label>Date</label>
            <input type="date" id="eDate" value="${h.date}" />
          </div>
          <div class="field">
            <label>Reference (optional)</label>
            <input id="eRef" value="${h.ref || ""}" placeholder="e.g., Venmo, Receipt #..." />
          </div>
        </div>

        <div class="field" style="margin-top:10px;">
          <label>Memo</label>
          <textarea id="eMemo" placeholder="Describe the entry...">${h.memo || ""}</textarea>
        </div>

        <div class="hr"></div>

        <div class="row" style="justify-content:space-between;">
          <b>Lines</b>
          <button class="btn secondary" type="button" id="addLine">+ Add line</button>
        </div>

        <div id="linesHost" style="margin-top:10px;"></div>

        <div class="row" style="margin-top:10px;">
          <span class="badge" id="totalsBadge">Totals</span>
        </div>
      </div>
    `);

    const footer = el(`
      <div class="row">
        <button class="btn secondary" id="btnDelete">Delete</button>
        <div class="spacer"></div>
        <button class="btn ghost" id="btnCancel">Cancel</button>
        <button class="btn" id="btnSave">Save</button>
      </div>
    `);

    openModal("Edit Journal Entry", body, footer);

    const linesHost = body.querySelector("#linesHost");
    const working = lines.map((x) => ({
      id: x.id,
      headerId: x.headerId,
      accountId: x.accountId,
      debit: safeNum(x.debit),
      credit: safeNum(x.credit),
      createdAt: x.createdAt,
    }));

    function renderLines() {
      linesHost.innerHTML = "";
      for (const l of working) {
        const row = el(`
          <div class="row" style="margin-bottom:8px; align-items:flex-end;">
            <div class="field" style="flex:1; min-width: 220px;">
              <label>Account</label>
              <select></select>
            </div>
            <div class="field" style="width:140px;">
              <label>Debit</label>
              <input inputmode="decimal" placeholder="0.00" />
            </div>
            <div class="field" style="width:140px;">
              <label>Credit</label>
              <input inputmode="decimal" placeholder="0.00" />
            </div>
            <button class="btn ghost" type="button">Remove</button>
          </div>
        `);

        const sel = row.querySelector("select");
        for (const a of accounts) {
          sel.appendChild(el(`<option value="${a.id}">${a.name} • ${a.type}</option>`));
        }
        sel.value = l.accountId;

        const dIn = row.querySelectorAll("input")[0];
        const cIn = row.querySelectorAll("input")[1];
        dIn.value = l.debit ? String(l.debit) : "";
        cIn.value = l.credit ? String(l.credit) : "";

        sel.onchange = () => {
          l.accountId = sel.value;
          updateTotals();
        };
        dIn.oninput = () => {
          l.debit = safeNum(dIn.value);
          updateTotals();
        };
        cIn.oninput = () => {
          l.credit = safeNum(cIn.value);
          updateTotals();
        };

        row.querySelector("button").onclick = () => {
          const idx = working.findIndex((x) => x.id === l.id);
          if (idx >= 0) working.splice(idx, 1);
          renderLines();
          updateTotals();
        };

        linesHost.appendChild(row);
      }
    }

    function updateTotals() {
      const v = validateEntry(working);
      const badge = body.querySelector("#totalsBadge");
      badge.className = `badge ${v.ok ? "good" : "bad"}`;
      badge.textContent = `Debits ${fmt.money(v.totalDebit)} • Credits ${fmt.money(v.totalCredit)} ${
        v.ok ? "• OK" : "• Not balanced"
      }`;
    }

    renderLines();
    updateTotals();

    body.querySelector("#addLine").onclick = () => {
      if (!accounts.length) return toast("No active accounts. Add accounts first.", "bad");
      working.push({
        id: uid(),
        headerId,
        accountId: accounts[0].id,
        debit: 0,
        credit: 0,
        createdAt: Date.now(),
      });
      renderLines();
      updateTotals();
    };

    footer.querySelector("#btnCancel").onclick = closeModal;

    footer.querySelector("#btnSave").onclick = async () => {
      const header = {
        id: headerId,
        date: body.querySelector("#eDate").value || todayISO(),
        ref: clampStr(body.querySelector("#eRef").value, 60),
        memo: clampStr(body.querySelector("#eMemo").value, 220),
        createdAt: h.createdAt,
      };

      const v = validateEntry(working);
      if (!v.ok) return toast("Debits must equal credits (and be > 0).", "bad");

      try {
        await upsertJournalEntry(state.user.uid, header, working);
        toast("Saved.");
        closeModal();
        await state.reload();
      } catch (e) {
        toast(`Save failed: ${e?.message || e}`, "bad");
      }
    };

    footer.querySelector("#btnDelete").onclick = async () => {
      try {
        await deleteJournalEntry(state.user.uid, headerId);
        toast("Deleted (or queued if offline).", "warn");
        closeModal();
        await state.reload();
      } catch (e) {
        toast(`Delete failed: ${e?.message || e}`, "bad");
      }
    };
  }

  function viewJournal(state) {
    const { data } = state;
    const accounts = data.accounts
      .filter((a) => a.isActive !== false)
      .sort((a, b) => a.name.localeCompare(b.name));

    const wrap = el(`<div></div>`);
    wrap.appendChild(dateRangeBar(state));

    const card = el(`
      <div class="card">
        <div class="cardHeader">
          <h2>New Journal Entry</h2>
          <p class="muted">Balanced double-entry required.</p>
        </div>

        <div class="grid2">
          <div class="field">
            <label>Date</label>
            <input type="date" id="jeDate" value="${todayISO()}" />
          </div>
          <div class="field">
            <label>Reference (optional)</label>
            <input id="jeRef" placeholder="Venmo / receipt / note..." />
          </div>
        </div>

        <div class="field" style="margin-top:10px;">
          <label>Memo</label>
          <textarea id="jeMemo" placeholder="Describe the transaction..."></textarea>
        </div>

        <div class="hr"></div>

        <div class="row" style="justify-content:space-between;">
          <b>Lines</b>
          <div class="row">
            <button class="btn secondary" type="button" id="addLine">+ Add line</button>
            <button class="btn" type="button" id="postEntry">Post Entry</button>
          </div>
        </div>

        <div id="linesHost" style="margin-top:10px;"></div>

        <div class="row" style="margin-top:10px;">
          <span class="badge" id="totalsBadge">Totals</span>
        </div>

        <div class="alert warn">
          Tip: A typical expense is <b>Debit Expense</b>, <b>Credit Cash</b>.
          A loan you owe is <b>Debit Cash</b>, <b>Credit Due to …</b>.
        </div>
      </div>
    `);

    const linesHost = card.querySelector("#linesHost");
    const working = [];

    function lineRow(l) {
      const row = el(`
        <div class="row" style="margin-bottom:8px; align-items:flex-end;">
          <div class="field" style="flex:1; min-width: 220px;">
            <label>Account</label>
            <select></select>
          </div>
          <div class="field" style="width:140px;">
            <label>Debit</label>
            <input inputmode="decimal" placeholder="0.00" />
          </div>
          <div class="field" style="width:140px;">
            <label>Credit</label>
            <input inputmode="decimal" placeholder="0.00" />
          </div>
          <button class="btn ghost" type="button">Remove</button>
        </div>
      `);

      const sel = row.querySelector("select");
      for (const a of accounts) {
        sel.appendChild(el(`<option value="${a.id}">${a.name} • ${a.type}</option>`));
      }
      sel.value = l.accountId;

      const dIn = row.querySelectorAll("input")[0];
      const cIn = row.querySelectorAll("input")[1];

      dIn.value = l.debit ? String(l.debit) : "";
      cIn.value = l.credit ? String(l.credit) : "";

      sel.onchange = () => {
        l.accountId = sel.value;
        updateTotals();
      };
      dIn.oninput = () => {
        l.debit = safeNum(dIn.value);
        updateTotals();
      };
      cIn.oninput = () => {
        l.credit = safeNum(cIn.value);
        updateTotals();
      };

      row.querySelector("button").onclick = () => {
        const idx = working.findIndex((x) => x.id === l.id);
        if (idx >= 0) working.splice(idx, 1);
        renderLines();
        updateTotals();
      };

      return row;
    }

    function renderLines() {
      linesHost.innerHTML = "";
      for (const l of working) linesHost.appendChild(lineRow(l));
    }

    function updateTotals() {
      const v = validateEntry(working);
      const badge = card.querySelector("#totalsBadge");
      badge.className = `badge ${v.ok ? "good" : "bad"}`;
      badge.textContent = `Debits ${fmt.money(v.totalDebit)} • Credits ${fmt.money(v.totalCredit)} ${
        v.ok ? "• OK" : "• Not balanced"
      }`;
    }

    card.querySelector("#addLine").onclick = () => {
      if (!accounts.length) return toast("No active accounts. Add accounts first.", "bad");
      working.push({
        id: uid(),
        accountId: accounts[0].id,
        debit: 0,
        credit: 0,
        createdAt: Date.now(),
      });
      renderLines();
      updateTotals();
    };

    card.querySelector("#postEntry").onclick = async () => {
      const v = validateEntry(working);
      if (!v.ok) return toast("Debits must equal credits (and be > 0).", "bad");

      const header = {
        id: uid(),
        date: card.querySelector("#jeDate").value || todayISO(),
        ref: clampStr(card.querySelector("#jeRef").value, 60),
        memo: clampStr(card.querySelector("#jeMemo").value, 220),
        createdAt: Date.now(),
      };

      const lines = working.map((l) => ({
        id: uid(),
        headerId: header.id,
        accountId: l.accountId,
        debit: safeNum(l.debit),
        credit: safeNum(l.credit),
        createdAt: Date.now(),
      }));

      try {
        await upsertJournalEntry(state.user.uid, header, lines);
        toast("Posted.");
        await state.reload();
        setRoute("dashboard");
      } catch (e) {
        toast(`Post failed: ${e?.message || e}`, "bad");
      }
    };

    // Start with two lines for speed
    if (accounts.length) {
      working.push({ id: uid(), accountId: accounts[0].id, debit: 0, credit: 0, createdAt: Date.now() });
      working.push({ id: uid(), accountId: accounts[0].id, debit: 0, credit: 0, createdAt: Date.now() });
      renderLines();
      updateTotals();
    }

    wrap.appendChild(card);
    return wrap;
  }

  function viewTrial(state) {
    const { data } = state;
    const opts = { start: state.filters?.start || null, end: state.filters?.end || null };
    const tb = trialBalance(data.accounts, data.journalHeaders, data.journalLines, opts);

    const wrap = el(`<div></div>`);
    wrap.appendChild(dateRangeBar(state));

    const card = el(`
      <div class="card">
        <div class="cardHeader">
          <h2>Trial Balance</h2>
          <p class="muted">Must foot: total debits = total credits.</p>
        </div>

        <div class="row">
          <span class="badge ${tb.foots ? "good" : "bad"}">
            ${tb.foots ? "Foots" : "Does NOT foot"} • Debits ${fmt.money(tb.totalDebit)} • Credits ${fmt.money(tb.totalCredit)}
          </span>
        </div>

        <div class="hr"></div>

        <table class="table">
          <thead>
            <tr>
              <th>Account</th>
              <th>Type</th>
              <th class="right">Debit</th>
              <th class="right">Credit</th>
            </tr>
          </thead>
          <tbody id="tbBody"></tbody>
        </table>
      </div>
    `);

    const body = card.querySelector("#tbBody");
    for (const r of tb.rows.sort((a, b) => a.account.name.localeCompare(b.account.name))) {
      const tr = el(`
        <tr>
          <td>${r.account.name}</td>
          <td>${r.account.type}</td>
          <td class="right">${r.debit ? fmt.money(r.debit) : ""}</td>
          <td class="right">${r.credit ? fmt.money(r.credit) : ""}</td>
        </tr>
      `);
      body.appendChild(tr);
    }

    wrap.appendChild(card);
    return wrap;
  }

  function viewIncomeStatement(state) {
    const { data } = state;
    const opts = { start: state.filters?.start || null, end: state.filters?.end || null };
    const is = incomeStatement(data.accounts, data.journalHeaders, data.journalLines, opts);

    const wrap = el(`<div></div>`);
    wrap.appendChild(dateRangeBar(state));

    const card = el(`
      <div class="card">
        <div class="cardHeader">
          <h2>Income Statement</h2>
          <p class="muted">For selected date range.</p>
        </div>

        <div class="row">
          <div>
            <div class="small">Total Revenue</div>
            <div class="bigNumber">${fmt.money(is.totalRevenue)}</div>
          </div>
          <div>
            <div class="small">Total Expenses</div>
            <div class="bigNumber">${fmt.money(is.totalExpense)}</div>
          </div>
          <div>
            <div class="small">Net Income</div>
            <div class="bigNumber">${fmt.money(is.netIncome)}</div>
          </div>
        </div>

        <div class="hr"></div>

        <div class="split">
          <div>
            <h3 style="margin:0 0 8px 0;">Revenue</h3>
            <table class="table">
              <thead><tr><th>Account</th><th class="right">Amount</th></tr></thead>
              <tbody id="revBody"></tbody>
            </table>
          </div>

          <div>
            <h3 style="margin:0 0 8px 0;">Expenses</h3>
            <table class="table">
              <thead><tr><th>Account</th><th class="right">Amount</th></tr></thead>
              <tbody id="expBody"></tbody>
            </table>
          </div>
        </div>
      </div>
    `);

    const revBody = card.querySelector("#revBody");
    for (const r of is.revenue.sort((a, b) => a.account.name.localeCompare(b.account.name))) {
      revBody.appendChild(el(`<tr><td>${r.account.name}</td><td class="right">${fmt.money(r.amount)}</td></tr>`));
    }

    const expBody = card.querySelector("#expBody");
    for (const r of is.expenses.sort((a, b) => a.account.name.localeCompare(b.account.name))) {
      expBody.appendChild(el(`<tr><td>${r.account.name}</td><td class="right">${fmt.money(r.amount)}</td></tr>`));
    }

    wrap.appendChild(card);
    return wrap;
  }

  function viewBalanceSheet(state) {
    const { data } = state;
    const end = state.filters?.end || todayISO();
    const bs = balanceSheet(data.accounts, data.journalHeaders, data.journalLines, { end });

    const wrap = el(`<div></div>`);
    wrap.appendChild(dateRangeBar(state));

    const card = el(`
      <div class="card">
        <div class="cardHeader">
          <h2>Balance Sheet</h2>
          <p class="muted">As of <b>${end}</b>. Includes cumulative net income in Retained Earnings display.</p>
        </div>

        <div class="row">
          <span class="badge ${bs.balanced ? "good" : "bad"}">
            ${bs.balanced ? "Balanced" : "Out of balance"} • Delta ${fmt.money(bs.equationDelta)}
          </span>
          <span class="badge">Cumulative Net Income: ${fmt.money(bs.cumulativeNetIncome)}</span>
        </div>

        <div class="hr"></div>

        <div class="split">
          <div>
            <h3 style="margin:0 0 8px 0;">Assets</h3>
            <table class="table">
              <thead><tr><th>Account</th><th class="right">Amount</th></tr></thead>
              <tbody id="aBody"></tbody>
            </table>
            <div class="row" style="margin-top:10px;">
              <span class="badge">Total Assets: ${fmt.money(bs.totalAssets)}</span>
            </div>
          </div>

          <div>
            <h3 style="margin:0 0 8px 0;">Liabilities</h3>
            <table class="table">
              <thead><tr><th>Account</th><th class="right">Amount</th></tr></thead>
              <tbody id="lBody"></tbody>
            </table>
            <div class="row" style="margin-top:10px;">
              <span class="badge">Total Liabilities: ${fmt.money(bs.totalLiabilities)}</span>
            </div>

            <div class="hr"></div>

            <h3 style="margin:0 0 8px 0;">Equity</h3>
            <table class="table">
              <thead><tr><th>Account</th><th class="right">Amount</th></tr></thead>
              <tbody id="eBody"></tbody>
            </table>
            <div class="row" style="margin-top:10px;">
              <span class="badge">Total Equity: ${fmt.money(bs.totalEquity)}</span>
            </div>
          </div>
        </div>
      </div>
    `);

    const aBody = card.querySelector("#aBody");
    for (const r of bs.assets.sort((a, b) => a.account.name.localeCompare(b.account.name))) {
      aBody.appendChild(el(`<tr><td>${r.account.name}</td><td class="right">${fmt.money(r.amount)}</td></tr>`));
    }

    const lBody = card.querySelector("#lBody");
    for (const r of bs.liabilities.sort((a, b) => a.account.name.localeCompare(b.account.name))) {
      lBody.appendChild(el(`<tr><td>${r.account.name}</td><td class="right">${fmt.money(r.amount)}</td></tr>`));
    }

    const eBody = card.querySelector("#eBody");
    for (const r of bs.equity.sort((a, b) => a.account.name.localeCompare(b.account.name))) {
      eBody.appendChild(el(`<tr><td>${r.account.name}</td><td class="right">${fmt.money(r.amount)}</td></tr>`));
    }

    wrap.appendChild(card);
    return wrap;
  }

  function viewLedger(state) {
    const { data } = state;
    const opts = { start: state.filters?.start || null, end: state.filters?.end || null, includeEmpty: false };
    const led = ledgerByAccount(data.accounts, data.journalHeaders, data.journalLines, opts);

    const wrap = el(`<div></div>`);
    wrap.appendChild(dateRangeBar(state));

    const card = el(`
      <div class="card">
        <div class="cardHeader">
          <h2>General Ledger</h2>
          <p class="muted">Pick an account to see its register.</p>
        </div>

        <div class="row">
          <div class="field" style="min-width:300px; flex:1;">
            <label>Account</label>
            <select id="accPick"></select>
          </div>
          <div class="field" style="min-width:220px; flex:1;">
            <label>Search memo/ref</label>
            <input id="q" placeholder="Type to filter…" />
          </div>
        </div>

        <div class="hr"></div>

        <table class="table">
          <thead>
            <tr>
              <th class="nowrap">Date</th>
              <th>Memo</th>
              <th class="right">Debit</th>
              <th class="right">Credit</th>
            </tr>
          </thead>
          <tbody id="ledBody"></tbody>
        </table>

        <div class="row" style="margin-top:10px;">
          <span class="badge" id="ledTotals">Totals</span>
        </div>
      </div>
    `);

    const picker = card.querySelector("#accPick");
    const qEl = card.querySelector("#q");
    const ledBody = card.querySelector("#ledBody");
    const totals = card.querySelector("#ledTotals");

    const accounts = data.accounts
      .filter((a) => a.isActive !== false)
      .sort((a, b) => a.name.localeCompare(b.name));

    for (const a of accounts) {
      picker.appendChild(el(`<option value="${a.id}">${a.name} • ${a.type}</option>`));
    }

    function renderAccount() {
      const accountId = picker.value;
      const q = (qEl.value || "").toLowerCase();

      const obj = led.find((x) => x.account.id === accountId);
      const entries = (obj?.entries || []).filter((e) => {
        if (!q) return true;
        return (e.memo || "").toLowerCase().includes(q) || (e.ref || "").toLowerCase().includes(q);
      });

      ledBody.innerHTML = "";
      for (const e of entries) {
        const tr = el(`
          <tr style="cursor:pointer;">
            <td class="nowrap">${e.date}</td>
            <td>${(e.memo || "").slice(0, 110)}</td>
            <td class="right">${e.debit ? fmt.money(e.debit) : ""}</td>
            <td class="right">${e.credit ? fmt.money(e.credit) : ""}</td>
          </tr>
        `);
        tr.onclick = () => openEditEntry(state, e.headerId);
        ledBody.appendChild(tr);
      }

      const td = sum(entries, (x) => x.debit);
      const tc = sum(entries, (x) => x.credit);
      totals.className = `badge ${Math.abs(td - tc) < 0.000001 ? "good" : "warn"}`;
      totals.textContent = `Debits ${fmt.money(td)} • Credits ${fmt.money(tc)}`;
    }

    picker.onchange = renderAccount;
    qEl.oninput = renderAccount;

    if (accounts.length) {
      picker.value = accounts[0].id;
      renderAccount();
    } else {
      totals.className = "badge bad";
      totals.textContent = "No active accounts.";
    }

    wrap.appendChild(card);
    return wrap;
  }

  function viewCOA(state) {
    const { data } = state;

    const card = el(`
      <div class="card">
        <div class="cardHeader">
          <h2>Chart of Accounts</h2>
          <p class="muted">Add/edit/disable accounts inside the app.</p>
        </div>

        <div class="row">
          <button class="btn" id="addAcc" type="button">+ Add Account</button>
          <button class="btn secondary" id="reload" type="button">Reload</button>
        </div>

        <div class="hr"></div>

        <table class="table">
          <thead>
            <tr>
              <th>Name</th>
              <th>Type</th>
              <th>Normal</th>
              <th>Status</th>
              <th class="right">Actions</th>
            </tr>
          </thead>
          <tbody id="coaBody"></tbody>
        </table>
      </div>
    `);

    const body = card.querySelector("#coaBody");

    function draw() {
      body.innerHTML = "";
      const rows = [...data.accounts].sort((a, b) => a.name.localeCompare(b.name));
      for (const a of rows) {
        const tr = el(`
          <tr>
            <td>${a.name}</td>
            <td>${a.type}</td>
            <td>${a.normalBalance}</td>
            <td>${a.isActive === false ? `<span class="badge warn">Inactive</span>` : `<span class="badge good">Active</span>`}</td>
            <td class="right">
              <button class="btn secondary" data-act="edit">Edit</button>
              <button class="btn ghost" data-act="toggle">${a.isActive === false ? "Activate" : "Disable"}</button>
              <button class="btn ghost" data-act="del" style="border-color: rgba(255,90,95,0.25);">Delete</button>
            </td>
          </tr>
        `);

        const [btnEdit, btnToggle, btnDel] = tr.querySelectorAll("button");

        btnEdit.onclick = () => openAccountModal(state, a);
        btnToggle.onclick = async () => {
          try {
            await upsertAccount(state.user.uid, { ...a, isActive: a.isActive === false ? true : false });
            toast("Updated.");
            await state.reload();
          } catch (e) {
            toast(`Update failed: ${e?.message || e}`, "bad");
          }
        };
        btnDel.onclick = async () => {
          if (!confirm(`Delete account "${a.name}"? This can break old entries.`)) return;
          try {
            await deleteAccount(state.user.uid, a.id);
            toast("Deleted (or queued).", "warn");
            await state.reload();
          } catch (e) {
            toast(`Delete failed: ${e?.message || e}`, "bad");
          }
        };

        body.appendChild(tr);
      }
    }

    card.querySelector("#addAcc").onclick = () => openAccountModal(state, null);
    card.querySelector("#reload").onclick = () => state.reload();

    draw();
    return card;
  }

  function openAccountModal(state, account) {
    const isEdit = !!account;
    const a = account || {
      id: uid(),
      name: "",
      type: "Expense",
      subtype: "",
      normalBalance: "Debit",
      isActive: true,
      createdAt: Date.now(),
    };

    const body = el(`
      <div>
        <div class="grid2">
          <div class="field">
            <label>Account Name</label>
            <input id="nm" value="${a.name}" placeholder="e.g., Dining Out" />
          </div>
          <div class="field">
            <label>Type</label>
            <select id="ty">
              <option>Asset</option>
              <option>Liability</option>
              <option>Equity</option>
              <option>Revenue</option>
              <option>Expense</option>
            </select>
          </div>
        </div>

        <div class="grid2" style="margin-top:10px;">
          <div class="field">
            <label>Subtype (optional)</label>
            <input id="sub" value="${a.subtype || ""}" placeholder="e.g., Living, Auto, Due to…" />
          </div>
          <div class="field">
            <label>Normal Balance</label>
            <select id="nb">
              <option>Debit</option>
              <option>Credit</option>
            </select>
          </div>
        </div>

        <div class="alert warn">
          Normal balance defaults: Asset/Expense = Debit. Liability/Equity/Revenue = Credit.
        </div>
      </div>
    `);

    body.querySelector("#ty").value = a.type;
    body.querySelector("#nb").value = a.normalBalance;

    // auto-set normal balance when type changes (still editable)
    body.querySelector("#ty").onchange = () => {
      const t = body.querySelector("#ty").value;
      body.querySelector("#nb").value = (t === "Asset" || t === "Expense") ? "Debit" : "Credit";
    };

    const footer = el(`
      <div class="row">
        <button class="btn ghost" id="cancel">Cancel</button>
        <button class="btn" id="save">${isEdit ? "Save" : "Create"}</button>
      </div>
    `);

    openModal(isEdit ? "Edit Account" : "Add Account", body, footer);

    footer.querySelector("#cancel").onclick = closeModal;
    footer.querySelector("#save").onclick = async () => {
      const name = clampStr(body.querySelector("#nm").value, 80);
      if (!name) return toast("Name required.", "bad");

      const next = {
        ...a,
        name,
        type: body.querySelector("#ty").value,
        subtype: clampStr(body.querySelector("#sub").value, 50),
        normalBalance: body.querySelector("#nb").value,
        isActive: true,
        createdAt: a.createdAt ?? Date.now(),
      };

      try {
        await upsertAccount(state.user.uid, next);
        toast(isEdit ? "Saved." : "Created.");
        closeModal();
        await state.reload();
      } catch (e) {
        toast(`Save failed: ${e?.message || e}`, "bad");
      }
    };
  }

  function viewSettings(state) {
    const card = el(`
      <div class="card">
        <div class="cardHeader">
          <h2>Settings</h2>
          <p class="muted">Backup/restore and sync tools.</p>
        </div>

        <div class="row">
          <button class="btn secondary" id="btnFlush">Flush Offline Queue</button>
          <span class="badge" id="qBadge">Queue: …</span>
        </div>

        <div class="hr"></div>

        <div class="row">
          <button class="btn" id="btnExport">Export Backup (JSON)</button>
          <button class="btn secondary" id="btnImport">Import Backup (JSON)</button>
          <input id="file" type="file" accept="application/json" style="display:none;" />
        </div>

        <div class="alert warn">
          Import overwrites your local snapshot and will sync to cloud as you continue using the app.
          Keep backups.
        </div>
      </div>
    `);

    const qBadge = card.querySelector("#qBadge");

    async function refreshQueueBadge() {
      const q = await getQueueSize().catch(() => 0);
      qBadge.textContent = `Queue: ${q}`;
      qBadge.className = `badge ${q ? "warn" : "good"}`;
      if (!navigator.onLine) setSyncText(`Offline • ${q} queued`, "warn");
      else setSyncText(q ? `${q} queued • Online` : "Synced • Online", q ? "warn" : "good");
    }

    card.querySelector("#btnFlush").onclick = async () => {
      if (!navigator.onLine) return toast("You’re offline.", "warn");
      try {
        setSyncText("Syncing…", "warn");
        await flushQueue(state.user.uid);
        await refreshQueueBadge();
        toast("Queue flushed.");
        await state.reload();
      } catch (e) {
        toast(`Flush failed: ${e?.message || e}`, "bad");
      }
    };

    card.querySelector("#btnExport").onclick = () => {
      const payload = {
        exportedAt: new Date().toISOString(),
        snapshot: state.data,
      };
      const blob = new Blob([JSON.stringify(payload, null, 2)], { type: "application/json" });
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = `personal-accounting-backup-${todayISO()}.json`;
      a.click();
      URL.revokeObjectURL(url);
      toast("Exported.");
    };

    const fileInput = card.querySelector("#file");
    card.querySelector("#btnImport").onclick = () => fileInput.click();

    fileInput.onchange = async () => {
      const f = fileInput.files?.[0];
      if (!f) return;
      try {
        const txt = await f.text();
        const parsed = JSON.parse(txt);
        if (!parsed?.snapshot?.accounts) throw new Error("Invalid backup format.");

        // Overwrite local snapshot by posting a minimal “import” approach:
        // We re-save accounts + entries as new upserts. This keeps cloud consistent.
        // Practical + safe.
        const snap = parsed.snapshot;

        // Accounts
        for (const a of snap.accounts || []) {
          await upsertAccount(state.user.uid, a);
        }
        // Journal entries
        const headers = snap.journalHeaders || [];
        const lines = snap.journalLines || [];
        for (const h of headers) {
          const myLines = lines.filter((l) => l.headerId === h.id);
          await upsertJournalEntry(state.user.uid, h, myLines);
        }

        toast("Imported.");
        await state.reload();
      } catch (e) {
        toast(`Import failed: ${e?.message || e}`, "bad");
      } finally {
        fileInput.value = "";
      }
    };

    refreshQueueBadge();
    return card;
  }

  return { render };
}