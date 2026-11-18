// Foodfitti Real Backend — Render Web Service
// Serves index.html + admin.html + /actions API. Keys ONLY in Render env vars.
const http = require('http');
const fs = require('fs');
const path = require('path');
const PORT = process.env.PORT || 10000;
const SUPABASE_URL = (process.env.SUPABASE_URL || '').replace(/\/$/, '');
const SUPABASE_KEY = process.env.SUPABASE_SERVICE_KEY || process.env.SUPABASE_ANON_KEY || process.env.SUPABASE_KEY || '';
function sendJson(res, status, obj){
  res.writeHead(status, {'Content-Type':'application/json','Access-Control-Allow-Origin':'*','Access-Control-Allow-Methods':'GET,POST,PATCH,DELETE,OPTIONS','Access-Control-Allow-Headers':'Content-Type,Authorization'});
  res.end(JSON.stringify(obj));
}
function sendFile(res, filePath, contentType){
  fs.readFile(filePath,(err,data)=>{
    if(err){res.writeHead(404,{'Content-Type':'text/plain'});return res.end('Not found');}
    res.writeHead(200,{'Content-Type':contentType,'Cache-Control':'no-cache'});
    res.end(data);
  });
}
async function supa(table, method, query, body){
  const url = SUPABASE_URL + '/rest/v1/' + table + (query||'');
  const headers={'apikey':SUPABASE_KEY,'Authorization':'Bearer '+SUPABASE_KEY,'Content-Type':'application/json','Prefer':'return=representation'};
  return await fetch(url,{method,headers,body: body?JSON.stringify(body):undefined});
}
function isUuid(v){ return typeof v==='string' && /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(v); }
async function handleRecords(action, args){
  const table = args.collection;
  if(!SUPABASE_URL || !SUPABASE_KEY) throw new Error('Backend not configured: set SUPABASE_URL + SUPABASE_ANON_KEY in Render Environment Variables');
  if(action==='records.list'){
    const res = await supa(table,'GET','?select=id,data&order=created_at.asc&limit=1000');
    if(!res.ok){ const t=await res.text().catch(()=> ''); throw new Error('Supabase list failed '+res.status+' '+t.slice(0,200)); }
    const rows = await res.json();
    return {records: rows.map(r=>({id:String(r.id), value:r.data}))};
  }
  if(action==='records.create'){
    const value = args.value;
    let recordId = args.id || args.idempotency_key || null;
    // Try with explicit id first (text-id tables). If table is uuid-id, Supabase rejects text id -> retry without id and let DB generate uuid.
    if(recordId){
      let res = await supa(table,'POST','?on_conflict=id',{id:recordId, data:value});
      if(res.ok){ const rows=await res.json().catch(()=>[]); const rid = rows && rows[0] ? String(rows[0].id) : String(recordId); return {id:rid, value}; }
      const errText = await res.text().catch(()=> '');
      // If error is about invalid uuid / invalid input, retry without id
      if(/invalid input|uuid|22P02|23502|invalid/i.test(errText) || res.status===400){
        let res2 = await supa(table,'POST','',{data:value});
        if(res2.ok){ const rows2=await res2.json().catch(()=>[]); return {id: rows2 && rows2[0] ? String(rows2[0].id) : String(recordId), value}; }
        throw new Error('Supabase create failed '+res2.status+' '+errText.slice(0,200));
      }
      throw new Error('Supabase create failed '+res.status+' '+errText.slice(0,200));
    } else {
      let res = await supa(table,'POST','',{data:value});
      if(!res.ok) throw new Error('Supabase create failed '+res.status);
      const rows=await res.json().catch(()=>[]);
      return {id: rows && rows[0] ? String(rows[0].id) : ('rec_'+Date.now()), value};
    }
  }
  if(action==='records.replace' || action==='records.put'){
    const id = args.id ? String(args.id) : null;
    const val = args.value;
    if(!id){
      // No id -> create with idempotency if present
      return await handleRecords('records.create',{collection:table, value:val, idempotency_key: args.idempotency_key});
    }
    // PATCH by id
    let res = await supa(table,'PATCH','?id=eq.'+encodeURIComponent(id),{data:val});
    if(res.ok){
      const rows=await res.json().catch(()=>[]);
      if(rows && rows.length) return {id, value:val};
      // Not exists -> create with same id (or without if uuid table)
      return await handleRecords('records.create',{collection:table, value:val, id});
    }
    // PATCH failed (e.g. uuid mismatch) -> try create without id
    const txt = await res.text().catch(()=> '');
    if(/uuid|22P02/i.test(txt)){
      let res2 = await supa(table,'POST','',{data:val});
      if(res2.ok){ const r2=await res2.json().catch(()=>[]); return {id: r2 && r2[0] ? String(r2[0].id) : id, value:val}; }
    }
    throw new Error('Supabase replace failed '+res.status+' '+txt.slice(0,200));
  }
  if(action==='records.delete'){
    const id=String(args.id);
    await supa(table,'DELETE','?id=eq.'+encodeURIComponent(id));
    return {deleted:true};
  }
  if(action==='records.get'){
    const id=String(args.id);
    const res=await supa(table,'GET','?select=id,data&id=eq.'+encodeURIComponent(id));
    if(res.ok){ const rows=await res.json(); if(rows.length) return {id:String(rows[0].id), value:rows[0].data}; }
    throw new Error('Supabase get failed');
  }
  if(action==='records.collections'){ return {collections:[]}; }
  throw new Error('Unknown action '+action);
}
const server=http.createServer(async (req,res)=>{
  if(req.method==='OPTIONS'){ res.writeHead(204,{'Access-Control-Allow-Origin':'*','Access-Control-Allow-Methods':'GET,POST,PATCH,DELETE,OPTIONS','Access-Control-Allow-Headers':'Content-Type,Authorization'}); return res.end(); }
  const urlPath=(req.url||'/').split('?')[0];
  if(urlPath==='/api/health' || urlPath==='/health'){ return sendJson(res,200,{ok:true,configured:Boolean(SUPABASE_URL && SUPABASE_KEY),time:new Date().toISOString()}); }
  if(urlPath==='/actions' && req.method==='POST'){
    let raw=''; req.on('data',c=>raw+=c); req.on('end',async()=>{
      try{
        const payload=JSON.parse(raw||'{}');
        const action=payload.action; const args=payload.args||{};
        if(!action || !String(action).startsWith('records.')) return sendJson(res,400,{error:'Unknown action'});
        const data=await handleRecords(action,args);
        return sendJson(res,200,{data});
      }catch(e){ console.error('actions error', e && e.message); return sendJson(res,500,{error:e.message||'Backend error'}); }
    }); return;
  }
  if(urlPath==='/' || urlPath==='/index.html') return sendFile(res, path.join(__dirname,'index.html'),'text/html');
  if(urlPath==='/admin.html' || urlPath==='/admin') return sendFile(res, path.join(__dirname,'admin.html'),'text/html');
  if(urlPath==='/favicon.ico'){ res.writeHead(204); return res.end(); }
  const safe=path.normalize(path.join(__dirname,'.'+urlPath));
  if(safe.startsWith(__dirname) && fs.existsSync(safe) && fs.statSync(safe).isFile()){
    const ext=path.extname(safe).toLowerCase();
    const types={'.html':'text/html','.css':'text/css','.js':'text/javascript','.json':'application/json','.png':'image/png','.jpg':'image/jpeg','.svg':'image/svg+xml'};
    return sendFile(res,safe,types[ext]||'application/octet-stream');
  }
  res.writeHead(404,{'Content-Type':'text/plain'}); res.end('Not found');
});
server.listen(PORT,'0.0.0.0',()=>console.log('Foodfitti backend listening on '+PORT+' | Supabase configured: '+Boolean(SUPABASE_URL && SUPABASE_KEY)));
