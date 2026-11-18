// Foodfitti Backend - Fixes blank Settings + refresh loop + status not showing
const http = require('http');
const fs = require('fs');
const path = require('path');
const PORT = process.env.PORT || 10000;
const SUPABASE_URL = (process.env.SUPABASE_URL || '').replace(/\/$/, '').trim();
const SUPABASE_KEY = (process.env.SUPABASE_SERVICE_KEY || process.env.SUPABASE_ANON_KEY || '').trim();
const DATA_FILE = path.join(__dirname, 'foodfitti-data.json');
let memory = {};
try { if (fs.existsSync(DATA_FILE)) memory = JSON.parse(fs.readFileSync(DATA_FILE, 'utf8') || '{}'); } catch (e) { memory = {}; }
function saveMem() { try { fs.writeFileSync(DATA_FILE, JSON.stringify(memory)); } catch (e) {} }
function memList(c) { return (memory[c] || []).map(r => ({ id: String(r.id), value: r.value })); }
function memUpsert(c, id, v) { if (!memory[c]) memory[c] = []; const ex = memory[c].find(x => String(x.id) === String(id)); if (ex) ex.value = v; else memory[c].push({ id: String(id), value: v }); saveMem(); }
async function supa(t, m, q, b) {
  const url = SUPABASE_URL + '/rest/v1/' + t + (q || '');
  return await fetch(url, { method: m, headers: { apikey: SUPABASE_KEY, Authorization: 'Bearer ' + SUPABASE_KEY, 'Content-Type': 'application/json', Prefer: 'return=representation' }, body: b ? JSON.stringify(b) : undefined });
}
const hasSupa = Boolean(SUPABASE_URL && SUPABASE_KEY);

// Mirror status BOTH ways: admin saves to orders -> also save to tracking, and vice versa
// This is why customer wasn't seeing status: admin and customer were reading different collections
async function mirrorStatus(changedCol, changedValue) {
  try {
    const v = changedValue || {};
    const orderId = v.orderId || v.id;
    const status = v.status || v.trackingStatus || v.tracking || (v.data && v.data.status);
    if (!orderId || !status) return;
    // 1. Update tracking record
    const trackVal = { orderId: String(orderId), status: String(status), updatedAt: new Date().toISOString() };
    memUpsert('foodfitti_tracking', 'track-' + orderId, trackVal);
    if (hasSupa) { try { await supa('foodfitti_tracking', 'POST', '?on_conflict=id', { id: 'track-' + orderId, data: trackVal }); } catch (e) {} }
    // 2. Update orders record status in memory (so list returns new status immediately)
    const orders = memory['foodfitti_orders'] || [];
    const o = orders.find(x => (x.value && (x.value.orderId === orderId || x.value.id === orderId)) || String(x.id) === String(orderId));
    if (o) { o.value = { ...o.value, status: String(status), trackingStatus: String(status) }; saveMem(); if (hasSupa) { try { await supa('foodfitti_orders', 'PATCH', '?id=eq.' + encodeURIComponent(o.id), { data: o.value }); } catch (e) {} } }
  } catch (e) {}
}

async function handle(action, args) {
  const col = args.collection;
  if (action === 'records.list') {
    if (hasSupa) {
      try {
        const r = await supa(col, 'GET', '?select=id,data&order=created_at.asc&limit=1000');
        if (r.ok) { const rows = await r.json(); const recs = rows.map(x => ({ id: String(x.id), value: x.data })); memory[col] = recs; saveMem(); 
          // If settings empty, return default so Settings tab doesn't crash on null / blank
          if (col === 'foodfitti_settings' && recs.length === 0) return { records: [{ id: 'foodfitti-settings-v1', value: { whatsapp: '', pochi: '', pochiNumber: '', whatsappNumber: '', deliveryAthiRiver: 0 } }] };
          return { records: recs }; }
      } catch (e) {}
    }
    if (col === 'foodfitti_settings' && memList(col).length === 0) return { records: [{ id: 'foodfitti-settings-v1', value: { whatsapp: '', pochi: '', pochiNumber: '', whatsappNumber: '', deliveryAthiRiver: 0 } }] };
    return { records: memList(col) };
  }
  if (action === 'records.create') {
    const v = args.value;
    let id = args.id || args.idempotency_key || null;
    if (col === 'foodfitti_admin' && v && v.type === 'passcode' && !id) id = 'admin-passcode-v1';
    if (col === 'foodfitti_settings' && !id) id = 'foodfitti-settings-v1';
    if (hasSupa && id) { try { const r = await supa(col, 'POST', '?on_conflict=id', { id, data: v }); if (r.ok) { memUpsert(col, id, v); await mirrorStatus(col, v); return { id: String(id), value: v }; } } catch (e) {} }
    if (hasSupa && !id) { try { const r = await supa(col, 'POST', '', { data: v }); if (r.ok) { const rows = await r.json().catch(() => []); const rid = rows && rows[0] ? String(rows[0].id) : ('rec_' + Date.now()); memUpsert(col, rid, v); await mirrorStatus(col, v); return { id: rid, value: v }; } } catch (e) {} }
    const rid = id ? String(id) : ('rec_' + Date.now() + '_' + Math.random().toString(36).slice(2, 7));
    memUpsert(col, rid, v); await mirrorStatus(col, v);
    return { id: rid, value: v };
  }
  if (action === 'records.replace' || action === 'records.put') {
    const v = args.value;
    let id = args.id ? String(args.id) : (args.idempotency_key ? String(args.idempotency_key) : null);
    if (!id) { if (col === 'foodfitti_settings') id = 'foodfitti-settings-v1'; else if (col === 'foodfitti_admin' && v && v.type === 'passcode') id = 'admin-passcode-v1'; else id = 'rec_' + Date.now(); }
    if (hasSupa) { try { const r = await supa(col, 'PATCH', '?id=eq.' + encodeURIComponent(id), { data: v }); if (r.ok) { memUpsert(col, id, v); await mirrorStatus(col, v); return { id, value: v }; } } catch (e) {} }
    memUpsert(col, id, v); await mirrorStatus(col, v);
    return { id, value: v };
  }
  if (action === 'records.delete') {
    const id = String(args.id);
    if (hasSupa) { try { await supa(col, 'DELETE', '?id=eq.' + encodeURIComponent(id)); } catch (e) {} }
    if (memory[col]) memory[col] = memory[col].filter(x => String(x.id) !== id); saveMem();
    return { deleted: true };
  }
  if (action === 'records.get') {
    const id = String(args.id);
    const f = (memory[col] || []).find(x => String(x.id) === id);
    if (f) return { id: String(f.id), value: f.value };
    throw new Error('Not found');
  }
  if (action === 'records.collections') return { collections: [] };
  throw new Error('Unknown action ' + action);
}
function sendJson(res, s, o) { res.writeHead(s, { 'Content-Type': 'application/json', 'Access-Control-Allow-Origin': '*' }); res.end(JSON.stringify(o)); }

// Serve HTML: strip old Auto-Sync reload script + fix blank Settings crash
function serveHtml(res, file) {
  fs.readFile(path.join(__dirname, file), 'utf8', (e, html) => {
    if (e) { res.writeHead(404); return res.end('Not found'); }
    // 1. Remove ANY Auto-Sync reload script - this stops the refresh loop
    html = html.replace(/<script>[\s\S]*?Auto-Sync[\s\S]*?<\/script>/g, '');
    html = html.replace(/<script>[\s\S]*?location\.reload\(\)[\s\S]*?<\/script>/g, '');
    // 2. Patch: if React crashes on Settings/Deployment, don't go blank - show error instead of white screen
    const guard = "<script>window.addEventListener('error',function(e){try{if(document.body && document.body.innerHTML.trim().length<200){document.body.innerHTML='<div style=\"padding:24px;font-family:sans-serif\"><h2>Settings failed to load</h2><p>'+ (e.message||'Error') +'</p><button onclick=\"location.reload()\" style=\"padding:10px 16px\">Tap to retry</button></div>';}}catch(_){}});</script>";
    if (html.indexOf('</body>') !== -1) html = html.replace('</body>', guard + '</body>');
    else html += guard;
    // 3. Silent sync - NO reload, just update visible status text every 3s
    const silent = "<script>(function(){var last='';function upd(out){try{var orders=out.orders||[];orders.forEach(function(o){var v=o.value||{};var id=v.orderId||v.id;var st=v.status||v.trackingStatus;if(!id||!st)return;var els=document.querySelectorAll('div,span,p,td');for(var i=0;i<els.length;i++){var el=els[i];if(el.children.length>0)continue;var t=el.textContent||'';if(t.indexOf(id)!==-1 && /Preparing|Packed|On its way|Delivered/.test(t) && t.length<80){el.textContent=st;}}});}catch(e){}}async function poll(){try{var r=await fetch('actions',{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify({action:'records.list',args:{collection:'foodfitti_orders'}})});if(!r.ok)return;var j=await r.json();var recs=(j&&j.data&&j.data.records)?j.data.records:[];var h=JSON.stringify(recs);if(last==='')
    {last=h;}else if(last!==h){last=h;upd({orders:recs});}}catch(e){}}setTimeout(function(){poll();setInterval(poll,3000);},2000);})();</script>";
    html = html.replace('</body>', silent + '</body>');
    res.writeHead(200, { 'Content-Type': 'text/html', 'Cache-Control': 'no-cache' });
    res.end(html);
  });
}
const server = http.createServer(async (req, res) => {
  if (req.method === 'OPTIONS') { res.writeHead(204, { 'Access-Control-Allow-Origin': '*', 'Access-Control-Allow-Methods': 'GET,POST,OPTIONS', 'Access-Control-Allow-Headers': 'Content-Type,Authorization' }); return res.end(); }
  const p = (req.url || '/').split('?')[0];
  if (p === '/api/health' || p === '/health') return sendJson(res, 200, { ok: true, configured: hasSupa, time: new Date().toISOString() });
  if (p === '/actions' && req.method === 'POST') {
    let raw = ''; req.on('data', c => raw += c); req.on('end', async () => {
      try { const j = JSON.parse(raw || '{}'); const d = await handle(j.action, j.args || {}); return sendJson(res, 200, { data: d }); }
      catch (e) { return sendJson(res, 500, { error: e.message || 'Backend error' }); }
    }); return;
  }
  if (p === '/' || p === '/index.html') return serveHtml(res, 'index.html');
  if (p === '/admin.html' || p === '/admin') return serveHtml(res, 'admin.html');
  res.writeHead(404, { 'Content-Type': 'text/plain' }); res.end('Not found');
});
server.listen(PORT, '0.0.0.0', () => console.log('Foodfitti on ' + PORT + ' supabase:' + hasSupa));
