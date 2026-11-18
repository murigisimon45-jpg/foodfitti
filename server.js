// Foodfitti Real Backend — Render Web Service
// Serves index.html (customer) + admin.html (admin) + /actions API
// Supabase keys live ONLY in Render Environment Variables, NEVER in HTML.
// Env vars to set in Render Dashboard:
//   SUPABASE_URL = https://YOUR-PROJECT.supabase.co
//   SUPABASE_ANON_KEY = your anon key (or SUPABASE_SERVICE_KEY)
//   PORT is set automatically by Render.

const http = require('http');
const fs = require('fs');
const path = require('path');

const PORT = process.env.PORT || 10000;
const SUPABASE_URL = (process.env.SUPABASE_URL || '').replace(/\/$/, '');
const SUPABASE_KEY = process.env.SUPABASE_SERVICE_KEY || process.env.SUPABASE_ANON_KEY || process.env.SUPABASE_KEY || '';

function sendJson(res, status, obj){
  const body = JSON.stringify(obj);
  res.writeHead(status, {'Content-Type':'application/json', 'Access-Control-Allow-Origin':'*', 'Access-Control-Allow-Methods':'GET,POST,PATCH,DELETE,OPTIONS', 'Access-Control-Allow-Headers':'Content-Type,Authorization'});
  res.end(body);
}
function sendFile(res, filePath, contentType){
  fs.readFile(filePath, (err, data)=>{
    if(err){ res.writeHead(404, {'Content-Type':'text/plain'}); return res.end('Not found'); }
    res.writeHead(200, {'Content-Type': contentType, 'Cache-Control':'no-cache'});
    res.end(data);
  });
}

async function supaFetch(table, method, query, body){
  const url = SUPABASE_URL + '/rest/v1/' + table + (query || '');
  const headers = {
    'apikey': SUPABASE_KEY,
    'Authorization': 'Bearer ' + SUPABASE_KEY,
    'Content-Type': 'application/json',
    'Prefer': 'return=representation'
  };
  const r = await fetch(url, {method, headers, body: body ? JSON.stringify(body) : undefined});
  return r;
}

async function handleRecords(action, args){
  const col = args.collection;
  const table = col; // Supabase table name == collection name
  if(!SUPABASE_URL || !SUPABASE_KEY){
    throw new Error('Backend not configured: set SUPABASE_URL + SUPABASE_ANON_KEY in Render Environment Variables');
  }
  if(action === 'records.list'){
    const res = await supaFetch(table, 'GET', '?select=id,data&order=created_at.asc&limit=1000');
    if(!res.ok) throw new Error('Supabase list failed ' + res.status);
    const rows = await res.json();
    const records = rows.map(r => ({id: r.id, value: r.data}));
    return {records};
  }
  if(action === 'records.create'){
    const value = args.value;
    const recordId = args.idempotency_key ? String(args.idempotency_key) : String(args.id || ('rec_' + Date.now() + '_' + Math.random().toString(36).slice(2,8)));
    const res = await supaFetch(table, 'POST', '?on_conflict=id', {id: recordId, data: value});
    if(!res.ok) throw new Error('Supabase create failed ' + res.status);
    return {id: recordId, value};
  }
  if(action === 'records.replace' || action === 'records.put'){
    const id = String(args.id);
    const val = args.value;
    const res = await supaFetch(table, 'PATCH', '?id=eq.' + encodeURIComponent(id), {data: val});
    if(res.ok){
      const rows = await res.json().catch(()=>[]);
      if(rows && rows.length) return {id, value: val};
      // PATCH returned 0 rows (not exists) -> create it
      const res2 = await supaFetch(table, 'POST', '?on_conflict=id', {id, data: val});
      if(res2.ok) return {id, value: val};
    }
    throw new Error('Supabase replace failed');
  }
  if(action === 'records.delete'){
    const id = String(args.id);
    await supaFetch(table, 'DELETE', '?id=eq.' + encodeURIComponent(id));
    return {deleted: true};
  }
  if(action === 'records.get'){
    const id = String(args.id);
    const res = await supaFetch(table, 'GET', '?select=id,data&id=eq.' + encodeURIComponent(id));
    if(res.ok){
      const rows = await res.json();
      if(rows.length) return {id: rows[0].id, value: rows[0].data};
    }
    throw new Error('Supabase get failed');
  }
  if(action === 'records.collections'){
    return {collections: []};
  }
  throw new Error('Unknown action ' + action);
}

const server = http.createServer(async (req, res)=>{
  // CORS preflight
  if(req.method === 'OPTIONS'){
    res.writeHead(204, {'Access-Control-Allow-Origin':'*', 'Access-Control-Allow-Methods':'GET,POST,PATCH,DELETE,OPTIONS', 'Access-Control-Allow-Headers':'Content-Type,Authorization'});
    return res.end();
  }
  const urlPath = (req.url || '/').split('?')[0];

  if(urlPath === '/api/health' || urlPath === '/health'){
    return sendJson(res, 200, {ok: true, configured: Boolean(SUPABASE_URL && SUPABASE_KEY), time: new Date().toISOString()});
  }

  if(urlPath === '/actions' && req.method === 'POST'){
    let raw = '';
    req.on('data', chunk => raw += chunk);
    req.on('end', async ()=>{
      try{
        const payload = JSON.parse(raw || '{}');
        const action = payload.action;
        const args = payload.args || {};
        if(!action || !String(action).startsWith('records.')){
          return sendJson(res, 400, {error: 'Unknown action'});
        }
        const data = await handleRecords(action, args);
        return sendJson(res, 200, {data});
      }catch(e){
        console.error('actions error', e && e.message);
        return sendJson(res, 500, {error: e.message || 'Backend error'});
      }
    });
    return;
  }

  // Static frontend — same origin, so frontend needs NO URL, NO keys
  if(urlPath === '/' || urlPath === '/index.html'){
    return sendFile(res, path.join(__dirname, 'index.html'), 'text/html');
  }
  if(urlPath === '/admin.html' || urlPath === '/admin'){
    return sendFile(res, path.join(__dirname, 'admin.html'), 'text/html');
  }
  if(urlPath === '/favicon.ico'){
    res.writeHead(204); return res.end();
  }
  // Any other static file in repo root
  const safe = path.normalize(path.join(__dirname, '.' + urlPath));
  if(safe.startsWith(__dirname) && fs.existsSync(safe) && fs.statSync(safe).isFile()){
    const ext = path.extname(safe).toLowerCase();
    const types = {'.html':'text/html', '.css':'text/css', '.js':'text/javascript', '.json':'application/json', '.png':'image/png', '.jpg':'image/jpeg', '.svg':'image/svg+xml'};
    return sendFile(res, safe, types[ext] || 'application/octet-stream');
  }
  res.writeHead(404, {'Content-Type':'text/plain'});
  res.end('Not found');
});

server.listen(PORT, ()=> console.log('Foodfitti backend listening on ' + PORT + ' | Supabase configured: ' + Boolean(SUPABASE_URL && SUPABASE_KEY)));
