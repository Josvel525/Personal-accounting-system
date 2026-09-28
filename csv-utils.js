export function encodeCSV(headers,rows=[]){const quote=v=>`"${String(v ?? '').replace(/"/g,'""')}"`;return '\uFEFF'+[headers,...rows].map(r=>r.map(quote).join(',')).join('\r\n')+'\r\n';}
export function readCSV(text,{maxRows=2000,maxBytes=2000000}={}){
 if(typeof text!=='string' || new TextEncoder().encode(text).length>maxBytes)throw Error('CSV file exceeds the size limit.');
 text=text.replace(/^\uFEFF/,'');const records=[];let row=[],cell='',mode='plain',line=1,startLine=1;
 const pushRow=()=>{row.push(cell);if(row.some(v=>v.trim()))records.push({cells:row,line:startLine});row=[];cell='';mode='plain';};
 for(let i=0;i<text.length;i++){
  const c=text[i];
  if(mode==='quoted'){
   if(c==='"'){if(text[i+1]==='"'){cell+='"';i++;}else mode='closed';}
   else{cell+=c;if(c==='\n')line++;}
  }else if(c===','){row.push(cell);cell='';mode='plain';}
  else if(c==='\r' || c==='\n'){if(c==='\r' && text[i+1]==='\n')i++;pushRow();line++;startLine=line;}
  else if(mode==='closed'){if(c!==' ' && c!=='\t')throw Error(`CSV line ${line}: unexpected text after a closing quote.`);}
  else if(c==='"'){if(cell.trim())throw Error(`CSV line ${line}: quotes must surround the entire field.`);cell='';mode='quoted';}
  else cell+=c;
 }
 if(mode==='quoted')throw Error(`CSV line ${startLine}: unclosed quoted field.`);
 pushRow();const header=records.shift();if(!header)throw Error('The CSV file is empty.');
 const headers=header.cells.map(h=>h.trim().toLowerCase());
 if(headers.some(h=>!h) || new Set(headers).size!==headers.length)throw Error('CSV headers must be nonempty and unique.');
 if(!records.length)throw Error('The template has headers only. Add your data below the header row.');
 if(records.length>maxRows)throw Error(`Import at most ${maxRows.toLocaleString()} CSV rows per file.`);
 return {headers,records:records.map(({cells,line})=>{
  if(cells.length!==headers.length)throw Error(`CSV line ${line}: expected ${headers.length} columns, found ${cells.length}. Use commas and quote values containing commas.`);
  return {line,values:Object.fromEntries(headers.map((h,i)=>[h,cells[i].trim()]))};
 })};
}
