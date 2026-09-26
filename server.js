import http from 'node:http';
import {readFile} from 'node:fs/promises';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
const root=path.dirname(fileURLToPath(import.meta.url));
const types={'.html':'text/html','.js':'text/javascript','.css':'text/css','.json':'application/json'};
http.createServer(async(req,res)=>{
  try{
    const requestPath=decodeURIComponent(new URL(req.url,'http://localhost').pathname);
    const target=path.resolve(root,'.'+(requestPath==='/'?'/index.html':requestPath));
    if(!target.startsWith(root+path.sep) || path.relative(root,target).split(path.sep).some(p=>p.startsWith('.'))){res.writeHead(403);res.end();return;}
    const data=await readFile(target);res.writeHead(200,{'Content-Type':types[path.extname(target)] || 'text/plain','Cache-Control':'no-cache'});res.end(data);
  }catch{res.writeHead(404);res.end('Not found');}
}).listen(Number(process.env.PORT || 4173),'127.0.0.1',()=>console.log(`Personal Accounting: http://127.0.0.1:${process.env.PORT || 4173}`));
