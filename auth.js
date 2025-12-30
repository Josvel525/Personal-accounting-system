import { clampStr } from "./utils.js";
import { signIn, signUp, resetPassword, signOutUser, onUserChanged } from "./db.js";

export function wireAuthUI({ onSignedIn, onSignedOut, toast }) {
  const elEmail = document.getElementById("authEmail");
  const elPass = document.getElementById("authPassword");
  const btnIn = document.getElementById("btnSignIn");
  const btnUp = document.getElementById("btnSignUp");
  const btnForgot = document.getElementById("btnForgot");
  const btnSignOut = document.getElementById("btnSignOut");

  btnIn.onclick = async () => {
    const email = clampStr(elEmail.value, 120);
    const pass = clampStr(elPass.value, 200);
    if(!email || !pass) return toast("Email and password required", "bad");
    try {
      await signIn(email, pass);
      toast("Signing in...");
    } catch (e) {
      toast(e.message, "bad");
    }
  };

  btnUp.onclick = async () => {
    const email = clampStr(elEmail.value, 120);
    const pass = clampStr(elPass.value, 200);
    if(pass.length < 6) return toast("Password must be 6+ chars", "bad");
    try {
      await signUp(email, pass);
      toast("Account created!");
    } catch (e) {
      toast(e.message, "bad");
    }
  };

  btnSignOut.onclick = async () => {
    await signOutUser();
  };

  onUserChanged((user) => {
    if (user) onSignedIn(user);
    else onSignedOut();
  });
}
