// Foodfitti Backend — Render Web Service
// Keys ONLY in Render env vars. NEVER in HTML.
const http = require('http');
const fs = require('fs');
const path = require('path');
const PORT = process.env.PORT || 10000;
const SUPABASE_URL = (process.env.SUPABASE_URL || '').replace(/\/$/, '').replace(/["']/g,'').trim();
const SUPABASE_KEY = (process.env.SUPABASE_SERVICE_KEY || process.env.SUPABASE_ANON_KEY || process.env.SUPABASE_KEY || '').replace(/["']/g,'').trim();
const DATA_FILE = path.join(__dirname, 'foodfitti-data.json');

let memory = {};
try { if(fs.existsSync(DATA_FILE)){ memory = JSON.parse(fs.readFileSync(DATA_FILE,'utf8')||'{}'); } } catch(e){ memory={}; }
function saveMemory(){ try{ fs.writeFileSync(DATA_FILE, JSON.stringify(memory)); }catch(e){} }
function memList(col){ return (memory[col]||[]).map(r=>({id:String(r.id), value:r.value})); }
function memCreate(col, value, id){
  if(!memory[col]) memory[col]=[];
  const rid = id ? String(id) : ('rec_'+Date.now()+'_'+Math.random().toString(36).slice(2,7));
  const ex = memory[col].find(r=>String(r.id)===rid);
  if(ex){ ex.value=value; } else { memory[col].push({id:rid, value}); }
  saveMemory(); return {id:rid, value};
}
function memReplace(col, id, value){
  if(!memory[col]) memory[col]=[];
  const rid=String(id);
  const ex=memory[col].find(r=>String(r.id)===rid);
  if(ex) ex.value=value; else memory[col].push({id:rid, value});
  saveMemory(); return {id:rid, value};
}
function memDelete(col, id){
  if(!memory[col]) return;
  memory[col]=memory[col].filter(r=>String(r.id)!==String(id));
  saveMemory();
}
async function supa(table, method, query, body){
  const url = SUPABASE_URL + '/rest/v1/' + table + (query||'');
  const headers={'apikey':SUPABASE_KEY,'Authorization':'Bearer '+SUPABASE_KEY,'Content-Type':'application/json','Prefer':'return=representation'};
  return await fetch(url,{method,headers,body: body?JSON.stringify(body):undefined});
}
const hasSupa = Boolean(SUPABASE_URL && SUPABASE_KEY);

async function handleRecords(action, args){
  const col = args.collection; const table = col;
  if(action==='records.list'){
    if(hasSupa){
      try{
        const res = await supa(table,'GET','?select=id,data&order=created_at.asc&limit=1000');
        if(res.ok){
          const rows = await res.json();
          const recs = rows.map(r=>({id:String(r.id), value:r.data}));
          memory[col]=recs.map(r=>({id:r.id, value:r.value})); saveMemory();
          return {records: recs};
        }
      }catch(e){ console.error('list error', e.message); }
    }
    return {records: memList(col)};
  }
  if(action==='records.create'){
    const value = args.value;
    let recordId = args.id || args.idempotency_key || null;
    if(col==='foodfitti_admin' && value && value.type==='passcode' && !recordId) recordId='admin-passcode-v1';
    if(col==='foodfitti_settings' && !recordId) recordId='foodfitti-settings-v1';
    if(hasSupa){
      try{
        if(recordId){
          let res = await supa(table,'POST','?on_conflict=id',{id:recordId, data:value});
          if(res.ok){ const rows=await res.json().catch(()=>[]); const rid=rows&&rows[0]?String(rows[0].id):String(recordId); memReplace(col,rid,value); return {id:rid, value}; }
          const errText = await res.text().catch(()=> '');
          if(/uuid|22P02|invalid input/i.test(errText)){
            let res2 = await supa(table,'POST','',{data:value});
            if(res2.ok){ const rows2=await res2.json().catch(()=>[]); const rid=rows2&&rows2[0]?String(rows2[0].id):String(recordId); memReplace(col,rid,value); return {id:rid, value}; }
          }
        } else {
          let res = await supa(table,'POST','',{data:[STRIPPED]
          if(res.ok){ const rows=await res.json().catch(()=>[]); const rid=rows&&rows[0]?String(rows[0].id):('rec_'+Date.now()); memReplace(col,rid,value); return {id:rid, value}; }
        }
      }catch(e){ console.error('create error', e.message); }
    }
    return memCreate(col, value, recordId);
  }
  if(action==='records.replace' || action==='records.put'){
    const id = args.id ? String(args.id) : (args.idempotency_key ? String(args.idempotency_key) : null);
    const val = args.value;
    let useId = id;
    if(!useId){
      if(col==='foodfitti_settings') useId='foodfitti-settings-v1';
      else if(col==='foodfitti_admin' && val && val.type==='passcode') useId='admin-passcode-v1';
      else useId = 'rec_'+Date.now();
    }
    if(hasSupa){
      try{
        let res = await supa(table,'PATCH','?id=eq.'+encodeURIComponent(useId),{data:val});
        if(res.ok){
          const rows=await res.json().catch(()=>[]);
          if(rows && rows.length){ memReplace(col,useId,val); return {id:useId, value:val}; }
          let res2 = await supa(table,'POST','?on_conflict=id',{id:useId, data:val});
          if(res2.ok){ memReplace(col,useId,val); return {id:useId, value:val}; }
          const t2 = await res2.text().catch(()=> '');
          if(/uuid|22P02/i.test(t2)){
            let res3 = await supa(table,'POST','',{data:val});
            if(res3.ok){ const r3=await res3.json().catch(()=>[]); const rid=r3&&r3[0]?String(r3[0].id):useId; memReplace(col,rid,val); return {id:rid, value:val}; }
          }
        }
      }catch(e){ console.error('replace error', e.message); }
    }
    return memReplace(col, useId, val);
  }
  if(action==='records.delete'){
    const id=String(args.id);
    if(hasSupa){ try{ await supa(table,'DELETE','?id=eq.'+encodeURIComponent(id)); }catch(e){} }
    memDelete(col, id);
    return {deleted:true};
  }
  if(action==='records.get'){
    const id=String(args.id);
    if(hasSupa){
      try{
        const res=await supa(table,'GET','?select=id,data&id=eq.'+encodeURIComponent(id));
        if(res.ok){ const rows=await res.json(); if(rows.length) return {id:String(rows[0].id), value:rows[0].data}; }
      }catch(e){}
    }
    const found=(memory[col]||[]).find(r=>String(r.id)===id);
    if(found) return {id:String(found.id), value:found.value};
    throw new Error('Not found');
  }
  if(action==='records.collections'){ return {collections:[]}; }
  throw new Error('Unknown action '+action);
}

function sendJson(res,status,obj){
  res.writeHead(status,{'Content-Type':'application/json','Access-Control-Allow-Origin':'*','Access-Control-Allow-Methods':'GET,POST,PATCH,DELETE,OPTIONS','Access-Control-Allow-Headers':'Content-Type,Authorization'});
  res.end(JSON.stringify(obj));
}

// --- Serve HTML WITHOUT the old reload script, WITH silent sync (no reload) ---
const SILENT_SYNC = `
<script>
/* Foodfitti Silent Sync — polls every 2s, NEVER reloads. Updates visible status text in place. */
(function(){
  var lastHash='';
  var busy=false;
  function isTyping(){
    try{
      var a=document.activeElement;
      if(a && (a.tagName==='INPUT'||a.tagName==='TEXTAREA'||a.tagName==='SELECT'||a.isContentEditable)) return true;
    }catch(e){}
    return false;
  }
  function updateVisibleStatus(latest){
    try{
      // Customer Track Order + Admin Orders list: update any visible status text without reload
      var orders = latest.orders || [];
      var tracking = latest.tracking || [];
      orders.forEach(function(o){
        var v=o.value||{};
        var id=v.orderId||v.id||o.id;
        var status=v.status||v.trackingStatus;
        // Tracking records may hold status
        tracking.forEach(function(t){
          var tv=t.value||{};
          if(tv.orderId===id && tv.status) status=tv.status;
        });
        if(!id || !status) return;
        // Find elements that mention this order id and update nearby status text
        var all=document.querySelectorAll('div,span,p,td,li');
        for(var i=0;i<all.length;i++){
          var el=all[i];
          if(el.children.length>0) continue;
          var txt=el.textContent||'';
          if(txt.indexOf(id)===-1) continue;
          // If this element itself is a status, replace it
          if(/Preparing|Packed|On its way|Delivered|Awaiting/i.test(txt) && txt.length<60){
            el.textContent=status;
          }
        }
      });
      // Also update any big status heading on Track Order page
      if(tracking.length){
        var last=tracking[tracking.length-1];
        var st=(last.value||{}).status;
        if(st){
          var heads=document.querySelectorAll('h1,h2,h3');
          for(var j=0;j<heads.length;j++){
            if(/Preparing|Packed|On its way|Delivered/.test(heads[j].textContent||'')){
              heads[j].textContent=st;
            }
          }
        }
      }
      // Let the React app know data changed (if it listens)
      window.dispatchEvent(new CustomEvent('foodfitti-sync',{detail:latest}));
    }catch(e){}
  }
  async function poll(){
    if(busy || document.hidden) return;
    busy=true;
    try{
      var out={orders:[],settings:[],tracking:[]};
      var cols=[['foodfitti_orders','orders'],['foodfitti_settings','settings'],['foodfitti_tracking','tracking']];
      for(var i=0;i<cols.length;i++){
        try{
          var r=await fetch('actions',{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify({action:'records.list',args:{collection:cols[i][0]}})});
          if(!r.ok) continue;
          var j=await r.json();
          out[cols[i][1]]=(j&&j.data&&j.data.records)?j.data.records:[];
        }catch(e){}
      }
      var h=JSON.stringify(out);
      var hash=0; for(var k=0;k<h.length;k++){hash=((hash<<5)-hash)+h.charCodeAt(k);hash|=0;}
      var hs=String(hash);
      if(lastHash===''){ lastHash=hs; }
      else if(lastHash!==hs){
        lastHash=hs;
        // NO reload — just update visible text in place
        updateVisibleStatus(out);
      }
      window.__foodfittiLatest = out;
    }catch(e){}
    busy=false;
  }
  setTimeout(function(){ poll(); setInterval(poll, 2000); }, 2000);
})();
</script>
`;

function sendHtml(res, filePath){
  fs.readFile(filePath,'utf8',(err,data)=>{
    if(err){res.writeHead(404,{'Content-Type':'text/plain'});return res.end('Not found');}
    // 1. Strip ANY old Auto-Sync / reload script
    let html = data.replace(/<script>[\s\S]*?Auto-Sync[\s\S]*?<\/script>/g, '');
    html = html.replace(/<script>[\s\S]*?location\.reload\(\)[\s\S]*?<\/script>/g, '');
    // 2. Inject silent sync (no reload) before </body>
    if(html.indexOf('Foodfitti Silent Sync')===-1){
      if(html.indexOf('</body>')!==-1) html = html.replace('</body>', SILENT_SYNC + '\n</body>');
      else html += SILENT_SYNC;
    }
    res.writeHead(200,{'Content-Type':'text/html','Cache-Control':'no-cache'});
    res.end(html);
  });
}
const server=http.createServer(async (req,res)=>{
  if(req.method==='OPTIONS'){ res.writeHead(204,{'Access-Control-Allow-Origin':'*','Access-Control-Allow-Methods':'GET,POST,PATCH,DELETE,OPTIONS','Access-Control-Allow-Headers':'Content-Type,Authorization'}); return res.end(); }
  const urlPath=(req.url||'/').split('?')[0];
  if(urlPath==='/api/health' || urlPath==='/health'){
    let supaTest='not-configured';
    if(hasSupa){
      try{
        const r = await supa('foodfitti_admin','GET','?select=id&limit=1');
        supaTest = r.ok ? 'ok' : ('failed '+r.status);
      }catch(e){ supaTest='error '+e.message; }
    }
    return sendJson(res,200,{ok:true,configured:hasSupa,supabase:supaTest,mode:hasSupa&&supaTest==='ok'?'supabase':'fallback-file-memory',time:new Date().toISOString()});
  }
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
  if(urlPath==='/' || urlPath==='/index.html') return sendHtml(res, path.join(__dirname,'index.html'));
  if(urlPath==='/admin.html' || urlPath==='/admin') return sendHtml(res, path.join(__dirname,'admin.html'));
  if(urlPath==='/favicon.ico'){ res.writeHead(204); return res.end(); }
  const safe=path.normalize(path.join(__dirname,'.'+urlPath));
  if(safe.startsWith(__dirname) && fs.existsSync(safe) && fs.statSync(safe).isFile()){
    const ext=path.extname(safe).toLowerCase();
    const types={'.html':'text/html','.css':'text/css','.js':'text/javascript','.json':'application/json','.png':'image/png','.jpg':'image/jpeg','.svg':'image/svg+xml'};
    // For any other .html file, also strip reload
    if(ext==='.html') return sendHtml(res, safe);
    fs.readFile(safe,(err,data)=>{ if(err){res.writeHead(404);return res.end('Not found');} res.writeHead(200,{'Content-Type':types[ext]||'application/octet-stream'}); res.end(data); });
    return;
  }
  res.writeHead(404,{'Content-Type':'text/plain'}); res.end('Not found');
});
server.listen(PORT,'0.0.0.0',()=>console.log('Foodfitti backend on '+PORT+' | Supabase configured: '+hasSupa));
