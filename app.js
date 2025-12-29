document.addEventListener("DOMContentLoaded", async () => {
  const { wireAuthUI } = await import("./auth.js");
  const {
    initFirebase,
    loadAll,
    flushQueue,
    getQueueSize,
  } = await import("./db.js");
  const { createUI } = await import("./ui.js");

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
    const colors = {
      good: "var(--good)",
      warn: "var(--warn)",
      bad: "var(--bad)",
    };
    syncDot.style.background = colors[status] || colors.warn;
    syncText.textContent = msg;
  }

  function toast(msg, kind = "good") {
    toastText.textContent = msg;
    toastEl.style.display = "block";
    clearTimeout(toastEl._t);
    toastEl._t = setTimeout(() => (toastEl.style.display = "none"), 2200);
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

      await loadAll(user.uid);

      toast("Signed in and ready.");
    },
    onSignedOut: () => {
      state.user = null;
      showSignedOut();
      toast("Signed out.", "warn");
    },
  });
});