import { clampStr } from "./utils.js";
import {
  signIn,
  signUp,
  resetPassword,
  signOutUser,
  onUserChanged,
  initFirebase,
} from "./db.js";

export function wireAuthUI({ onSignedIn, onSignedOut, toast }) {
  initFirebase();

  const elEmail = document.getElementById("authEmail");
  const elPass = document.getElementById("authPassword");

  const btnIn = document.getElementById("btnSignIn");
  const btnUp = document.getElementById("btnSignUp");
  const btnForgot = document.getElementById("btnForgot");

  const btnSignOut = document.getElementById("btnSignOut");
  btnSignOut.addEventListener("click", async () => {
    try {
      await signOutUser();
    } catch (e) {
      toast(`Sign out failed: ${e?.message || e}`, "bad");
    }
  });

  btnIn.addEventListener("click", async () => {
    const email = clampStr(elEmail.value, 120);
    const pass = clampStr(elPass.value, 200);
    try {
      const user = await signIn(email, pass);
      toast(`Signed in: ${user.email}`);
    } catch (e) {
      toast(`Sign in failed: ${e?.message || e}`, "bad");
    }
  });

  btnUp.addEventListener("click", async () => {
    const email = clampStr(elEmail.value, 120);
    const pass = clampStr(elPass.value, 200);
    try {
      const user = await signUp(email, pass);
      toast(`Account created: ${user.email}`);
    } catch (e) {
      toast(`Sign up failed: ${e?.message || e}`, "bad");
    }
  });

  btnForgot.addEventListener("click", async () => {
    const email = clampStr(elEmail.value, 120);
    if (!email) return toast("Enter your email first.", "warn");
    try {
      await resetPassword(email);
      toast("Password reset email sent.");
    } catch (e) {
      toast(`Reset failed: ${e?.message || e}`, "bad");
    }
  });

  onUserChanged((user) => {
    if (user) onSignedIn(user);
    else onSignedOut();
  });
}