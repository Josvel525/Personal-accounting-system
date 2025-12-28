import { wireAuthUI } from "./auth.js";
import {
  initFirebase,
  loadAll,
  ensureDefaults,
  flushQueue,
  getQueueSize,
} from "./db.js";
import { createUI } from "./ui.js";

initFirebase();

const authGate = document.getElementById("authGate");
const appViews = document.getElementById("appViews");

const syncDot = document.getElementById("syncDot");
const syncText = document.getElementById("syncText");
const btnSettings = document.getElementById("btnSettings");
const btnSignOut = document.getElementById("btnSignOut");

const modalBackdrop = document.getElementById("modalBackdrop");
const modalClose = document.getElementById("modalClose");
const modalTitle = document.getElementById("modalTitle");
const modalBody = document.getElementById("modalBody");
const modalFooter = document.getElementById("modalFooter");

const toastEl = document.getElementById("toast");
const toastText = document.getElementById("toastText");

const state = {
  user: null,
  route: "dashboard",
  data: { accounts: [], journalHeaders: [], journalLines: [] },
  filters: { start: null, end: null },
  reload: async () => {},
};

function setSync(status, msg) {
  // status: "good" | "warn" | "bad"
  const colors = {
    good: "var(--good)",
    warn: "var(--warn)",
    bad: "var(--bad)",
  };
  syncDot.style.background = colors[status] || colors.warn;
  syncDot.style.boxShadow =
    status === "good"
      ? "0 0 0 3px rgba(46,204,113,0.14)"
      : status === "bad"
      ? "0 0 0 3px rgba(255,90,95,0.14)"
      : "0 0 0 3px rgba(241,196,15,0.14)";
  syncText.textContent = msg;
}

function toast(msg, kind = "good") {
  toastText.textContent = msg;
  toastEl.style.display = "block";
  // border hint by kind
  toastEl.style.borderColor =
    kind === "bad"
      ? "rgba(255,90,95,0.35)"
      : kind === "warn"
      ? "rgba(241,196,15,0.35)"
      : "rgba(46,204,113,0.35)";

  clearTimeout(toastEl._t);
  toastEl._t = setTimeout(() => {
    toastEl.style.display = "none";
  }, 2200);
}

function openModal(title, bodyNode, footerNode) {
  modalTitle.textContent = title;
  modalBody.innerHTML = "";
  modalFooter.innerHTML = "";
  if (bodyNode) modalBody.appendChild(bodyNode);
  if (footerNode) modalFooter.appendChild(footerNode);
  modalBackdrop.style.display = "flex";
}
function closeModal() {
  modalBackdrop.style.display = "none";
  modalBody.innerHTML = "";
  modalFooter.innerHTML = "";
}

modalClose.addEventListener("click", closeModal);
modalBackdrop.addEventListener("click", (e) => {
  if (e.target === modalBackdrop) closeModal();
});

function setRoute(route) {
  state.route = route;
  uiRender();
}

document.querySelectorAll(".navItem").forEach((btn) => {
  btn.addEventListener("click", () => setRoute(btn.dataset.route));
});

btnSettings.addEventListener("click", () => setRoute("settings"));

let ui = null;
let uiRender = () => {};

async function refreshData() {
  if (!state.user) return;
  setSync("warn", "Loading…");

  // Attempt flush queue before load (if online)
  if (navigator.onLine) {
    await flushQueue(state.user.uid).catch(() => {});
  }

  const res = await loadAll(state.user.uid);
  state.data = res.data || { accounts: [], journalHeaders: [], journalLines: [] };

  const q = await getQueueSize().catch(() => 0);
  if (!navigator.onLine) {
    setSync("warn", `Offline • ${q} queued`);
  } else {
    setSync(q ? "warn" : "good", q ? `${q} queued • Online` : "Synced • Online");
  }
}

function showSignedIn() {
  authGate.style.display = "none";
  appViews.style.display = "block";
  btnSignOut.style.display = "inline-flex";
}

function showSignedOut() {
  authGate.style.display = "block";
  appViews.style.display = "none";
  btnSignOut.style.display = "none";
  setSync("warn", "Not signed in");
}

wireAuthUI({
  toast,
  onSignedIn: async (user) => {
    state.user = user;
    showSignedIn();

    await ensureDefaults(user.uid);
    await refreshData();

    // UI instance
    ui = createUI({
      getState: () => state,
      setRoute,
      openModal,
      closeModal,
      toast,
      setSyncText: (msg, kind = "warn") => setSync(kind, msg),
    });

    uiRender = ui.render;
    state.reload = async () => {
      await refreshData();
      uiRender();
    };

    uiRender();
    toast("Ready.");
  },
  onSignedOut: () => {
    state.user = null;
    state.data = { accounts: [], journalHeaders: [], journalLines: [] };
    showSignedOut();
    toast("Signed out.", "warn");
  },
});

// Online/offline listeners
window.addEventListener("online", async () => {
  if (!state.user) return;
  const qBefore = await getQueueSize().catch(() => 0);
  setSync(qBefore ? "warn" : "good", qBefore ? `${qBefore} queued • Syncing…` : "Syncing…");
  await flushQueue(state.user.uid).catch(() => {});
  await refreshData();
  uiRender();
});

window.addEventListener("offline", async () => {
  const q = await getQueueSize().catch(() => 0);
  setSync("warn", `Offline • ${q} queued`);
});