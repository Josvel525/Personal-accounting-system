import { wireAuthUI } from './auth.js';
import { loadAll, LOCAL_UID, signOutUser, exportData, importLocalBackup } from './db.js';
import { createUI } from './ui.js';

const $=id=>document.getElementById(id);
const state={user:null,route:'dashboard',data:{accounts:[],journalHeaders:[],journalLines:[]},status:null};
let toastTimer, generation=0;
const menuButton=$('btnMenu'), menuPanel=$('navigationPanel');
function setMenu(open,returnFocus=false){
  menuPanel.hidden=!open;
  menuButton.setAttribute('aria-expanded',String(open));
  menuButton.setAttribute('aria-label',open?'Close navigation':'Open navigation');
  if(open)menuPanel.style.setProperty('--menu-top',`${document.querySelector('.topbar').getBoundingClientRect().bottom+8}px`);
  if(returnFocus)menuButton.focus();
}
menuButton.onclick=()=>setMenu(menuPanel.hidden);
menuButton.addEventListener('keydown',e=>{if(e.key==='ArrowDown'){e.preventDefault();setMenu(true);menuPanel.querySelector('.navItem').focus();}});
$('btnCloseMenu').onclick=()=>setMenu(false,true);
document.addEventListener('click',e=>{if(!menuPanel.hidden && !menuPanel.contains(e.target) && !menuButton.contains(e.target))setMenu(false);});
document.addEventListener('keydown',e=>{if(e.key==='Escape' && !menuPanel.hidden){e.preventDefault();setMenu(false,true);}});
document.addEventListener('focusin',e=>{if(!menuPanel.hidden && !menuPanel.contains(e.target) && !menuButton.contains(e.target))setMenu(false);});
window.addEventListener('resize',()=>{if(!menuPanel.hidden)setMenu(true);});
$('workspaceDate').textContent=new Intl.DateTimeFormat(undefined,{month:'long',day:'numeric',year:'numeric'}).format(new Date());

function toast(message,kind='good') {
  $('toastText').textContent=message;$('toast').style.display='block';
  $('toast').classList.toggle('bad',kind==='bad');
  clearTimeout(toastTimer);toastTimer=setTimeout(()=>$('toast').style.display='none',6000);
}
function render(){createUI(state,{toast}).render();}
state.reload=async()=>{
  const token=generation, user=state.user;
  if(!user)return;
  $('syncText').textContent=user.uid===LOCAL_UID?'Local books':'Syncing…';
  const result=await loadAll(user.uid);
  if(token!==generation)return;
  state.data=result.data;state.status=result;
  $('syncText').textContent=result.source==='local'?'Saved on this browser':result.error?`${result.pending} pending • Sync unavailable`:'Cloud synced';
  $('syncDot').style.background=result.error?'var(--warn)':'var(--good)';
  $('statusNotice').textContent=result.source==='local'?'Local mode: these books stay in this browser and do not sync to your other devices. Export a backup in Settings.':result.error || '';
  $('statusNotice').hidden=!$('statusNotice').textContent;
  render();
};
async function enter(user){
  generation++;state.user=user;state.route='dashboard';
  $('authGate').style.display='none';$('appViews').style.display='block';$('btnSignOut').style.display='inline-flex';
  $('btnSignOut').textContent=user.uid===LOCAL_UID?'Exit local mode':'Sign out';
  $('brandSub').textContent=user.uid===LOCAL_UID?'Local books • Double-entry':`Cloud books • ${user.email || 'Signed in'}`;
  await state.reload();
}
function signedOut(){
  generation++;state.journalDirty=false;state.user=null;state.data={accounts:[],journalHeaders:[],journalLines:[]};
  $('currentSection').textContent='Welcome';setMenu(false);$('routeHost').replaceChildren();$('authGate').style.display='block';$('appViews').style.display='none';
  $('btnSignOut').style.display='none';$('brandSub').textContent='Personal books • Double-entry';$('syncText').textContent='Choose local or cloud';
}
$('btnLocal').onclick=async()=>{
  try{localStorage.setItem('pa_mode','local');await enter({uid:LOCAL_UID});}catch(e){toast(e.message,'bad');}
};
$('btnSignOut').onclick=async()=>{
  if(state.journalDirty && !confirm('Leave this unsaved journal entry?'))return;
  try{if(state.user?.uid!==LOCAL_UID)await signOutUser();localStorage.removeItem('pa_mode');signedOut();}catch(e){toast(e.message,'bad');}
};
for(const btn of document.querySelectorAll('.navItem'))btn.onclick=()=>{
  if(!state.user){toast('Choose local mode or sign in first.');return;}
  if(state.route==='journal' && state.journalDirty && !confirm('Leave this unsaved journal entry?'))return;
  state.journalDirty=false;state.route=btn.dataset.route;render();setMenu(false);const heading=document.querySelector('#routeHost h2');if(heading){heading.tabIndex=-1;heading.focus();}
};
$('btnSettings').onclick=()=>{
  const body=$('modalBody'),footer=$('modalFooter');body.replaceChildren();footer.replaceChildren();
  $('modalTitle').textContent='Settings & backups';
  const note=document.createElement('p');note.textContent=state.user?.uid===LOCAL_UID?'Local books are stored on this browser. Clearing browser data removes them. Download regular backups.':state.user?'Cloud books use your Firebase account. Export includes locally saved changes awaiting sync.':'Choose local mode or sign in to manage your books.';body.append(note);
  if(state.user){
    const backup=document.createElement('button');backup.className='btn';backup.textContent='Export backup';
    backup.onclick=async()=>{try{
      const data=await exportData(state.user.uid),blob=new Blob([JSON.stringify(data,null,2)],{type:'application/json'});
      const url=URL.createObjectURL(blob),a=document.createElement('a');a.href=url;a.download=`personal-accounting-${new Date().toISOString().slice(0,10)}.json`;a.click();setTimeout(()=>URL.revokeObjectURL(url),1000);
    }catch(e){toast(e.message,'bad');}};footer.append(backup);
    if(state.user.uid===LOCAL_UID){
      const label=document.createElement('label');label.textContent='Restore a backup into empty local books';
      const input=document.createElement('input');input.type='file';input.accept='.json,application/json';
      input.onchange=async()=>{try{if(!input.files[0])return;await importLocalBackup(LOCAL_UID,JSON.parse(await input.files[0].text()));await state.reload();$('modalBackdrop').style.display='none';toast('Backup restored.');}catch(e){toast(e.message,'bad');}finally{input.value='';}};
      label.append(input);body.append(label);
    }
  }
  $('modalBackdrop').style.display='flex';$('modalClose').focus();
};
$('modalClose').onclick=()=>$('modalBackdrop').style.display='none';
$('modalBackdrop').onclick=e=>{if(e.target===$('modalBackdrop'))$('modalClose').click();};
document.addEventListener('keydown',e=>{if(e.key==='Escape')$('modalClose').click();});
window.addEventListener('beforeunload',e=>{if(state.journalDirty){e.preventDefault();e.returnValue='';}});
window.addEventListener('online',()=>{if(state.user && !state.journalDirty)state.reload().catch(e=>toast(e.message,'bad'));});
window.addEventListener('offline',()=>{if(state.user?.uid!==LOCAL_UID)$('syncText').textContent='Offline';});
wireAuthUI({toast,onSignedIn:async user=>{if(localStorage.getItem('pa_mode')==='local')return;localStorage.setItem('pa_mode','cloud');await enter(user);},onSignedOut:()=>{if(state.user?.uid!==LOCAL_UID)signedOut();}});
if(localStorage.getItem('pa_mode')==='local')enter({uid:LOCAL_UID}).catch(e=>toast(e.message,'bad'));
if('serviceWorker' in navigator)navigator.serviceWorker.register('./sw.js').catch(()=>{});
