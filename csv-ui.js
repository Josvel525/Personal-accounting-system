import {el,escapeHTML as esc} from './utils.js';
import {CSV_TYPES,templateCSV,prepareCSVImport,importCSV} from './csv-import.js';
import {encodeCSV} from './csv-utils.js';
import {LOCAL_UID} from './db.js';
export function downloadCSV(filename,text){const url=URL.createObjectURL(new Blob([text],{type:'text/csv;charset=utf-8'})),a=document.createElement('a');a.href=url;a.download=filename;a.click();setTimeout(()=>URL.revokeObjectURL(url),1000);}
export const downloadTemplate=kind=>downloadCSV(`${kind}-template.csv`,templateCSV(kind));
export function attachCSVControls(root,kind,{state,toast}){
 let actions=root.querySelector('.headerActions');if(!actions){actions=el('<div class="headerActions row"></div>');root.querySelector('.cardHeader').append(actions);}
 const buttons=el('<span class="csvTools"><button class="btn" type="button" data-csv-import>Import CSV</button><button class="btn" type="button" data-csv-template>Download Template</button></span>');actions.append(buttons);
 buttons.querySelector('[data-csv-template]').onclick=()=>downloadTemplate(kind);
 buttons.querySelector('[data-csv-import]').onclick=()=>{
  if(state.journalDirty && !confirm('Importing will replace the current screen after saving. Discard unsaved form changes if the import succeeds?'))return;
  const title=document.getElementById('modalTitle'),body=document.getElementById('modalBody'),footer=document.getElementById('modalFooter'),backdrop=document.getElementById('modalBackdrop');
  title.textContent=`Import CSV · ${CSV_TYPES[kind].title}`;
  body.replaceChildren(el(`<p class="muted">${esc(CSV_TYPES[kind].help)}</p>`),el('<p class="small">Use YYYY-MM-DD dates and numbers with at most two decimal places. Keep account codes as text to preserve leading zeros. Files may contain up to 2,000 data rows and 2 MB. New records only; existing records are never overwritten.</p>'));
  const file=el('<label class="field">CSV file<input type="file" accept=".csv,text/csv" aria-label="CSV file"></label>'),result=el('<div class="csvResult" role="status" aria-live="polite"></div>');body.append(file,result);
  const commit=el('<button class="btn primary" type="button" disabled>Import records</button>'),cancel=el('<button class="btn" type="button">Cancel</button>');footer.replaceChildren(cancel,commit);
  cancel.onclick=()=>document.getElementById('modalClose').click();let text='',revision=0;
  const showError=e=>{result.replaceChildren(el('<p class="alert bad">Nothing was imported. Correct these errors and choose the file again.</p>'));const list=document.createElement('ul');for(const issue of e.errors || [{message:e.message}]){const li=document.createElement('li');li.textContent=(issue.line?`CSV line ${issue.line}: `:'')+issue.message;list.append(li);}result.append(list);commit.disabled=true;};
  file.querySelector('input').onchange=async e=>{
   const token=++revision;commit.disabled=true;result.textContent='Validating file…';const selected=e.target.files[0];if(!selected){result.textContent='';return;}
   try{
    if(selected.size>2000000)throw Error('CSV must be at most 2 MB.');
    const value=await selected.text();if(token!==revision)return;text=value;
    if(state.status?.unavailable || state.status?.modulesUnavailable && !['accounts','journal'].includes(kind))throw Error('Cloud access is unavailable for this module. Open local books or restore cloud permissions first.');
    const plan=prepareCSVImport(kind,text,state.data,{cloud:state.user.uid!==LOCAL_UID});
    result.innerHTML=`<p class="alert">Ready: ${plan.count} ${kind==='journal'?'journal entries':kind==='statements'?'statements':'records'} from ${plan.rowCount} CSV rows. The whole file will be saved together. ${['journal','invoices','payments','expenses','transfers'].includes(kind)?'This will post transactions to your books.':''}</p><p class="small">Preview ${Math.min(20,plan.rowCount)} of ${plan.rowCount} rows</p><div class="tableWrap"><table class="table"><thead><tr>${plan.headers.map(h=>`<th>${esc(h)}</th>`).join('')}</tr></thead><tbody>${plan.preview.map(row=>`<tr>${plan.headers.map(h=>`<td>${esc(row[h])}</td>`).join('')}</tr>`).join('')}</tbody></table></div>`;
    commit.textContent=`Import ${plan.count} ${plan.count===1?'record':'records'}`;commit.disabled=false;
   }catch(e){if(token===revision)showError(e);}
  };
  commit.onclick=async()=>{
   if(commit.disabled)return;commit.disabled=true;file.querySelector('input').disabled=true;cancel.disabled=true;document.getElementById('modalClose').disabled=true;
   let saved=false;
   try{await importCSV(state.user.uid,kind,text);saved=true;state.journalDirty=false;backdrop.style.display='none';await state.reload();toast('CSV import completed. All records saved.');}
   catch(e){if(saved)toast('CSV saved, but the screen could not refresh. Reopen this page.','bad');else showError(e);}
   finally{file.querySelector('input').disabled=false;cancel.disabled=false;document.getElementById('modalClose').disabled=false;}
  };
  backdrop.style.display='flex';file.querySelector('input').focus();
 };
}
export function transactionTemplate(){downloadCSV('bank-transactions-template.csv',encodeCSV(['date','description','amount']));}
