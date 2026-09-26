import { signIn, signUp, resetPassword, onUserChanged } from './db.js';
export function wireAuthUI({onSignedIn,onSignedOut,toast}) {
  const email=document.getElementById('authEmail'),password=document.getElementById('authPassword');
  let subscribed=false,busy=false;
  const ids=['btnSignIn','btnSignUp','btnForgot'];
  async function subscribe(){if(subscribed)return;subscribed=true;try{
    await onUserChanged(user=>Promise.resolve(user?onSignedIn(user):onSignedOut()).catch(e=>toast(e.message,'bad')));
  }catch(e){subscribed=false;throw e;}}
  async function run(action){
    if(busy)return;if(!email.reportValidity() || !email.value.trim()){email.focus();return;}
    if(action!=='reset' && !password.value){toast('Enter your password.','bad');return;}
    busy=true;ids.forEach(id=>document.getElementById(id).disabled=true);
    try{
      if(action==='reset'){await resetPassword(email.value.trim());toast('Password reset requested. Check your email.');}
      else{localStorage.setItem('pa_mode','cloud');await (action==='signup'?signUp:signIn)(email.value.trim(),password.value);await subscribe();password.value='';}
    }catch(e){toast(e.message,'bad');}
    finally{busy=false;ids.forEach(id=>document.getElementById(id).disabled=false);}
  }
  document.getElementById('btnSignIn').onclick=()=>run('signin');
  document.getElementById('btnSignUp').onclick=()=>run('signup');
  document.getElementById('btnForgot').onclick=()=>run('reset');
  password.addEventListener('keydown',e=>{if(e.key==='Enter')run('signin');});
  if(localStorage.getItem('pa_mode')==='cloud')subscribe().catch(e=>toast(`Cloud sign-in unavailable: ${e.message}. You can still open separate local books.`,'bad'));
}
