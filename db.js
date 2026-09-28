import { uid as idgen, validDate, clampStr } from './utils.js';
import { TYPES, normalizeAccounts, validateEntry } from './accounting.js';
export const LOCAL_UID = '__local__';
const empty = () => ({accounts:[],journalHeaders:[],journalLines:[]});
const firebaseConfig = {
  apiKey: "AIzaSyCprWuMnOFI91MaWg5H63Ik3_MPWmi1JPM",
  authDomain: "personal-accounting-syst-2188a.firebaseapp.com",
  projectId: "personal-accounting-syst-2188a",
  storageBucket: "personal-accounting-syst-2188a.appspot.com", // Fixed from .firebasestorage.app
  messagingSenderId: "517983866974",
  appId: "1:517983866974:web:2f108129c717915531e4cf"
};


let sdkPromise;
export async function initFirebase() {
  if (!sdkPromise) sdkPromise = Promise.all([
    import('https://www.gstatic.com/firebasejs/10.12.2/firebase-app.js'),
    import('https://www.gstatic.com/firebasejs/10.12.2/firebase-auth.js'),
    import('https://www.gstatic.com/firebasejs/10.12.2/firebase-firestore.js')
  ]).then(([app,a,f]) => {
    const instance=app.initializeApp(firebaseConfig);
    return {a,f,auth:a.getAuth(instance),db:f.getFirestore(instance)};
  }).catch(error=>{sdkPromise=null; throw error;});
  return sdkPromise;
}
export async function signIn(email,password) { const s=await initFirebase(); return (await s.a.signInWithEmailAndPassword(s.auth,email,password)).user; }
export async function signUp(email,password) { const s=await initFirebase(); return (await s.a.createUserWithEmailAndPassword(s.auth,email,password)).user; }
export async function resetPassword(email) { const s=await initFirebase(); await s.a.sendPasswordResetEmail(s.auth,email); }
export async function signOutUser() { if(sdkPromise) { const s=await initFirebase(); await s.a.signOut(s.auth); } }
export async function onUserChanged(cb) { const s=await initFirebase(); return s.a.onAuthStateChanged(s.auth,cb); }
let idbPromise;
function openIDB() {
  if (!idbPromise) idbPromise=new Promise((resolve,reject)=>{
    const r=indexedDB.open('pa_local_v1',1);
    r.onupgradeneeded=()=>{
      if(!r.result.objectStoreNames.contains('kv')) r.result.createObjectStore('kv');
      if(!r.result.objectStoreNames.contains('queue')) r.result.createObjectStore('queue',{keyPath:'id'});
    };
    r.onsuccess=()=>resolve(r.result); r.onerror=()=>reject(r.error);
  }).catch(error=>{idbPromise=null;throw error;});
  return idbPromise;
}
async function read(store,key) {
  const db=await openIDB();
  return new Promise((resolve,reject)=>{
    const tx=db.transaction(store,'readonly'), r=key===undefined?tx.objectStore(store).getAll():tx.objectStore(store).get(key);
    r.onsuccess=()=>resolve(r.result);r.onerror=()=>reject(r.error);
  });
}
async function write(store,key,value) {
  const db=await openIDB();
  return new Promise((resolve,reject)=>{
    const tx=db.transaction(store,'readwrite'), st=tx.objectStore(store);
    if(value===undefined) st.delete(key); else if(st.keyPath) st.put(value); else st.put(value,key);
    tx.oncomplete=()=>resolve();tx.onerror=()=>reject(tx.error);tx.onabort=()=>reject(tx.error || Error('Local save aborted.'));
  });
}
// Confirm that this preview/browser can commit and read local records before opening books.
export async function checkLocalStorage() {
  const key=`storage-check:${idgen()}`;
  try {
    await write('kv',key,'ok');
    if(await read('kv',key)!=='ok')throw Error('Local storage verification failed.');
    await write('kv',key,undefined);
  } catch(error) {
    throw Error(`Local saving is unavailable in this preview. Open the project through a local web server or Safari and allow website storage. ${error.message}`);
  }
  return storageProtection();
}
export async function storageProtection(request=false) {
  let persistent=false;
  try {
    if(request && navigator.storage?.persist)persistent=await navigator.storage.persist();
    else if(navigator.storage?.persisted)persistent=await navigator.storage.persisted();
  } catch { /* The committed IndexedDB save remains valid when this optional API is unavailable. */ }
  return {persistent,canRequest:!!navigator.storage?.persist};
}
const snapshotKey=userId=>`${userId}:snapshot`;
const lock=(userId,fn)=>navigator.locks ? navigator.locks.request(`pa:${userId}`,fn) : fn();
export async function getQueueSize(userId) { return (await read('queue')).filter(x=>x.uid===userId).length; }
function applyOps(data,ops) {
  const next=structuredClone(data);
  for(const op of ops) {
    const items=next[op.collection], i=items.findIndex(x=>x.id===op.id2);
    if(op.type==='delete') { if(i>=0) items.splice(i,1); }
    else { const record={...(i>=0?items[i]:{}),...op.data,id:op.id2}; if(i>=0)items[i]=record;else items.push(record); }
  }
  return next;
}
async function persist(userId,makeOps) {
  // Read, validate, write snapshot, and enqueue in ONE transaction, including across tabs.
  const db=await openIDB();
  return new Promise((resolve,reject)=>{
    const tx=db.transaction(['kv','queue'],'readwrite'), kv=tx.objectStore('kv');
    let failure;
    const request=kv.get(snapshotKey(userId));
    request.onsuccess=()=>{
      try {
        const data=request.result || empty(), ops=makeOps(data);
        if(!ops.length) return;
        const next=applyOps(data,ops);
        kv.put(next,snapshotKey(userId));
        if(userId!==LOCAL_UID) {
          const sequenceKey=`${userId}:queue-sequence`, sequence=kv.get(sequenceKey);
          sequence.onsuccess=()=>{
            const queuedAt=Math.max(Date.now(),Number(sequence.result || 0)+1);
            kv.put(queuedAt,sequenceKey);
            tx.objectStore('queue').put({id:idgen(),uid:userId,type:'batch',ops,queuedAt});
          };
        }
      } catch(e) { failure=e;tx.abort(); }
    };
    tx.oncomplete=()=>resolve();tx.onerror=()=>reject(failure || tx.error);tx.onabort=()=>reject(failure || tx.error || Error('Save aborted.'));
  });
}
async function flush(userId) {
  if(userId===LOCAL_UID || !navigator.onLine) return;
  const mine=(await read('queue')).filter(x=>x.uid===userId).sort((a,b)=>a.queuedAt-b.queuedAt);
  if(!mine.length) return;
  const s=await initFirebase();
  for(const item of mine) {
    const batch=s.f.writeBatch(s.db);
    for(const op of item.type==='batch'?item.ops:[item]) {
      const ref=s.f.doc(s.db,'users',userId,op.collection,op.id2);
      if(op.type==='delete')batch.delete(ref);else if(op.type==='update')batch.update(ref,op.data);else batch.set(ref,op.data,{merge:true});
    }
    await withTimeout(batch.commit());
    await write('queue',item.id,undefined);
  }
}
export const flushQueue=userId=>lock(userId,()=>flush(userId));
function withTimeout(promise) {
  let timer;
  return Promise.race([promise,new Promise((_,reject)=>{timer=setTimeout(()=>reject(Error('Cloud connection timed out. Your saved local changes remain pending.')),10000);})]).finally(()=>clearTimeout(timer));
}
export async function loadAll(userId) {
  return lock(userId,async()=>{
    const cached=await read('kv',snapshotKey(userId));
    if(userId===LOCAL_UID) return {data:cached || empty(),source:'local',pending:0};
    let error;
    if(navigator.onLine) {
      try {
        await flush(userId);
        const s=await initFirebase();
        const names=['accounts','journalHeaders','journalLines'];
        const collections=await withTimeout(Promise.all(names.map(name=>s.f.getDocsFromServer(s.f.collection(s.db,'users',userId,name)))));
        const data=Object.fromEntries(names.map((name,i)=>[name,collections[i].docs.map(d=>({...d.data(),id:d.id}))]));
        await write('kv',snapshotKey(userId),data);
        return {data,source:'cloud',pending:0};
      } catch(e) {error=e.message;}
    } else error='Offline. Cloud changes will sync when you reconnect.';
    return {data:cached || empty(),source:'cache',pending:await getQueueSize(userId),error,unavailable:!cached};
  });
}
const set=(collection,data)=>({type:'set',collection,id2:data.id,data});
export async function saveAccount(userId,account) {
  return lock(userId,()=>persist(userId,data=>{
    const normalized=normalizeAccounts([account])[0];
    normalized.name=clampStr(normalized.name,120);normalized.code=clampStr(normalized.code,30);
    if(!normalized.name || !TYPES.includes(normalized.type))throw Error('Enter an account name and valid type.');
    if(normalized.code && data.accounts.some(a=>a.id!==normalized.id && a.code===normalized.code))throw Error('That account code is already in use.');
    const old=normalizeAccounts(data.accounts).find(a=>a.id===normalized.id);
    if(old && data.journalLines.some(l=>l.accountId===old.id) && (old.type!==normalized.type || old.normalBalance!==normalized.normalBalance))
      throw Error('An account with posted entries must keep its type and normal balance.');
    return [set('accounts',{...normalized,id:normalized.id || idgen(),createdAt:old?.createdAt || Date.now()})];
  }));
}
export async function deleteAccount(userId,id) {
  return lock(userId,()=>persist(userId,data=>{
    if(data.journalLines.some(l=>l.accountId===id))throw Error('This account has posted entries. Disable it to preserve its history.');
    return [{type:'delete',collection:'accounts',id2:id}];
  }));
}
export async function postEntry(userId,entry) {
  return lock(userId,()=>persist(userId,data=>{
    if(!validDate(entry.date))throw Error('Enter a valid journal date.');
    if(entry.lines.length>200 || !validateEntry(entry.lines).ok)throw Error('Use at least two lines, one positive debit or credit per line, two decimal places, and equal totals.');
    if(entry.lines.some(l=>!data.accounts.some(a=>a.id===l.accountId && a.isActive!==false)))throw Error('Choose an active account on every line.');
    const header={id:idgen(),date:entry.date,memo:clampStr(entry.memo,500),ref:clampStr(entry.ref,100),createdAt:Date.now()};
    return [set('journalHeaders',header),...entry.lines.map(l=>set('journalLines',{
      id:idgen(),headerId:header.id,accountId:l.accountId,debit:Number(l.debit || 0),credit:Number(l.credit || 0),createdAt:header.createdAt
    }))];
  }));
}
export async function createStarterAccounts(userId) {
  return lock(userId,()=>persist(userId,data=>{
    if(data.accounts.length)throw Error('Starter accounts are available only for an empty chart.');
    const seed=[['1000','Checking','Asset'],['1100','Savings','Asset'],['2000','Credit card','Liability'],['3000','Opening equity','Equity'],['4000','Income','Revenue'],['5000','Housing','Expense'],['5100','Groceries','Expense'],['5200','Transportation','Expense'],['5300','Other expenses','Expense']];
    return seed.map(([code,name,type])=>set('accounts',normalizeAccounts([{id:idgen(),code,name,type,isActive:true,createdAt:Date.now()}])[0]));
  }));
}
export async function exportData(userId) {return {version:1,exportedAt:new Date().toISOString(),data:(await read('kv',snapshotKey(userId))) || empty()};}
export function validateBackup(backup) {
  if(backup.version!==1 || !backup.data)throw Error('Choose a version 1 Personal Accounting JSON backup.');
  const data=backup.data;
  for(const name of ['accounts','journalHeaders','journalLines']) {
    if(!Array.isArray(data[name]))throw Error('Backup is missing accounting records.');
    const ids=new Set();
    for(const item of data[name]) {
      if(!item || typeof item.id!=='string' || !item.id || item.id.includes('/') || ids.has(item.id))throw Error('Backup has invalid or duplicate record IDs.');
      ids.add(item.id);
    }
  }
  data.accounts=normalizeAccounts(data.accounts);
  if(data.accounts.some(a=>typeof a.name!=='string' || !a.name.trim() || !TYPES.includes(a.type)))throw Error('Backup contains invalid accounts.');
  if(data.journalHeaders.some(h=>!validDate(h.date)))throw Error('Backup contains invalid dates.');
  if(data.journalLines.some(l=>!data.accounts.some(a=>a.id===l.accountId) || !data.journalHeaders.some(h=>h.id===l.headerId)))throw Error('Backup contains orphaned journal lines.');
  if(data.journalHeaders.some(h=>!validateEntry(data.journalLines.filter(l=>l.headerId===h.id)).ok))throw Error('Backup contains an unbalanced or invalid entry.');
  return data;
}
export async function importLocalBackup(userId,backup) {
  if(userId!==LOCAL_UID)throw Error('Restore is available in local mode only.');
  const data=validateBackup(backup);
  return lock(userId,()=>persist(userId,current=>{
    if(current.accounts.length || current.journalHeaders.length || current.journalLines.length)throw Error('Restore requires empty local books to prevent overwriting existing records.');
    return Object.entries(data).filter(([name])=>['accounts','journalHeaders','journalLines'].includes(name)).flatMap(([name,items])=>items.map(item=>set(name,item)));
  }));
}
