import { clampStr } from "./utils.js";
import { signIn, signUp, signOutUser, onUserChanged } from "./db.js";

export function wireAuthUI({ onSignedIn, onSignedOut, toast }) {
  const elEmail = document.getElementById("authEmail");
  const elPass = document.getElementById("authPassword");

  document.getElementById("btnSignIn").onclick = async () => {
    try {
      await signIn(clampStr(elEmail.value), clampStr(elPass.value));
    } catch (e) { toast(e.message, "bad"); }
  };

  document.getElementById("btnSignUp").onclick = async () => {
    try {
      await signUp(clampStr(elEmail.value), clampStr(elPass.value));
      toast("Account created!");
    } catch (e) { toast(e.message, "bad"); }
  };

  document.getElementById("btnSignOut").onclick = async () => {
    await signOutUser();
  };

  onUserChanged((user) => user ? onSignedIn(user) : onSignedOut());
}
