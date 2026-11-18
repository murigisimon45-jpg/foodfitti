// Foodfitti Backend - Simple + Deploy Safe
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
async function supa(t, m, q, b) {
  const url = SUPABASE_URL + '/rest/v1/' + t + (q || '');
  return await fetch(url, { method: m, headers: { apikey: SUPABASE_KEY, Authorization: 'Bearer ' + SUPABASE_KEY, 'Content-Type': 'application/json', Prefer: 'return=representation' }, body: b ? JSON.stringify(b) : undefined });
}
const hasSupa = Boolean(SUPABASE_URL && SUPABASE_KEY);
async function handle(action, args) {
  const col = args.collection;
  if (action === 'records.list') {
    if (hasSupa) {
      try {
        const r = await supa(col, 'GET', '?select=id,data&order=created_at.asc&limit=1000');
        if (r.ok) { const rows = await r.json(); const recs = rows.map(x => ({ id: String(x.id), value: x.data })); memory[col] = recs; saveMem(); return { records: recs }; }
      } catch (e) {}
    }
    return { records: memList(col) };
  }
  if (action === 'records.create') {
    const v = args.value;
    let id = args.id || args.idempotency_key || null;
    if (col === 'foodfitti_admin' && v && v.type === 'passcode' && !id) id = 'admin-passcode-v1';
    if (col === 'foodfitti_settings' && !id) id = 'foodfitti-settings-v1';
    if (hasSupa && id) {
      try {
        const r = await supa(col, 'POST', '?on_conflict=id', { id: id, data: v });
        if (r.ok) { const rows = await r.json().catch(() => []); const rid = rows && rows[0] ? String(rows[0].id) : String(id); if (!memory[col]) memory[col] = []; const ex = memory[col].find(x => String(x.id) === rid); if (ex) ex.value = v; else memory[col].push({ id: rid, value: v }); saveMem(); return { id: rid, value: v }; }
      } catch (e) {}
    }
    if (hasSupa && !id) {
      try { const r = await supa(col, 'POST', '', { data: v }); if (r.ok) { const rows = await r.json().catch(() => []); const rid = rows && rows[0] ? String(rows[0].id) : ('rec_' + Date.now()); if (!memory[col]) memory[col] = []; memory[col].push({ id: rid, value: v }); saveMem(); return { id: rid, value: v }; } } catch (e) {}
    }
    if (!memory[col]) memory[col] = [];
    const rid = id ? String(id) : ('rec_' + Date.now() + '_' + Math.random().toString(36).slice(2, 7));
    const ex = memory[col].find(x => String(x.id) === rid); if (ex) ex.value = v; else memory[col].push({ id: rid, value: v }); saveMem();
    return { id: rid, value: v };
  }
  if (action === 'records.replace' || action === 'records.put') {
    const v = args.value;
    let id = args.id ? String(args.id) : (args.idempotency_key ? String(args.idempotency_key) : null);
    if (!id) { if (col === 'foodfitti_settings') id = 'foodfitti-settings-v1'; else if (col === 'foodfitti_admin' && v && v.type === 'passcode') id = 'admin-passcode-v1'; else id = 'rec_' + Date.now(); }
    if (hasSupa) {
      try {
        const r = await supa(col, 'PATCH', '?id=eq.' + encodeURIComponent(id), { data: v });
        if (r.ok) { const rows = await r.json().catch(() => []); if (rows && rows.length) { if (!memory[col]) memory[col] = []; const ex = memory[col].find(x => String(x.id) === id); if (ex) ex.value = v; else memory[col].push({ id, value: v }); saveMem(); return { id, value: v }; } }
      } catch (e) {}
    }
    if (!memory[col]) memory[col] = [];
    const ex = memory[col].find(x => String(x.id) === id); if (ex) ex.value = v; else memory[col].push({ id, value: v }); saveMem();
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
  if (p === '/' || p === '/index.html') { fs.readFile(path.join(__dirname, 'index.html'), (e, d) => { if (e) { res.writeHead(404); return res.end('Not found'); } res.writeHead(200, { 'Content-Type': 'text/html', 'Cache-Control': 'no-cache' }); res.end(d); }); return; }
  if (p === '/admin.html' || p === '/admin') { fs.readFile(path.join(__dirname, 'admin.html'), (e, d) => { if (e) { res.writeHead(404); return res.end('Not found'); } res.writeHead(200, { 'Content-Type': 'text/html', 'Cache-Control': 'no-cache' }); res.end(d); }); return; }
  res.writeHead(404, { 'Content-Type': 'text/plain' }); res.end('Not found');
});
server.listen(PORT, '0.0.0.0', () => console.log('Foodfitti on ' + PORT + ' supabase:' + hasSupa));
