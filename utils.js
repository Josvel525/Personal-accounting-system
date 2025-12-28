export const fmt = {
  money(n){
    const x = Number(n || 0);
    return x.toLocaleString(undefined, { style:"currency", currency:"USD" });
  },
  dateISO(d){
    if (!d) return "";
    const dt = (d instanceof Date) ? d : new Date(d);
    const yyyy = dt.getFullYear();
    const mm = String(dt.getMonth()+1).padStart(2,'0');
    const dd = String(dt.getDate()).padStart(2,'0');
    return `${yyyy}-${mm}-${dd}`;
  }
};

export function el(html){
  const t = document.createElement("template");
  t.innerHTML = html.trim();
  return t.content.firstElementChild;
}

export function uid(){
  return crypto.randomUUID();
}

export function safeNum(v){
  const n = Number(v);
  return Number.isFinite(n) ? n : 0;
}

export function sum(arr, fn){
  return arr.reduce((a, x) => a + (fn ? fn(x) : x), 0);
}

export function groupBy(arr, keyFn){
  const m = new Map();
  for (const x of arr){
    const k = keyFn(x);
    if (!m.has(k)) m.set(k, []);
    m.get(k).push(x);
  }
  return m;
}

export function clampStr(s, max=220){
  const t = String(s ?? "").trim();
  return t.length > max ? t.slice(0, max) : t;
}

export function todayISO(){
  return fmt.dateISO(new Date());
}

export function byDateAsc(a,b){
  return String(a.date).localeCompare(String(b.date));
}

export function debounce(fn, ms=250){
  let t=null;
  return (...args)=>{
    clearTimeout(t);
    t=setTimeout(()=>fn(...args), ms);
  };
}