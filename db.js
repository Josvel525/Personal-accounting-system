/**
 * db.js
 * Firebase (Firestore + Auth) + IndexedDB cache + offline queue
 * GitHub Pages friendly (ES modules via CDN)
 */

import { uid as idgen } from "./utils.js";

/* =========================
   Firebase SDK imports
========================= */
import { initializeApp } from "https://www.gstatic.com/firebasejs/10.12.2/firebase-app.js";
import {
  getAuth,
  onAuthStateChanged,
  signOut,
  sendPasswordResetEmail,
  createUserWithEmailAndPassword,
  signInWithEmailAndPassword,
} from "https://www.gstatic.com/firebasejs/10.12.2/firebase-auth.js";

import {
  getFirestore,
  doc,
  collection,
  getDocs,
  setDoc,
  deleteDoc,
  updateDoc,
  writeBatch,
  query,
  orderBy,
  where,
} from "https://www.gstatic.com/firebasejs/10.12.2/firebase-firestore.js";

/* =========================
   Firebase Config (FIXED)
========================= */
const firebaseConfig = {
  apiKey: "AIzaSyCprWuMnOFI91MaWg5H63Ik3_MPWmi1JPM",
  authDomain: "personal-accounting-syst-2188a.firebaseapp.com",
  projectId: "personal-accounting-syst-2188a",
  storageBucket: "personal-accounting-syst-2188a.appspot.com",
  messagingSenderId: "517983866974",
  appId: "1:517983866974:web:2f108129c717915531e4cf"
};

/* =========================
   Firebase Init
========================= */
let _app = null;
let _auth = null;
let _db = null;

export function initFirebase() {
  if (_app) return { app: _app, auth: _auth, db: _db };
  _app = initializeApp(firebaseConfig);
  _auth = getAuth(_app);
  _db = getFirestore(_app);
  return { app: _app, auth: _auth, db: _db };
}

function auth() {
  if (!_auth) initFirebase();
  return _auth;
}

function firestore() {
  if (!_db) initFirebase();
  return _db;
}

/* =========================
   IndexedDB (offline cache)
========================= */
const IDB_NAME = "pa_local_v1";
const IDB_VER = 1;

function openIDB() {
  return new Promise((resolve, reject) => {
    const req = indexedDB.open(IDB_NAME, IDB_VER);
    req.onupgradeneeded = () => {
      const db = req.result;
      if (!db.objectStoreNames.contains("kv")) db.createObjectStore("kv");
      if (!db.objectStoreNames.contains("queue"))
        db.createObjectStore("queue", { keyPath: "id" });
    };
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
}

async function idbGet(store, key) {
  const db = await openIDB();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(store, "readonly");
    const st = tx.objectStore(store);
    const req = st.get(key);
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
}

async function idbSet(store, key, val) {
  const db = await openIDB();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(store, "readwrite");
    const st = tx.objectStore(store);
    const req = st.put(val, key);
    req.onsuccess = () => resolve(true);
    req.onerror = () => reject(req.error);
  });
}

async function idbDel(store, key) {
  const db = await openIDB();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(store, "readwrite");
    const st = tx.objectStore(store);
    const req = st.delete(key);
    req.onsuccess = () => resolve(true);
    req.onerror = () => reject(req.error);
  });
}

async function idbAll(store) {
  const db = await openIDB();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(store, "readonly");
    const st = tx.objectStore(store);
    const req = st.getAll();
    req.onsuccess = () => resolve(req.result || []);
    req.onerror = () => reject(req.error);
  });
}

/* =========================
   Helpers
========================= */
function k(uid, name) {
  return `${uid}:${name}`;
}

async function cacheGet(uid, key) {
  return await idbGet("kv", k(uid, key));
}

async function cacheSet(uid, key, val) {
  return await idbSet("kv", k(uid, key), val);
}

function col(uid, name) {
  return collection(firestore(), "users", uid, name);
}

function docRef(uid, name, id) {
  return doc(firestore(), "users", uid, name, id);
}

/* =========================
   Auth API
========================= */
export async function signIn(email, password) {
  const cred = await signInWithEmailAndPassword(auth(), email, password);
  return cred.user;
}

export async function signUp(email, password) {
  const cred = await createUserWithEmailAndPassword(auth(), email, password);
  return cred.user;
}

export async function resetPassword(email) {
  await sendPasswordResetEmail(auth(), email);
}

export async function signOutUser() {
  await signOut(auth());
}

export function onUserChanged(cb) {
  return onAuthStateChanged(auth(), cb);
}

/* =========================
   Offline Queue
========================= */
async function enqueue(uid, op) {
  const item = {
    id: `${idgen()}:${Date.now()}`,
    uid,
    ...op,
    queuedAt: Date.now(),
  };
  await idbSet("queue", item.id, item);
  return item;
}

export async function getQueueSize() {
  const all = await idbAll("queue");
  return all.length;
}

export async function flushQueue(currentUid) {
  if (!navigator.onLine) return;
  const all = await idbAll("queue");
  const mine = all.filter(x => x.uid === currentUid)
                  .sort((a, b) => a.queuedAt - b.queuedAt);

  for (const item of mine) {
    try {
      if (item.type === "set") {
        await setDoc(docRef(item.uid, item.collection, item.id2), item.data, { merge: true });
      } else if (item.type === "update") {
        await updateDoc(docRef(item.uid, item.collection, item.id2), item.data);
      } else if (item.type === "delete") {
        await deleteDoc(docRef(item.uid, item.collection, item.id2));
      }
      await idbDel("queue", item.id);
    } catch {
      break;
    }
  }
}

/* =========================
   Load all user data
========================= */
export async function loadAll(uid) {
  if (navigator.onLine) {
    try {
      const [accounts, headers, lines] = await Promise.all([
        getDocs(query(col(uid, "accounts"), orderBy("createdAt", "asc"))),
        getDocs(query(col(uid, "journalHeaders"), orderBy("date", "asc"))),
        getDocs(query(col(uid, "journalLines"), orderBy("createdAt", "asc"))),
      ]);

      const data = {
        accounts: accounts.docs.map(d => ({ id: d.id, ...d.data() })),
        journalHeaders: headers.docs.map(d => ({ id: d.id, ...d.data() })),
        journalLines: lines.docs.map(d => ({ id: d.id, ...d.data() })),
      };

      await cacheSet(uid, "snapshot", data);
      return { data, source: "cloud" };
    } catch {}
  }

  return {
    data: (await cacheGet(uid, "snapshot")) || {
      accounts: [],
      journalHeaders: [],
      journalLines: [],
    },
    source: "cache",
  };
}