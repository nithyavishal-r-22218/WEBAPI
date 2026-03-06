
// ═══════════════════════════════════════════════════
//  STATE
// ═══════════════════════════════════════════════════
const G = {
  recordings:[], cases:[], results:[],
  settings:{ url:'http://localhost:4000', key:'godmode-dev-key', fw:'playwright', lang:'javascript', theme:'light' },
  live:{ steps:[], network:[], recording:false, name:'', startUrl:'', t0:null, id:null },
  genFW:'playwright', genLang:'javascript', genCode:'', genRecId:'',
  editCaseId:null
};

const $   = id => document.getElementById(id);
const gv  = id => { const e=$(id); return e ? e.value.trim() : ''; };
const sv  = (id,v) => { const e=$(id); if(e) e.value = v; };
const uid = () => 'x' + Date.now().toString(36) + Math.random().toString(36).slice(2,5);
const dur = ms => ms < 1000 ? ms + 'ms' : (ms/1000).toFixed(2) + 's';

// ── WEBAPI API sync ─────────────────────────────────────────────────────────
async function gmPost(path, body) {
  try {
    const cfg = G.settings;
    const r = await fetch((cfg.url || 'http://localhost:4000') + path, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'x-api-key': cfg.key || 'godmode-dev-key' },
      body: JSON.stringify(body),
      signal: AbortSignal.timeout(6000)
    });
    return { ok: r.ok, status: r.status, data: await r.json().catch(() => ({})) };
  } catch(e) {
    return { ok: false, error: e.message };
  }
}

async function gmPut(path, body) {
  try {
    const cfg = G.settings;
    const r = await fetch((cfg.url || 'http://localhost:4000') + path, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json', 'x-api-key': cfg.key || 'godmode-dev-key' },
      body: JSON.stringify(body),
      signal: AbortSignal.timeout(6000)
    });
    return { ok: r.ok, data: await r.json().catch(() => ({})) };
  } catch(e) {
    return { ok: false, error: e.message };
  }
}

async function gmGet(path) {
  try {
    const cfg = G.settings;
    const r = await fetch((cfg.url || 'http://localhost:4000') + path, {
      headers: { 'x-api-key': cfg.key || 'godmode-dev-key' },
      signal: AbortSignal.timeout(6000)
    });
    return await r.json();
  } catch { return null; }
}

// Sync a recording to WEBAPI (upsert via POST /recordings)
async function syncRecToGodMode(rec) {
  const r = await gmPost('/recordings', rec);
  if (r.ok) {
    console.log('[WebAPI] Recording synced to GodMode:', rec.id);
  } else {
    console.warn('[WebAPI] GodMode sync failed:', r.error || r.status);
  }
  return r;
}

// Sync a test case to WEBAPI
async function syncCaseToGodMode(c) {
  const r = await gmPost('/test-cases', c);
  return r;
}

// Sync a run result to WEBAPI
async function syncResultToGodMode(result) {
  const r = await gmPost('/results', result);
  return r;
}

const ACT_ICO = { navigate:'🔗', click:'👆', type:'✏', select:'📋', assert_text:'✅', key:'⌨', default:'⚡' };
const ACT_CLS = { navigate:'nav', click:'clk', type:'typ', select:'sel2', assert_text:'ast' };

// ── Background messenger with retry ─────────────────────────────────────────
function bg(type, data={}) {
  return new Promise(resolve => {
    let tries = 0;
    function attempt() {
      tries++;
      try {
        chrome.runtime.sendMessage({type, ...data}, resp => {
          if (chrome.runtime.lastError) {
            if (tries < 4) setTimeout(attempt, 250);
            else resolve(null);
          } else {
            resolve(resp ?? null);
          }
        });
      } catch(e) {
        if (tries < 4) setTimeout(attempt, 250);
        else resolve(null);
      }
    }
    attempt();
  });
}

// ═══════════════════════════════════════════════════
//  BOOT
// ═══════════════════════════════════════════════════
// Pull recordings/cases/results from WEBAPI and merge into local state
async function pullFromGodMode() {
  try {
    const [recsData, casesData, resultsData] = await Promise.all([
      gmGet('/recordings'),
      gmGet('/test-cases'),
      gmGet('/results')
    ]);

    let merged = false;

    if (recsData?.recordings?.length) {
      recsData.recordings.forEach(serverRec => {
        if (!G.recordings.find(r => r.id === serverRec.id)) {
          G.recordings.push(serverRec);
          // Also persist to local extension storage
          bg('SAVE_REC', { rec: serverRec });
          merged = true;
        }
      });
    }

    if (casesData?.testCases?.length) {
      casesData.testCases.forEach(serverCase => {
        if (!G.cases.find(c => c.id === serverCase.id)) {
          G.cases.push(serverCase);
          bg('SAVE_CASE', { c: serverCase });
          merged = true;
        }
      });
    }

    if (resultsData?.results?.length) {
      resultsData.results.forEach(serverResult => {
        if (!G.results.find(r => r.id === serverResult.id)) {
          G.results.push(serverResult);
          merged = true;
        }
      });
    }

    if (merged) {
      renderAll();
      toast('↓ Synced from WEBAPI', 'info');
    }
  } catch(e) {
    console.log('[WebAPI] GodMode pull failed (offline?):', e.message);
  }
}

async function boot() {
  bindAll();
  applySettings();
  renderAll();

  try {
    const [recs, cases, results, settings, recState] = await Promise.all([
      bg('GET_RECS'), bg('GET_CASES'), bg('GET_RESULTS'), bg('GET_SETTINGS'), bg('REC_STATE')
    ]);
    G.recordings = Array.isArray(recs)    ? recs    : [];
    G.cases      = Array.isArray(cases)   ? cases   : [];
    G.results    = Array.isArray(results) ? results : [];
    if (settings) G.settings = { ...G.settings, ...settings };
    if (recState?.active) {
      G.live.recording = true;
      G.live.steps     = recState.steps   || [];
      G.live.network   = recState.network || [];
      setRecUI(true);
    }
    applySettings();
    renderAll();
    checkApi(false);
    chrome.runtime.onMessage.addListener(onBgMsg);
    // Pull data from WEBAPI in background
    pullFromGodMode();
  } catch(err) {
    console.error('WebAPI boot error:', err);
    toast('Could not connect — try reloading the extension', 'fail');
  }
}

// ═══════════════════════════════════════════════════
//  EVENT BINDING  (all addEventListener — CSP safe)
// ═══════════════════════════════════════════════════
function bindAll() {
  $('apiPill').addEventListener('click', () => checkApi(true));
  $('recPill').addEventListener('click', handleRecClick);

  [['t-record','record'],['t-library','library'],['t-generate','generate'],
   ['t-tests','tests'],['t-results','results'],['t-settings','settings']]
  .forEach(([id,pg]) => $(id).addEventListener('click', () => showPg(pg)));

  $('heroDiv').addEventListener('click', handleRecClick);
  $('clearBtn').addEventListener('click', clearSteps);
  $('nameBtn').addEventListener('click', openNameModal);
  $('saveRecBtn').addEventListener('click', saveRecManual);
  $('newRecBtn').addEventListener('click', () => showPg('record'));

  document.querySelectorAll('.fwc').forEach(el => el.addEventListener('click', () => pickFW(el)));
  document.querySelectorAll('.lbtn').forEach(el => el.addEventListener('click', () => pickLang(el)));
  $('genRecSel').addEventListener('change', onGenRecChange);
  $('genBtn').addEventListener('click', doGenerate);
  $('cPlatBtn').addEventListener('click', sendToPlat);
  $('cCopyBtn').addEventListener('click', copyCode);
  $('cDlBtn').addEventListener('click', dlCode);
  $('saveAsCaseBtn').addEventListener('click', saveAsCase);
  $('addCaseBtn').addEventListener('click', () => openAddCase());
  $('clearResultsBtn').addEventListener('click', clearResults);
  $('saveSettingsBtn').addEventListener('click', saveSettings);
  $('testConnBtn').addEventListener('click', () => checkApi(true));
  $('saveSettings2Btn').addEventListener('click', saveSettings);
  $('lightBtn').addEventListener('click', () => setTheme('light'));
  $('darkBtn').addEventListener('click', () => setTheme('dark'));
  $('clearAllBtn').addEventListener('click', clearAll);

  $('closeCaseModal').addEventListener('click', () => closeModal('caseModal'));
  $('cancelCaseBtn').addEventListener('click',  () => closeModal('caseModal'));
  $('submitCaseBtn').addEventListener('click', submitCase);
  $('closeRunModal').addEventListener('click',  () => closeModal('runModal'));
  $('closeRunModal2').addEventListener('click', () => closeModal('runModal'));
  $('closeNameModal').addEventListener('click', () => closeModal('nameModal'));
  $('cancelNameBtn').addEventListener('click',  () => closeModal('nameModal'));
  $('applyNameBtn').addEventListener('click', applyNameOrRec);
  $('cType').addEventListener('change', updCaseForm);
  $('closeStepEditModal').addEventListener('click', () => closeModal('stepEditModal'));
  $('cancelStepEditBtn').addEventListener('click',  () => closeModal('stepEditModal'));
  $('applyStepEditBtn').addEventListener('click', applyStepEdit);

  document.querySelectorAll('.ov').forEach(m =>
    m.addEventListener('click', e => { if (e.target === m) m.classList.remove('on'); })
  );
  document.addEventListener('keydown', e => {
    if (e.key === 'Escape') document.querySelectorAll('.ov.on').forEach(m => m.classList.remove('on'));
  });

  // Delegate clicks for dynamically rendered buttons
  document.addEventListener('click', e => {
    const btn = e.target.closest('[data-action]');
    if (!btn) return;
    e.stopPropagation();
    const { action, id } = btn.dataset;
    switch (action) {
      case 'delStep':       delStep(parseInt(id));  break;
      case 'editStep':      editStep(parseInt(id)); break;
      case 'runCase':       runCase(id);            break;
      case 'editCase':      editCase(id);           break;
      case 'pushCase':      pushCase(id);           break;
      case 'deleteCase':    deleteCase(id);         break;
      case 'runRec':        runRecording(id);       break;
      case 'jumpGenerate':  jumpGenerate(id);       break;
      case 'recToPlatform': recToPlatform(id);      break;
      case 'deleteRec':     deleteRec(id);          break;
      case 'renameRec':    renameRec(id);          break;
    }
  });
}

// ═══════════════════════════════════════════════════
//  BACKGROUND MESSAGE HANDLER
// ═══════════════════════════════════════════════════
function onBgMsg(msg) {
  if (msg.type === 'STEP') {
    G.live.steps.push(msg.step);
    $('hSteps').textContent = msg.total;
    renderSteps();
  }
  if (msg.type === 'NET') {
    G.live.network.push(msg.net);
    renderNetCalls();
  }
  // WEBAPI sync status feedback
  if (msg.type === 'SYNC_STATUS') {
    const pill = $('syncPill');
    const txt  = $('syncTxt');
    if (!pill) return;
    if (msg.ok) {
      pill.className = 'sync-pill live';
      txt.textContent = '✓ synced';
      clearTimeout(G._syncTimer);
      G._syncTimer = setTimeout(() => {
        pill.className = 'sync-pill';
        txt.textContent = 'WEBAPI';
      }, 3000);
    } else {
      pill.className = 'sync-pill fail';
      txt.textContent = '✗ offline';
    }
  }

  // Fired when user clicks STOP on the in-page recording banner
  if (msg.type === 'REC_STOPPED' && msg.rec) {
    G.live.recording = false;
    G.live.steps     = msg.rec.steps   || [];
    G.live.network   = msg.rec.network || [];
    G.live.name      = msg.rec.name    || '';
    G.live.id        = msg.rec.id;
    setRecUI(false);
    renderSteps();
    renderNetCalls();
    persistRec(msg.rec);  // auto-save from banner stop
  }
}

// ═══════════════════════════════════════════════════
//  RECORDING
// ═══════════════════════════════════════════════════
async function handleRecClick() {
  try {
    if (G.live.recording) {
      // ── STOP ───────────────────────────────────────
      const r = await bg('REC_STOP');
      if (r?.ok && r.rec) {
        G.live.recording = false;
        G.live.steps     = r.rec.steps   || [];
        G.live.network   = r.rec.network || [];
        G.live.name      = r.rec.name    || '';
        G.live.id        = r.rec.id;
        setRecUI(false);
        renderSteps();
        renderNetCalls();
        await persistRec(r.rec);  // ← always auto-save on stop
      } else {
        toast('Stop failed — try again', 'fail');
      }
    } else {
      // ── START ──────────────────────────────────────
      const tabs = await chrome.tabs.query({ active:true, currentWindow:true });
      const tab  = tabs[0];
      if (!tab) { toast('No active tab found', 'fail'); return; }

      G.live = { steps:[], network:[], recording:true, name:'', startUrl:tab.url||'', t0:Date.now(), id:null };
      renderSteps();
      renderNetCalls();

      const r = await bg('REC_START', { tabId: tab.id });
      if (r?.ok) {
        setRecUI(true);
        toast('Recording on ' + new URL(tab.url || 'http://x').hostname, 'pass');
      } else {
        G.live.recording = false;
        toast('Could not start — refresh the tab and try again', 'fail');
      }
    }
  } catch(err) {
    console.error('handleRecClick:', err);
    toast('Extension error — reload from chrome://extensions', 'fail');
  }
}

// Persist rec to storage AND update in-memory G.recordings
async function persistRec(rec) {
  await bg('SAVE_REC', { rec });
  const idx = G.recordings.findIndex(r => r.id === rec.id);
  if (idx >= 0) G.recordings[idx] = rec;
  else          G.recordings.unshift(rec);
  G.live.id = rec.id;
  $('saveRecBtn').disabled = false;
  updateCounts();
  renderLibrary();
  toast('✓ ' + rec.steps.length + ' steps saved — syncing to WEBAPI…', 'pass');
}

// Manual re-save button (after renaming etc.)
async function saveRecManual() {
  if (!G.live.steps.length) { toast('No steps to save', 'fail'); return; }
  const name = G.live.name || ('Flow ' + new Date().toLocaleTimeString('en',{hour:'2-digit',minute:'2-digit'}));
  const rec  = {
    id:       G.live.id || uid(),
    name,
    steps:    [...G.live.steps],
    network:  [...G.live.network],
    startUrl: G.live.startUrl || G.live.steps[0]?.url || '',
    ms:       G.live.t0 ? Date.now() - G.live.t0 : 0,
    at:       new Date().toISOString()
  };
  G.live.id   = rec.id;
  G.live.name = name;
  await persistRec(rec);
}

function setRecUI(isRec) {
  const ring=$('heroRing'), ico=$('heroIco'), pill=$('recPill');
  const title=$('heroTitle'), sub=$('heroSub'), txt=$('recTxt');
  if (isRec) {
    ring.classList.add('on'); pill.classList.add('on');
    ico.textContent = '⏹'; txt.textContent = '■ Stop';
    title.textContent = 'Recording in progress…';
    sub.textContent   = 'Click ■ Stop when done · Double-click to assert';
  } else {
    ring.classList.remove('on'); pill.classList.remove('on');
    ico.textContent = '⏺'; txt.textContent = '● Rec';
    const n = G.live.steps.length;
    title.textContent = n > 0 ? '✓ Done — ' + n + ' steps saved to Library' : 'Click to Start Recording';
    sub.textContent   = n > 0 ? 'View in Library · Generate code · Run test' : 'Captures clicks · inputs · navigation · API calls';
  }
}

function renderSteps() {
  const steps = G.live.steps;
  $('stepCnt').textContent = steps.length;
  const wrap = $('stepsWrap');
  if (!steps.length) {
    wrap.innerHTML = '<div class="empty"><div class="ei">⏺</div><div class="et">Start recording to see steps here</div></div>';
    return;
  }
  wrap.innerHTML = '<div class="steps-list">' + steps.map((s,i) => {
    const cls = ACT_CLS[s.action] || '';
    const ico = ACT_ICO[s.action] || ACT_ICO.default;
    const tgt = (s.target || s.url || '').slice(0,54);
    const val = s.value ? '<div class="sv">"' + s.value.slice(0,40) + '"</div>' : '';
    return '<div class="step ' + cls + '" data-idx="' + i + '">'
      + '<div class="sn">' + (i+1) + '</div>'
      + '<span class="si">' + ico + '</span>'
      + '<div class="sb" style="cursor:pointer" data-action="editStep" data-id="' + i + '">'
        + '<div class="sa">' + s.action + '</div>'
        + '<div class="st" title="Click to edit">' + tgt + '</div>' + val
      + '</div>'
      + '<button class="sdel" data-action="delStep" data-id="' + i + '">✕</button>'
      + '</div>';
  }).join('') + '</div>';
}

function editStep(i) {
  const s = G.live.steps[i];
  if (!s) return;
  // Build inline edit modal content
  $('stepEditTitle').textContent = 'Edit Step ' + (i+1);
  $('seAction').value  = s.action;
  $('seTarget').value  = s.target || s.url || '';
  $('seValue').value   = s.value  || '';
  G._editStepIdx = i;
  openModal('stepEditModal');
}

function applyStepEdit() {
  const i = G._editStepIdx;
  if (i === undefined || i < 0) return;
  const s = G.live.steps[i];
  s.action = $('seAction').value || s.action;
  s.target = $('seTarget').value || s.target;
  s.url    = s.action === 'navigate' ? $('seTarget').value : s.url;
  s.value  = $('seValue').value;
  closeModal('stepEditModal');
  renderSteps();
  toast('Step updated', 'info');
}

function renderNetCalls() {
  const nets = G.live.network;
  $('netSection').style.display = nets.length ? 'block' : 'none';
  $('netCnt').textContent = nets.length;
  $('netWrap').innerHTML = nets.slice(-6).map(n => {
    const sc = n.status < 300 ? 'ok' : n.status < 400 ? 'warn' : 'err';
    return '<div class="net">'
      + '<span class="mth m' + (n.method||'GET') + '">' + (n.method||'GET') + '</span>'
      + '<span class="nurl">' + n.url + '</span>'
      + '<span class="nst ' + sc + '">' + n.status + '</span>'
      + '</div>';
  }).join('');
}

function delStep(i) {
  G.live.steps.splice(i,1);
  renderSteps();
  if (!G.live.recording) $('saveRecBtn').disabled = G.live.steps.length === 0;
}

function clearSteps() {
  G.live.steps=[]; G.live.network=[];
  renderSteps(); renderNetCalls();
  $('saveRecBtn').disabled = true;
  $('hSteps').textContent = '0';
  setRecUI(false);
}

function openNameModal() { sv('nameInput', G.live.name || ''); openModal('nameModal'); }
function applyName()     { G.live.name = gv('nameInput') || G.live.name; closeModal('nameModal'); toast('Name updated', 'info'); } // kept for compat

// ═══════════════════════════════════════════════════
//  LIBRARY
// ═══════════════════════════════════════════════════
function renderLibrary() {
  $('tb-lib').textContent = G.recordings.length;
  const wrap = $('libWrap');
  if (!G.recordings.length) {
    wrap.innerHTML = '<div class="empty"><div class="ei">📂</div><div class="et">No recordings yet</div></div>';
    return;
  }
  wrap.innerHTML = G.recordings.map(r => {
    const steps = r.steps  || [];
    const nets  = r.network|| [];
    let preview = steps.slice(0,4).map((s,i) =>
      '<div class="rprow"><div class="rpn">'+(i+1)+'</div>'
      + '<span style="font-size:12px">'+(ACT_ICO[s.action]||'⚡')+'</span>'
      + '<span style="font-weight:600;font-size:11.5px">'+s.action+'</span>'
      + '<span style="color:var(--t3);overflow:hidden;text-overflow:ellipsis;white-space:nowrap;font-size:10px;font-family:DM Mono,monospace">'+(s.target||s.url||'').slice(0,46)+'</span>'
      + '</div>'
    ).join('');
    if (steps.length > 4) preview += '<div style="font-size:10.5px;color:var(--t3);padding-left:22px">+' + (steps.length-4) + ' more</div>';
    return '<div class="rcard">'
      + '<div class="rcard-hd">'
        + '<div class="rthumb">🎬</div>'
        + '<div class="ri"><div class="rname">'+r.name+'</div>'
          + '<div class="rmeta">'+steps.length+' steps · '+nets.length+' API calls · '+new Date(r.at).toLocaleTimeString()+'</div></div>'
        + '<div class="racts">'
          + '<button class="ia add"  data-action="runRec"         data-id="'+r.id+'" title="Run test">▶</button>'
          + '<button class="ia gen"  data-action="jumpGenerate"   data-id="'+r.id+'" title="Generate code">⚡</button>'
          + '<button class="ia"      data-action="renameRec"      data-id="'+r.id+'" title="Rename" style="font-size:11px">✏</button>'
          + '<button class="ia push" data-action="recToPlatform"  data-id="'+r.id+'" title="Push to platform">↑</button>'
          + '<button class="ia del"  data-action="deleteRec"      data-id="'+r.id+'" title="Delete">✕</button>'
        + '</div>'
      + '</div>'
      + '<div class="rpreview">'+preview+'</div>'
      + '</div>';
  }).join('');
}

async function deleteRec(id) {
  await bg('DEL_REC', {id});  // deletes locally + syncs DELETE to WEBAPI
  G.recordings = G.recordings.filter(r => r.id !== id);
  renderLibrary(); updateCounts();
  toast('Deleted', 'info');
}

function jumpGenerate(id) {
  G.genRecId = id;
  showPg('generate');
  populateGenSel();
  $('genRecSel').value = id;
  onGenRecChange();
}

async function recToPlatform(id) {
  const rec = G.recordings.find(r => r.id === id);
  if (!rec) return;
  const r = await bg('PUSH_PLATFORM', { data:{ type:'RECORDING', name:rec.name, steps:rec.steps, network:rec.network }});
  toast(r?.ok ? '↑ Sent!' : '✗ ' + r?.error, r?.ok ? 'pass' : 'fail');
}

// Rename a recording from the Library
function renameRec(id) {
  const rec = G.recordings.find(r => r.id === id);
  if (!rec) return;
  G._renameRecId = id;
  sv('nameInput', rec.name);
  openModal('nameModal');
}

// applyName handles both live recording rename and library recording rename
async function applyNameOrRec() {
  if (G._renameRecId) {
    const id  = G._renameRecId;
    G._renameRecId = null;
    const rec = G.recordings.find(r => r.id === id);
    if (rec) {
      rec.name = gv('nameInput') || rec.name;
      await bg('SAVE_REC', { rec });
      renderLibrary();
      toast('Renamed: ' + rec.name, 'info');
    }
  } else {
    G.live.name = gv('nameInput') || G.live.name;
    toast('Name updated', 'info');
  }
  closeModal('nameModal');
}

// Run a recording directly as a replay (no test case needed)
async function runRecording(id) {
  const rec = G.recordings.find(r => r.id === id);
  if (!rec) return;
  toast('Running: ' + rec.name, 'info');
  const fakeCase = {
    id:              'run_' + rec.id,
    name:            rec.name,
    type:            'WEB',
    framework:       'playwright',
    browser:         'chromium',
    webUrl:          rec.startUrl || rec.steps[0]?.url || '',
    steps:           rec.steps.map(s => s.action + ' ' + (s.target||s.url||'')).join('\n'),
    _recordingSteps: rec.steps,
    method:          'GET',
    expectedStatus:  200
  };
  const r = await bg('RUN_CASE', { c: fakeCase });
  showRunResult({ name: rec.name }, r);
  toast((r.pass ? '✓ Pass' : '✗ Fail') + ' — ' + rec.name, r.pass ? 'pass' : 'fail');
}

// ═══════════════════════════════════════════════════
//  GENERATE
// ═══════════════════════════════════════════════════
function populateGenSel() {
  const sel = $('genRecSel'), cur = sel.value;
  sel.innerHTML = '<option value="">— Select a recording —</option>'
    + G.recordings.map(r => '<option value="'+r.id+'">'+r.name+' ('+( r.steps?.length||0)+' steps)</option>').join('');
  if (cur && G.recordings.find(r => r.id === cur)) sel.value = cur;
  if (G.genRecId) sel.value = G.genRecId;
}

function onGenRecChange() {
  const id = gv('genRecSel');
  G.genRecId = id;
  const info = $('genRecMeta');
  if (!id) { info.style.display = 'none'; return; }
  const rec = G.recordings.find(r => r.id === id);
  if (!rec) return;
  info.style.display = 'block';
  info.textContent   = (rec.steps?.length||0) + ' steps · ' + (rec.network?.length||0) + ' API calls · ' + (rec.startUrl || '—');
}

function pickFW(el) {
  document.querySelectorAll('.fwc').forEach(c => c.classList.remove('on'));
  el.classList.add('on'); G.genFW = el.dataset.fw;
  const compat = {
    playwright:['javascript','typescript','python','java','csharp'],
    cypress:['javascript','typescript'], selenium:['javascript','python','java','csharp'],
    puppeteer:['javascript','typescript'], testcafe:['javascript','typescript'], jest:['javascript','typescript']
  };
  const ok = compat[G.genFW] || ['javascript'];
  document.querySelectorAll('.lbtn').forEach(b => {
    b.style.display = ok.includes(b.dataset.lang) ? '' : 'none';
    if (b.classList.contains('on') && !ok.includes(b.dataset.lang)) b.classList.remove('on');
  });
  if (!document.querySelector('.lbtn.on')) {
    const first = document.querySelector('.lbtn:not([style*="none"])');
    if (first) { first.classList.add('on'); G.genLang = first.dataset.lang; }
  }
}

function pickLang(el) {
  document.querySelectorAll('.lbtn').forEach(b => b.classList.remove('on'));
  el.classList.add('on'); G.genLang = el.dataset.lang;
}

async function doGenerate() {
  const id = G.genRecId || gv('genRecSel');
  if (!id) { toast('Select a recording first', 'fail'); return; }
  const rec = G.recordings.find(r => r.id === id);
  if (!rec?.steps?.length) { toast('Recording has no steps', 'fail'); return; }
  const r = await bg('GEN_CODE', { rec, fw: G.genFW, lang: G.genLang });
  if (r?.code) {
    G.genCode = r.code;
    $('codeLbl').textContent    = G.genFW + ' / ' + G.genLang;
    $('codeOut').textContent    = r.code;
    $('codeWrap').style.display = 'block';
    toast('Code generated!', 'pass');
  }
}

function copyCode() {
  if (!G.genCode) { toast('Generate first', 'fail'); return; }
  navigator.clipboard.writeText(G.genCode).then(() => toast('Copied!', 'pass'));
}

function dlCode() {
  if (!G.genCode) return;
  const ext = { javascript:'.js', typescript:'.ts', python:'.py', java:'.java', csharp:'.cs' }[G.genLang] || '.js';
  const a = document.createElement('a');
  a.href = URL.createObjectURL(new Blob([G.genCode], { type:'text/plain' }));
  a.download = 'webapi_test' + ext;
  a.click();
  toast('Saved!', 'pass');
}

async function sendToPlat() {
  if (!G.genCode) { toast('Generate first', 'fail'); return; }
  const id  = G.genRecId || gv('genRecSel');
  const rec = G.recordings.find(r => r.id === id) || { name:'Test' };
  const r   = await bg('PUSH_PLATFORM', { data:{ type:'CODE', name:rec.name, code:G.genCode, fw:G.genFW, lang:G.genLang }});
  toast(r?.ok ? '↑ Sent!' : '✗ ' + r?.error, r?.ok ? 'pass' : 'fail');
}

async function saveAsCase() {
  if (!G.genCode) return;
  const id  = G.genRecId || gv('genRecSel');
  const rec = G.recordings.find(r => r.id === id) || { name:'Generated Test' };
  const tc  = {
    id: uid(), name: rec.name, type:'WEB', framework:G.genFW, language:G.genLang,
    generatedCode: G.genCode, method:'GET', apiUrl:'', expectedStatus:200,
    body:'', assertions:'', browser:'chromium',
    webUrl: rec.startUrl || '',
    steps:  rec.steps?.map(s => s.action+' '+s.target).join('\n') || '',
    _recordingSteps: rec.steps || [],
    recordingId: id, createdAt: new Date().toISOString(), lastRun:null, lastMs:null
  };
  await bg('SAVE_CASE', { c:tc });
  G.cases.unshift(tc);
  updateCounts(); renderTests();
  toast('"'+rec.name+'" saved as test case!', 'pass');
  showPg('tests');
  syncCaseToGodMode(tc);
}

// ═══════════════════════════════════════════════════
//  TEST CASES
// ═══════════════════════════════════════════════════
function renderTests() {
  $('tb-tests').textContent = G.cases.length;
  const wrap = $('testsWrap');
  if (!G.cases.length) {
    wrap.innerHTML = '<div class="empty"><div class="ei">🧪</div><div class="et">No test cases yet</div></div>';
    return;
  }
  const tb = { API:'bblue', WEB:'blilac', WEB_API:'bmint' };
  const tl = { API:'API',   WEB:'Web',    WEB_API:'E2E' };
  wrap.innerHTML = G.cases.map(c => {
    const lastBadge = c.lastRun==='pass' ? '<span class="badge bsage">Pass</span>'
                    : c.lastRun==='fail' ? '<span class="badge bpink">Fail</span>' : '';
    const durBadge  = c.lastMs ? '<span style="font-size:10.5px;color:var(--t3);font-family:DM Mono,monospace">'+dur(c.lastMs)+'</span>' : '';
    return '<div class="trow">'
      + '<div class="tdot '+(c.lastRun||'')+'"></div>'
      + '<div class="tbody">'
        + '<div class="tname">'+c.name+'</div>'
        + '<div class="tmeta"><span class="badge '+(tb[c.type]||'bblue')+'">'+(tl[c.type]||c.type)+'</span>'
          + '<span class="chip">'+(c.framework||'—')+'</span>'+lastBadge+durBadge
        + '</div>'
      + '</div>'
      + '<div class="tacts">'
        + '<button class="ia add"  data-action="runCase"    data-id="'+c.id+'" title="Run">▶</button>'
        + '<button class="ia gen"  data-action="editCase"   data-id="'+c.id+'" title="Edit">✏</button>'
        + '<button class="ia push" data-action="pushCase"   data-id="'+c.id+'" title="Push">↑</button>'
        + '<button class="ia del"  data-action="deleteCase" data-id="'+c.id+'" title="Delete">✕</button>'
      + '</div>'
      + '</div>';
  }).join('');
}

function updCaseForm() {
  const t = gv('cType');
  $('cApiFields').style.display = (t==='API'||t==='WEB_API') ? '' : 'none';
  $('cWebFields').style.display = (t==='WEB'||t==='WEB_API') ? '' : 'none';
}

function openAddCase(prefill) {
  G.editCaseId = null;
  $('caseMTitle').textContent = 'New Test Case';
  ['cName','cApiUrl','cBody','cAssert','cWebUrl','cSteps'].forEach(id => sv(id,''));
  sv('cExpStatus','200'); sv('cType','API'); sv('cFw','playwright'); sv('cMethod','GET'); sv('cBrowser','chromium');
  if (prefill) {
    if (prefill.name)  sv('cName',  prefill.name);
    if (prefill.type)  sv('cType',  prefill.type);
    if (prefill.url)   sv('cWebUrl',prefill.url);
    if (prefill.steps) sv('cSteps', prefill.steps);
  }
  updCaseForm();
  openModal('caseModal');
}

function editCase(id) {
  const c = G.cases.find(x => x.id === id);
  if (!c) return;
  G.editCaseId = id;
  $('caseMTitle').textContent = 'Edit Test Case';
  sv('cName',      c.name);
  sv('cType',      c.type);
  sv('cFw',        c.framework     || 'playwright');
  sv('cMethod',    c.method        || 'GET');
  sv('cApiUrl',    c.apiUrl        || '');
  sv('cExpStatus', c.expectedStatus|| '200');
  sv('cBody',      c.body          || '');
  sv('cAssert',    c.assertions    || '');
  sv('cBrowser',   c.browser       || 'chromium');
  sv('cWebUrl',    c.webUrl        || '');
  sv('cSteps',     c.steps         || '');
  updCaseForm();
  openModal('caseModal');
}

async function submitCase() {
  const name = gv('cName');
  if (!name) { toast('Name required', 'fail'); return; }
  const existing = G.editCaseId ? G.cases.find(x => x.id === G.editCaseId) : null;
  const tc = {
    id:             G.editCaseId || uid(),
    name,
    type:           gv('cType'),
    framework:      gv('cFw'),
    language:       G.settings.lang,
    method:         gv('cMethod'),
    apiUrl:         gv('cApiUrl'),
    expectedStatus: parseInt(gv('cExpStatus')) || 200,
    body:           gv('cBody'),
    assertions:     gv('cAssert'),
    browser:        gv('cBrowser'),
    webUrl:         gv('cWebUrl'),
    steps:          gv('cSteps'),
    _recordingSteps: existing?._recordingSteps || [],
    createdAt:      existing?.createdAt || new Date().toISOString(),
    lastRun:        existing?.lastRun   || null,
    lastMs:         existing?.lastMs    || null
  };
  await bg('SAVE_CASE', { c:tc });
  const i = G.cases.findIndex(x => x.id === tc.id);
  i >= 0 ? G.cases[i] = tc : G.cases.unshift(tc);
  renderTests(); updateCounts();
  closeModal('caseModal');
  toast('Saved & syncing to WEBAPI…', 'pass');
}

async function runCase(id) {
  const c = G.cases.find(x => x.id === id);
  if (!c) return;

  const btn = document.querySelector('[data-action="runCase"][data-id="'+id+'"]');
  if (btn) { btn.textContent = '…'; btn.disabled = true; }

  toast('Running: ' + c.name, 'info');
  const r = await bg('RUN_CASE', { c });

  if (btn) { btn.textContent = '▶'; btn.disabled = false; }

  const ci = G.cases.findIndex(x => x.id === id);
  if (ci >= 0) { G.cases[ci].lastRun = r.pass ? 'pass' : 'fail'; G.cases[ci].lastMs = r.ms; }

  const fullResult = { ...r, caseName:c.name, caseType:c.type, caseId:c.id };
  G.results.unshift(fullResult);
  renderTests(); renderResults(); updateCounts();
  showRunResult(c, r);
  toast((r.pass ? '✓ Pass' : '✗ Fail') + ' — ' + c.name, r.pass ? 'pass' : 'fail');
  // Sync result + updated case to WEBAPI
  syncResultToGodMode(fullResult);
  syncCaseToGodMode({ ...c, lastRun: r.pass?'pass':'fail', lastMs: r.ms });
}

function showRunResult(c, r) {
  $('runMTitle').textContent = (r.pass ? '✓ Passed' : '✗ Failed') + ': ' + c.name;
  $('runMBody').innerHTML =
    '<div class="rrg">'
    + '<div class="rrc '+(r.pass?'pc':'fc')+'"><div class="rv">'+(r.pass?'✓':'✗')+'</div><div class="rl">'+(r.pass?'Passed':'Failed')+'</div></div>'
    + '<div class="rrc"><div class="rv" style="font-family:DM Mono,monospace;font-size:14px">'+dur(r.ms||0)+'</div><div class="rl">Duration</div></div>'
    + '<div class="rrc"><div class="rv" style="font-family:DM Mono,monospace;font-size:14px">'+(r.status||'—')+'</div><div class="rl">HTTP Status</div></div>'
    + '</div>'
    + (r.error ? '<div style="background:var(--red-bg);border:1px solid rgba(240,91,91,.2);border-radius:8px;padding:9px 11px;font-size:11.5px;color:var(--red);margin-bottom:10px">'+r.error+'</div>' : '')
    + (r.note  ? '<div style="background:var(--amber-bg);border:1px solid rgba(245,166,35,.2);border-radius:8px;padding:9px 11px;font-size:11.5px;color:var(--amber);margin-bottom:10px">'+r.note+'</div>' : '')
    + (r.body  ? '<div class="fld"><label>Response</label><textarea class="ta" readonly style="min-height:80px">'+r.body.slice(0,600)+'</textarea></div>' : '');
  openModal('runModal');
}

async function deleteCase(id) {
  await bg('DEL_CASE', {id});
  G.cases = G.cases.filter(c => c.id !== id);
  renderTests(); updateCounts();
  toast('Deleted', 'info');
}

async function pushCase(id) {
  const c = G.cases.find(x => x.id === id);
  if (!c) return;
  const r = await bg('PUSH_PLATFORM', { data:{ type:'TEST_CASE', ...c }});
  toast(r?.ok ? '↑ Sent!' : '✗ ' + r?.error, r?.ok ? 'pass' : 'fail');
}

// ═══════════════════════════════════════════════════
//  RESULTS
// ═══════════════════════════════════════════════════
function renderResults() {
  $('tb-results').textContent = G.results.length;
  const wrap = $('resultsWrap');
  if (!G.results.length) {
    wrap.innerHTML = '<div class="empty"><div class="ei">📊</div><div class="et">No results yet</div></div>';
    return;
  }
  wrap.innerHTML = G.results.slice(0,30).map(r =>
    '<div class="rrow">'
    + '<div style="font-size:16px;flex-shrink:0">'+(r.pass?'✅':'❌')+'</div>'
    + '<div style="flex:1;min-width:0">'
      + '<div style="font-size:12px;font-weight:600">'+(r.caseName||'Test')+'</div>'
      + '<div style="font-size:10.5px;color:var(--t3);margin-top:1px">'+new Date(r.t0||Date.now()).toLocaleTimeString()+' · '+dur(r.ms||0)+(r.status?' · HTTP '+r.status:'')+'</div>'
    + '</div>'
    + '<span class="badge '+(r.pass?'bsage':'bpink')+'">'+(r.pass?'Pass':'Fail')+'</span>'
    + '</div>'
  ).join('');
}

async function clearResults() {
  await chrome.storage.local.set({ runResults:[] });
  G.results = [];
  renderResults(); updateCounts();
  toast('Cleared', 'info');
}

// ═══════════════════════════════════════════════════
//  SETTINGS
// ═══════════════════════════════════════════════════
function applySettings() {
  sv('sUrl',  G.settings.url);
  sv('sKey',  G.settings.key);
  sv('sFw',   G.settings.fw);
  sv('sLang', G.settings.lang);
  if (G.settings.theme === 'dark') applyDark(); else applyLight();
}

async function saveSettings() {
  G.settings.url  = gv('sUrl');
  G.settings.key  = gv('sKey');
  G.settings.fw   = gv('sFw');
  G.settings.lang = gv('sLang');
  await bg('SAVE_SETTINGS', { s: G.settings });
  toast('Settings saved!', 'pass');
}

async function checkApi(verbose) {
  const r    = await bg('HEALTH_CHECK', { url: G.settings.url, key: G.settings.key });
  const pill = $('apiPill'), txt = $('apiTxt');
  const syncPill = $('syncPill'), syncTxt = $('syncTxt');
  if (r?.ok) {
    pill.classList.add('live');  txt.textContent = 'Live';
    if (syncPill) { syncPill.className = 'sync-pill live'; syncTxt.textContent = 'WEBAPI ✓'; }
    if (verbose) toast('✓ Connected to WEBAPI at ' + G.settings.url, 'pass');
  } else {
    pill.classList.remove('live'); txt.textContent = 'Offline';
    if (syncPill) { syncPill.className = 'sync-pill fail'; syncTxt.textContent = 'WEBAPI ✗'; }
    if (verbose) toast('✗ WEBAPI offline — recordings will queue locally', 'fail');
  }
}

function setTheme(mode) {
  G.settings.theme = mode;
  if (mode === 'dark') applyDark(); else applyLight();
  bg('SAVE_SETTINGS', { s: G.settings });
}

function applyDark() {
  const s = document.documentElement.style;
  s.setProperty('--bg','#0e0f18');    s.setProperty('--sf','#14151f');
  s.setProperty('--sf2','#1a1b28');   s.setProperty('--sf3','#202135');
  s.setProperty('--b','#282940');     s.setProperty('--b2','#323350');
  s.setProperty('--tx','#eeeef8');    s.setProperty('--t2','#a0a0c0');
  s.setProperty('--t3','#606080');    s.setProperty('--t4','#404060');
  s.setProperty('--brand','#eeeef8');
  s.setProperty('--pink','#ff8fa8');  s.setProperty('--pink-bg','#2d1520');
  s.setProperty('--mint','#00e0a8');  s.setProperty('--mint-bg','#0d2820');
  s.setProperty('--sage','#6edba0');  s.setProperty('--sage-bg','#0e2820');
  s.setProperty('--amber','#ffba45'); s.setProperty('--amber-bg','#2a1e00');
  s.setProperty('--blue','#7da8ff');  s.setProperty('--blue-bg','#0f1535');
  s.setProperty('--lilac','#c4b0ff');s.setProperty('--lilac-bg','#1a1240');
  s.setProperty('--red','#ff7a7a');   s.setProperty('--red-bg','#2e0e0e');
}

function applyLight() {
  const s = document.documentElement.style;
  s.setProperty('--bg','#f4eefa');    s.setProperty('--sf','#ffffff');
  s.setProperty('--sf2','#fafafa');   s.setProperty('--sf3','#f2f2f5');
  s.setProperty('--b','#eaeaed');     s.setProperty('--b2','#dcdce2');
  s.setProperty('--tx','#141416');    s.setProperty('--t2','#5a5a68');
  s.setProperty('--t3','#9898a8');    s.setProperty('--t4','#c4c4d0');
  s.setProperty('--brand','#141416');
  s.setProperty('--pink','#ff6b8a');  s.setProperty('--pink-bg','#fff0f3');
  s.setProperty('--mint','#00c896');  s.setProperty('--mint-bg','#e6fff8');
  s.setProperty('--sage','#5bc788');  s.setProperty('--sage-bg','#edfaf3');
  s.setProperty('--amber','#f5a623');s.setProperty('--amber-bg','#fff8ec');
  s.setProperty('--blue','#4f7cff');  s.setProperty('--blue-bg','#eff3ff');
  s.setProperty('--lilac','#a78bfa');s.setProperty('--lilac-bg','#f4f0ff');
  s.setProperty('--red','#f05b5b');   s.setProperty('--red-bg','#fff1f1');
}

async function clearAll() {
  if (!confirm('Clear ALL data?')) return;
  await chrome.storage.local.set({ recordings:[], cases:[], runResults:[] });
  G.recordings=[]; G.cases=[]; G.results=[];
  renderAll();
  toast('All data cleared', 'info');
}

// ═══════════════════════════════════════════════════
//  UTILS
// ═══════════════════════════════════════════════════
function renderAll() {
  renderSteps(); renderNetCalls();
  renderLibrary(); renderTests(); renderResults();
  updateCounts(); populateGenSel();
}

function updateCounts() {
  $('hRecs').textContent      = G.recordings.length;
  $('hCases').textContent     = G.cases.length;
  $('hRuns').textContent      = G.results.length;
  $('tb-lib').textContent     = G.recordings.length;
  $('tb-tests').textContent   = G.cases.length;
  $('tb-results').textContent = G.results.length;
}

function showPg(name) {
  document.querySelectorAll('.pg').forEach(p => p.classList.remove('on'));
  document.querySelectorAll('.tab,.tab-settings').forEach(t => t.classList.remove('on'));
  $('pg-' + name)?.classList.add('on');
  $('t-'  + name)?.classList.add('on');
  if (name === 'library')  renderLibrary();
  if (name === 'tests')    renderTests();
  if (name === 'results')  renderResults();
  if (name === 'generate') populateGenSel();
}

function openModal(id)  { $(id)?.classList.add('on'); }
function closeModal(id) { $(id)?.classList.remove('on'); }

function toast(msg, type='info') {
  const el = document.createElement('div');
  el.className = 'tst t' + type[0];
  el.innerHTML = '<div class="tst-dot"></div><span>' + msg + '</span>';
  $('toasts').appendChild(el);
  setTimeout(() => el.remove(), 3000);
}

boot();
