import {el,fmt,escapeHTML as esc,todayISO,validDate} from './utils.js';
import {saveAccount,deleteAccount,postEntry,createStarterAccounts,LOCAL_UID} from './db.js';
import {TYPES,normalizeAccounts,accountBalances,trialBalance,balanceSheet,incomeStatement,ledgerByAccount,cents,dollars,validateEntry} from './accounting.js';
const money=n=>fmt.money(n);
const accountLabel=a=>`${a.code ? a.code+' · ' : ''}${a.name}`;
const emptyRow=(text,cols)=>`<tr><td colspan="${cols}" class="muted">${esc(text)}</td></tr>`;
const table=(heads,body)=>`<div class="tableWrap"><table class="table"><thead><tr>${heads.map(h=>`<th>${h}</th>`).join('')}</tr></thead><tbody>${body}</tbody></table></div>`;
const stat=(label,value)=>`<div><div class="small">${label}</div><div class="bigNumber">${money(value)}</div></div>`;
export function createUI(state,{toast}) {
  const host=document.getElementById('routeHost'),data=state.data;
  data.accounts=normalizeAccounts(data.accounts);
  const reports=()=>[data.accounts,data.journalHeaders,data.journalLines];
  const cloudBlocked=()=>state.user.uid!==LOCAL_UID && state.status?.unavailable;
  async function save(button,fn,success){
    if(cloudBlocked()){toast('Cloud books could not be loaded. Retry sync before changing these books.','bad');return;}
    if(button.disabled)return;button.disabled=true;
    try{await fn();state.journalDirty=false;await state.reload();toast(success);}
    catch(e){toast(e.message,'bad');button.disabled=false;}
  }
  function go(route){state.route=route;render();}
  function card(title,subtitle=''){return el(`<section class="card"><div class="cardHeader"><h2>${title}</h2><p class="muted">${subtitle}</p></div></section>`);}
  function render(){
    document.getElementById('currentSection').textContent=document.querySelector(`.navItem[data-route="${state.route}"]`)?.textContent.trim() || 'Dashboard';
    for(const b of document.querySelectorAll('.navItem')){b.classList.toggle('active',b.dataset.route===state.route);b.setAttribute('aria-current',b.dataset.route===state.route?'page':'false');}
    const view={dashboard,journal,ledger,trial,bs:balance,is:income,coa:accounts}[state.route] || dashboard;
    host.replaceChildren(view());
  }
  function starter(root){
    const box=el('<div class="alert"><h3>Start your books</h3><p>Create accounts, then record opening balances as a balanced journal entry.</p><button class="btn" type="button">Create starter accounts</button></div>');
    const btn=box.querySelector('button');btn.onclick=()=>save(btn,()=>createStarterAccounts(state.user.uid),'Starter accounts created.');root.append(box);
  }
  function dashboard(){
    const root=card('Dashboard','Balances through today. Opening balances are entered through the journal.');
    const bs=balanceSheet(...reports(),{end:todayISO()});
    const month=todayISO().slice(0,7)+'-01',is=incomeStatement(...reports(),{start:month,end:todayISO()});
    root.append(el(`<div class="stats">${stat('Assets',bs.totalAssets)}${stat('Liabilities',bs.totalLiabilities)}${stat('Net assets',dollars(cents(bs.totalAssets)-cents(bs.totalLiabilities)))}${stat('Net income this month',is.netIncome)}</div>`));
    if(!data.accounts.length)starter(root);
    root.append(el(`<div class="row sectionSpace"><span class="badge ${bs.balanced?'good':'bad'}">${bs.balanced?'Books balance':'Balance difference: '+money(bs.equationDelta)}</span><span class="muted">${data.journalHeaders.length} posted entries</span><button class="btn" data-new>New journal entry</button><button class="btn secondary" data-refresh>Refresh / sync</button></div>`));
    root.querySelector('[data-new]').onclick=()=>go('journal');
    const refresh=root.querySelector('[data-refresh]');refresh.onclick=async()=>{refresh.disabled=true;try{await state.reload();}catch(e){toast(e.message,'bad');refresh.disabled=false;}};
    root.append(el('<h3>Recent entries</h3>'));
    const recent=[...data.journalHeaders].sort((a,b)=>b.date.localeCompare(a.date) || (b.createdAt||0)-(a.createdAt||0)).slice(0,10);
    root.append(el(table(['Date','Reference','Memo','Amount'],recent.map(h=>`<tr><td>${esc(h.date)}</td><td>${esc(h.ref)}</td><td>${esc(h.memo)}</td><td>${money(dollars(data.journalLines.filter(l=>l.headerId===h.id).reduce((n,l)=>n+cents(l.debit),0)))}</td></tr>`).join('') || emptyRow('No journal entries yet.',4))));
    return root;
  }
  function journal(){
    const root=card('Journal Entry','Posted entries are preserved. Correct a mistake with a reversing entry.');
    const active=data.accounts.filter(a=>a.isActive!==false);
    if(active.length<2){root.append(el('<p>Add at least two active accounts in Chart of Accounts before posting.</p>'));if(!active.length)starter(root);return root;}
    const form=el(`<form><div class="grid2"><div class="field"><label for="entryDate">Date</label><input id="entryDate" type="date" required value="${todayISO()}"></div><div class="field"><label for="entryRef">Reference</label><input id="entryRef" maxlength="100" placeholder="Optional reference"></div></div><div class="field sectionSpace"><label for="entryMemo">Memo</label><input id="entryMemo" maxlength="500" placeholder="What is this entry for?"></div><div class="journalLines sectionSpace"></div><div class="row sectionSpace"><button type="button" class="btn secondary" data-add>Add line</button><div class="spacer"></div><span data-total aria-live="polite"></span><button type="submit" class="btn">Post entry</button></div></form>`);
    const lines=form.querySelector('.journalLines');
    const readLines=()=>[...lines.children].map(r=>({accountId:r.querySelector('select').value,debit:r.querySelector('[data-debit]').value,credit:r.querySelector('[data-credit]').value}));
    function totals(){const v=validateEntry(readLines());form.querySelector('[data-total]').textContent=`Debits ${money(v.totalDebit)} · Credits ${money(v.totalCredit)} · ${v.ok?'Balanced':'Not ready to post'}`;}
    function addLine(){
      if(lines.children.length>=200){toast('Maximum 200 lines per entry.','bad');return;}
      const i=lines.children.length+1;
      const row=el(`<div class="journalLine"><div class="field"><label>Account<select aria-label="Account ${i}" required><option value="">Select account</option>${active.map(a=>`<option value="${esc(a.id)}">${esc(accountLabel(a))}</option>`).join('')}</select></label></div><div class="field"><label>Debit<input type="number" aria-label="Debit ${i}" data-debit min="0" step="0.01" inputmode="decimal" placeholder="0.00"></label></div><div class="field"><label>Credit<input type="number" aria-label="Credit ${i}" data-credit min="0" step="0.01" inputmode="decimal" placeholder="0.00"></label></div><button type="button" class="iconBtn" aria-label="Remove line ${i}">✕</button></div>`);
      row.querySelector('button').onclick=()=>{if(lines.children.length<=2){toast('Keep at least two lines.');return;}row.remove();state.journalDirty=true;totals();};
      lines.append(row);totals();
    }
    addLine();addLine();form.querySelector('[data-add]').onclick=()=>{addLine();state.journalDirty=true;};
    form.oninput=()=>{state.journalDirty=true;totals();};
    form.onsubmit=e=>{e.preventDefault();const button=form.querySelector('[type=submit]');return save(button,()=>postEntry(state.user.uid,{
      date:form.querySelector('#entryDate').value,ref:form.querySelector('#entryRef').value,memo:form.querySelector('#entryMemo').value,lines:readLines()
    }),'Entry saved.');};
    root.append(form);return root;
  }
  function filters(root,{range=false,account=false}={},draw){
    const form=el(`<form class="row filters">${account?`<div class="field"><label for="ledgerAccount">Account</label><select id="ledgerAccount"><option value="">All accounts</option>${data.accounts.map(a=>`<option value="${esc(a.id)}">${esc(accountLabel(a))}</option>`).join('')}</select></div>`:''}${range?'<div class="field"><label for="reportStart">From</label><input id="reportStart" type="date"></div>':''}<div class="field"><label for="reportEnd">${range?'Through':'As of'}</label><input id="reportEnd" type="date" value="${todayISO()}" required></div><button class="btn" type="submit">Apply</button><button type="button" class="btn ghost" data-print>Print</button></form>`);
    const output=el('<div></div>');
    const refresh=()=>{
      const start=form.querySelector('#reportStart')?.value || null,end=form.querySelector('#reportEnd').value;
      if(!validDate(end) || (start && (!validDate(start) || start>end))){toast('Enter a valid date range.','bad');return;}
      draw(output,{start,end},form.querySelector('select')?.value);
    };
    form.onsubmit=e=>{e.preventDefault();refresh();};form.querySelector('[data-print]').onclick=()=>window.print();
    root.append(form,output);refresh();
  }
  function trial(){
    const root=card('Trial Balance','Includes disabled accounts and all posted history through the selected date.');
    filters(root,{},(out,opts)=>{
      const tb=trialBalance(...reports(),opts);
      out.innerHTML=table(['Code','Account','Debit','Credit'],tb.rows.map(r=>`<tr><td>${esc(r.account.code)}</td><td>${esc(r.account.name)}</td><td>${money(r.debit)}</td><td>${money(r.credit)}</td></tr>`).join('')+`<tr class="total"><td colspan="2">Total</td><td>${money(tb.totalDebit)}</td><td>${money(tb.totalCredit)}</td></tr>`)+`<p class="badge ${tb.foots?'good':'bad'}">${tb.foots?'Debits equal credits':'Out of balance'}</p>`;
    });return root;
  }
  function reportSection(title,rows,totalValue){return `<h3>${title}</h3>`+table(['Account','Amount'],rows.map(r=>`<tr><td>${esc(accountLabel(r.account))}</td><td>${money(r.amount)}</td></tr>`).join('')+`<tr class="total"><td>Total ${title.toLowerCase()}</td><td>${money(totalValue)}</td></tr>`);}
  function balance(){
    const root=card('Balance Sheet','Assets = liabilities + equity, including unclosed earnings.');
    filters(root,{},(out,opts)=>{const b=balanceSheet(...reports(),opts);out.innerHTML=reportSection('Assets',b.assets,b.totalAssets)+reportSection('Liabilities',b.liabilities,b.totalLiabilities)+reportSection('Equity',b.equity,b.totalEquity)+`<p class="badge ${b.balanced?'good':'bad'}">${b.balanced?'Balance sheet balances':'Difference: '+money(b.equationDelta)}</p>`;});return root;
  }
  function income(){
    const root=card('Income Statement','Revenue and expenses for the selected period. Leave From blank for all history.');
    filters(root,{range:true},(out,opts)=>{const i=incomeStatement(...reports(),opts);out.innerHTML=reportSection('Revenue',i.revenue,i.totalRevenue)+reportSection('Expenses',i.expenses,i.totalExpense)+`<div class="sectionSpace">${stat('Net income',i.netIncome)}</div>`;});return root;
  }
  function ledger(){
    const root=card('General Ledger','Running balances include activity before the selected period.');
    filters(root,{range:true,account:true},(out,opts,id)=>{
      out.replaceChildren();
      const selected=data.accounts.filter(a=>!id || a.id===id);
      const groups=ledgerByAccount(selected,data.journalHeaders,data.journalLines,{...opts,includeEmpty:true});
      const openingLines=opts.start?data.journalLines.filter(l=>data.journalHeaders.some(h=>h.id===l.headerId && h.date<opts.start)):[];
      const opening=accountBalances(selected,data.journalHeaders,openingLines);
      for(const group of groups){
        let running=cents(opening.get(group.account.id)?.balance || 0);
        const section=el(`<section><h3>${esc(accountLabel(group.account))}</h3><p class="small">Normal balance: ${group.account.normalBalance}</p></section>`);
        const rows=group.entries.map(e=>{running+=(group.account.normalBalance==='Debit'?1:-1)*(cents(e.debit)-cents(e.credit));return `<tr><td>${esc(e.date)}</td><td>${esc(e.ref)}</td><td>${esc(e.memo)}</td><td>${money(e.debit)}</td><td>${money(e.credit)}</td><td>${money(dollars(running))}</td></tr>`;}).join('');
        section.append(el(table(['Date','Reference','Memo','Debit','Credit','Balance'],`<tr><td colspan="5">Opening balance</td><td>${money(opening.get(group.account.id)?.balance || 0)}</td></tr>`+rows+`<tr class="total"><td colspan="5">Closing balance</td><td>${money(dollars(running))}</td></tr>`)));out.append(section);
      }
      if(!groups.length)out.textContent='No accounts yet.';
    });return root;
  }
  function accounts(){
    const root=card('Chart of Accounts','Manage accounts. Disabled accounts remain in reports; accounts with entries cannot be deleted.');
    const form=el(`<form class="accountForm"><h3 data-title>Add account</h3><div class="grid2"><div class="field"><label for="accountCode">Code</label><input id="accountCode" maxlength="30"></div><div class="field"><label for="accountName">Name</label><input id="accountName" maxlength="120" required></div><div class="field"><label for="accountType">Type</label><select id="accountType">${TYPES.map(t=>`<option>${t}</option>`).join('')}</select></div><div class="field"><label for="accountNormal">Normal balance</label><select id="accountNormal"><option>Debit</option><option>Credit</option></select></div></div><div class="row sectionSpace"><button class="btn" type="submit">Save account</button><button class="btn ghost" type="button" data-cancel hidden>Cancel edit</button></div></form>`);
    let editing=null;
    const f=id=>form.querySelector('#'+id);
    f('accountType').onchange=()=>f('accountNormal').value=['Asset','Expense'].includes(f('accountType').value)?'Debit':'Credit';
    form.onsubmit=e=>{e.preventDefault();return save(form.querySelector('[type=submit]'),()=>saveAccount(state.user.uid,{
      ...(editing || {}),code:f('accountCode').value,name:f('accountName').value,type:f('accountType').value,normalBalance:f('accountNormal').value,isActive:editing?.isActive!==false
    }),'Account saved.');};
    form.querySelector('[data-cancel]').onclick=()=>render();root.append(form);
    if(!data.accounts.length)starter(root);
    const balances=accountBalances(...reports());
    const tbl=el(table(['Code','Name','Type','Balance','Status','Actions'],data.accounts.map(a=>`<tr><td>${esc(a.code)}</td><td>${esc(a.name)}</td><td>${esc(a.type)}</td><td>${money(balances.get(a.id)?.balance || 0)}</td><td>${a.isActive===false?'Disabled':'Active'}</td><td><div class="row"><button class="btn ghost" data-edit="${esc(a.id)}">Edit</button><button class="btn ghost" data-toggle="${esc(a.id)}">${a.isActive===false?'Enable':'Disable'}</button><button class="btn ghost" data-delete="${esc(a.id)}">Delete</button></div></td></tr>`).join('') || emptyRow('No accounts yet.',6)));
    root.append(tbl);
    for(const btn of tbl.querySelectorAll('[data-edit]'))btn.onclick=()=>{editing=data.accounts.find(a=>a.id===btn.dataset.edit);f('accountCode').value=editing.code || '';f('accountName').value=editing.name;f('accountType').value=editing.type;f('accountNormal').value=editing.normalBalance;form.querySelector('[data-title]').textContent='Edit account';form.querySelector('[data-cancel]').hidden=false;f('accountName').focus();};
    for(const btn of tbl.querySelectorAll('[data-toggle]'))btn.onclick=()=>{const a=data.accounts.find(a=>a.id===btn.dataset.toggle);save(btn,()=>saveAccount(state.user.uid,{...a,isActive:a.isActive===false}),'Account updated.');};
    for(const btn of tbl.querySelectorAll('[data-delete]'))btn.onclick=()=>{const a=data.accounts.find(a=>a.id===btn.dataset.delete);if(confirm(`Delete unused account “${a.name}”?`))save(btn,()=>deleteAccount(state.user.uid,a.id),'Account deleted.');};
    return root;
  }
  return {render};
}
