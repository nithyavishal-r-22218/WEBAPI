
// ═══════════════════════════════════════════════════
//  STATE
// ═══════════════════════════════════════════════════
const G = {
  recordings:[], cases:[], results:[],
  settings:{ url:'http://localhost:4000', key:'godmode-dev-key', fw:'playwright', lang:'javascript', theme:'light', zohoToken:'', zohoPortal:'', zohoDC:'.com', zpClientId:'', zpClientSecret:'', zpPortalId:'', zpPortals:[], zpEnvironments:[] },
  live:{ steps:[], network:[], recording:false, name:'', startUrl:'', t0:null, id:null },
  genFW:'playwright', genLang:'javascript', genCode:'', genRecId:'',
  editCaseId:null,
  inspectActive:false
};

const $   = id => document.getElementById(id);
const gv  = id => { const e=$(id); return e ? e.value.trim() : ''; };
const sv  = (id,v) => { const e=$(id); if(e) e.value = v; };
const uid = () => 'x' + Date.now().toString(36) + Math.random().toString(36).slice(2,5);
const dur = ms => ms < 1000 ? ms + 'ms' : (ms/1000).toFixed(2) + 's';

// ── Animated counter ─────────────────────────────────────────────────────────
function animateCount(el, to) {
  if (!el) return;
  const from = parseInt(el.textContent) || 0;
  if (from === to) return;
  const diff = to - from;
  const steps = Math.min(Math.abs(diff), 20);
  const dur = 300;
  let i = 0;
  const tick = () => {
    i++;
    el.textContent = Math.round(from + diff * (i / steps));
    if (i < steps) requestAnimationFrame(tick);
  };
  requestAnimationFrame(tick);
}

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

const ACT_ICO = { NAVIGATE_TO:'🔗', CLICK:'👆', DOUBLE_CLICK:'👆', SEND_KEYS:'✏', CLEAR:'🧹', ASSERT_CHECK:'✅', ENTER_KEY:'⏎', ESCAPE_KEY:'⎋', BACK_SPACE_KEY:'⌫', SHORTCUT_KEY:'⌨', CUT_COPY_PASTE_SELECTALL:'📋', RIGHT_CLICK:'🖱', SCROLL_TO_ELEMENT:'📜', SCROLL_TO_ELEMENT_AND_CLICK:'📜', MOVE_TO_ELEMENT:'🫳', MOVE_TO_ELEMENT_WITHOUT_CLICK:'🫳', MOVE_BY_OFFSET:'↔', SWITCH_TO_FRAME:'🖼', DEFAULT_FRAME:'🖼', DRAG_AND_DROP:'🔀', HOLD_AND_MOVE:'✊', REFRESH:'🔄', BACK:'⬅', FORWARD:'➡', CLOSE:'✕', QUIT:'⏏', GET_TEXT:'📄', GET_ATTRIBUTE:'🏷', GET_ELEMENT_SIZE:'📐', GET_CURRENT_URL:'🌐', GET_TITLE:'📰', GET_PAGE_SOURCE:'📃', GET_CLASS:'🎨', IS_DISPLAYED:'👁', IS_ENABLED:'✓', IS_SELECTED:'☑', STORE_VALUES:'💾', GET_LAST_ID_FROM_URL:'🔢', CUSTOM_JS:'⚡', CONDITIONS:'🔀', ASSOCIATE_ACTION_GROUP:'📦', ASSOCIATE_API:'🔌', SWITCH_TABS:'🔀', CLOSE_TABS:'✕', GET:'🌐', SHIFT_CONTROL_SELECT:'⇧', HOLD_CONTROL_SELECT:'⌃', COMPARE_PDF_CONTENT:'📑', COMPARE_PDF_PIXELS:'📑', default:'⚡' };
const ACT_CLS = { NAVIGATE_TO:'nav', CLICK:'clk', SEND_KEYS:'typ', ASSERT_CHECK:'ast', DOUBLE_CLICK:'clk', RIGHT_CLICK:'clk' };
const ACT_DESC = {
  GET_CURRENT_URL: 'Retrieves the current URL of the browser.',
  GET_TITLE: 'Gets the title of the current web page.',
  GET_PAGE_SOURCE: 'Fetches the complete HTML source of the current page.',
  GET_CLASS: 'Returns the class attribute value of a web element.',
  NAVIGATE_TO: 'Navigates the browser to a specified URL.',
  REFRESH: 'Refreshes the current web page.',
  BACK: 'Navigates back to the previous page in browser history.',
  FORWARD: 'Navigates forward to the next page in browser history.',
  CLOSE: 'Closes the current browser window.',
  QUIT: 'Closes all browser windows and ends the WebDriver session.',
  CLICK: 'Performs a click action on a web element.',
  RIGHT_CLICK: 'Performs a right-click (context click) on an element.',
  DOUBLE_CLICK: 'Performs a double-click on an element.',
  SEND_KEYS: 'Inputs text or keystrokes into a web element.',
  CLEAR: 'Clears the text from an input field.',
  GET_ELEMENT_SIZE: 'Retrieves the height and width of an element.',
  GET_ATTRIBUTE: 'Gets the value of a specified attribute of an element.',
  GET_TEXT: 'Retrieves the visible text of a web element.',
  MOVE_TO_ELEMENT: 'Moves the mouse cursor to the specified element.',
  CUT_COPY_PASTE_SELECTALL: 'Performs keyboard actions like cut, copy, paste, or select all.',
  SHORTCUT_KEY: 'Executes a keyboard shortcut action.',
  SHIFT_CONTROL_SELECT: 'Selects multiple elements using Shift or Control keys.',
  HOLD_CONTROL_SELECT: 'Selects multiple items by holding the Control key.',
  MOVE_TO_ELEMENT_WITHOUT_CLICK: 'Moves the cursor to an element without performing a click.',
  MOVE_BY_OFFSET: 'Moves the mouse by a specified offset from its current position.',
  SCROLL_TO_ELEMENT: 'Scrolls the page until the element is visible.',
  SCROLL_TO_ELEMENT_AND_CLICK: 'Scrolls to the element and performs a click.',
  SWITCH_TO_FRAME: 'Switches the driver context to a specified frame.',
  SWITCH_TABS: 'Switches control between browser tabs.',
  CLOSE_TABS: 'Closes one or more browser tabs.',
  DEFAULT_FRAME: 'Switches context back to the main document from a frame.',
  GET: 'Loads a new web page using the given URL.',
  IS_DISPLAYED: 'Checks if the element is visible on the page.',
  IS_ENABLED: 'Checks if the element is enabled for interaction.',
  IS_SELECTED: 'Checks if the element is selected (for checkboxes, radio buttons).',
  DRAG_AND_DROP: 'Drags an element and drops it onto another element.',
  HOLD_AND_MOVE: 'Clicks and holds an element, then moves it to another location.',
  COMPARE_PDF_CONTENT: 'Compares textual content between two PDF files.',
  COMPARE_PDF_PIXELS: 'Compares visual differences between two PDF files.',
  CUSTOM_JS: 'Executes custom JavaScript in the browser.',
  ESCAPE_KEY: 'Simulates pressing the Escape key.',
  ENTER_KEY: 'Simulates pressing the Enter key.',
  BACK_SPACE_KEY: 'Simulates pressing the Backspace key.',
  CONDITIONS: 'Applies conditional logic during test execution.',
  ASSERT_CHECK: 'Validates expected vs actual results.',
  STORE_VALUES: 'Stores values for later use in the test.',
  GET_LAST_ID_FROM_URL: 'Extracts the last ID or parameter from the URL.',
  ASSOCIATE_ACTION_GROUP: 'Links the current step with a predefined action group.',
  ASSOCIATE_API: 'Associates an API call with the current test step.'
};

// ── Random data ──
const XSS_PAYLOADS = [
  '<script>alert(1)</script>',
  '<img src=x onerror=alert(1)>',
  '<svg onload=alert(1)>',
  '"><script>alert(1)</script>',
  "'-alert(1)-'",
  '<body onload=alert(1)>',
  '<iframe src="javascript:alert(1)">',
  '<input onfocus=alert(1) autofocus>',
  '{{constructor.constructor("alert(1)")()}}',
  '<details open ontoggle=alert(1)>',
  '<marquee onstart=alert(1)>',
  "javascript:alert(document.cookie)",
  '"><img src=x onerror=alert(document.domain)>',
  '<math><mtext><table><mglyph><svg><mtext><textarea><path id=x style=d:expression(alert(1))>',
  'data:text/html,<script>alert(1)</script>'
];

function randomString(len) {
  const c = 'abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ';
  let r = ''; for (let i = 0; i < len; i++) r += c[Math.floor(Math.random()*c.length)];
  return r;
}
function randomNumber(len) {
  let r = ''; for (let i = 0; i < len; i++) r += Math.floor(Math.random()*10);
  if (r[0] === '0' && len > 1) r = (Math.floor(Math.random()*9)+1) + r.slice(1);
  return r;
}
function randomEmail() { return randomString(8).toLowerCase() + '@zohotest.com'; }
function randomParagraph(len) {
  const words = ['the','quick','brown','fox','jumps','over','lazy','dog','lorem','ipsum','dolor','sit','amet','testing','automation','quality','software','web','browser','data','input','form','field','check','verify','validate','click','submit','text','page','screen','element','button'];
  let r = '';
  while (r.length < len) { r += words[Math.floor(Math.random()*words.length)] + ' '; }
  return r.slice(0, len);
}
function generatePreview(type, len, xssIdx) {
  if (type === 'string')    return randomString(len);
  if (type === 'number')    return randomNumber(len);
  if (type === 'email')     return randomEmail();
  if (type === 'paragraph') return randomParagraph(len);
  if (type === 'xss')       return XSS_PAYLOADS[xssIdx || 0];
  return '';
}
function isRandomValue(v) { return v && v.startsWith('{{random:') && v.endsWith('}}'); }
function parseRandomToken(v) {
  const m = v.match(/^\{\{random:(\w+)(?::(\d+))?\}\}$/);
  if (!m) return null;
  return { type: m[1], len: m[2] ? parseInt(m[2]) : undefined };
}
function randomTokenLabel(v) {
  const p = parseRandomToken(v);
  if (!p) return v;
  const labels = { string:'String', number:'Number', email:'Email', paragraph:'Paragraph', xss:'XSS' };
  const ico = { string:'🔤', number:'🔢', email:'📧', paragraph:'📝', xss:'🛡' };
  let lbl = (ico[p.type]||'🎲') + ' ' + (labels[p.type]||p.type);
  if (p.len) lbl += ' (' + p.len + ' chars)';
  return lbl;
}

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
    } else {
      // Restore last stopped recording so steps aren't lost
      const d = await chrome.storage.local.get('lastStoppedRec');
      if (d.lastStoppedRec && d.lastStoppedRec.steps?.length) {
        G.live.steps   = d.lastStoppedRec.steps;
        G.live.network = d.lastStoppedRec.network || [];
        G.live.name    = d.lastStoppedRec.name || '';
        G.live.id      = d.lastStoppedRec.id;
        setRecUI(false);
        $('saveRecBtn').disabled = false;
      }
    }
    applySettings();
    renderAll();
    checkApi(false);
    chrome.runtime.onMessage.addListener(onBgMsg);
    // Pull data from WEBAPI in background
    pullFromGodMode();
    // Check if a test just finished — show result
    checkPendingTestResult();
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
  if ($('inspectBtn')) $('inspectBtn').addEventListener('click', handleInspectClick);

  [['t-record','record'],['t-library','library'],['t-generate','generate'],
   ['t-tests','tests'],['t-results','results'],['t-zoho','zoho'],['t-settings','settings']]
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
  $('seAction').addEventListener('change', () => {
    const ask = $('seRandomAsk');
    const applied = $('seRandomApplied');
    if ($('seAction').value === 'SEND_KEYS') {
      if (isRandomValue($('seValue').value)) {
        ask.style.display = 'none';
        applied.style.display = 'flex';
        $('rdAppliedTag').innerHTML = randomTokenLabel($('seValue').value);
        $('seValue').style.display = 'none';
      } else {
        ask.style.display = 'flex';
        applied.style.display = 'none';
      }
    }
    else { ask.style.display = 'none'; applied.style.display = 'none'; $('seValue').style.display = ''; }
    // Update action description
    const d = $('seActionDesc'); if (d) d.textContent = ACT_DESC[$('seAction').value] || '';
  });
  $('seRandomYes').addEventListener('click', openRandomModal);
  $('seRandomNo').addEventListener('click', () => { $('seRandomAsk').style.display = 'none'; $('seValue').style.display = ''; });
  $('seRandomEdit').addEventListener('click', openRandomModal);
  $('seRandomRemove').addEventListener('click', () => {
    $('seRandomApplied').style.display = 'none';
    $('seRandomAsk').style.display = 'flex';
    $('seValue').value = '';
    $('seValue').style.display = '';
  });

  // Random data modal
  $('closeRandomModal').addEventListener('click', () => closeModal('randomModal'));
  $('cancelRandomBtn').addEventListener('click',  () => closeModal('randomModal'));
  $('applyRandomBtn').addEventListener('click', applyRandomData);
  document.querySelectorAll('.rd-type').forEach(el => el.addEventListener('click', () => pickRdType(el)));
  $('rdLenSlider').addEventListener('input', updateRdPreview);

  // ZP Connection
  $('saveZohoBtn').addEventListener('click', saveZohoSettings);
  $('testZohoBtn').addEventListener('click', testZohoConnection);
  $('zpPortalSaveBtn').addEventListener('click', saveZpPortal);
  $('zpPortalCancelBtn').addEventListener('click', () => { $('zpPortalForm').style.display = 'none'; _zpEditPortalIdx = -1; });
  $('zpEnvSaveBtn').addEventListener('click', saveZpEnvironment);
  $('zpEnvCancelBtn').addEventListener('click', () => { $('zpEnvForm').style.display = 'none'; _zpEditEnvIdx = -1; });
  $('zpCredToggle').addEventListener('click', () => toggleZpSection('zpCredBody', 'zpCredArrow'));
  $('zpPortalToggle').addEventListener('click', () => toggleZpSection('zpPortalBody', 'zpPortalArrow'));
  $('zpEnvToggle').addEventListener('click', () => toggleZpSection('zpEnvBody', 'zpEnvArrow'));
  $('zohoExportBtn').addEventListener('click', openZohoExportModal);
  $('zohoExpRec').addEventListener('change', () => { $('zohoExportBtn').disabled = !gv('zohoExpRec'); });
  $('closeZohoExportModal').addEventListener('click', () => closeModal('zohoExportModal'));
  $('cancelZohoExportBtn').addEventListener('click', () => closeModal('zohoExportModal'));
  $('doZohoExportBtn').addEventListener('click', doZohoExport);
  $('zeProject').addEventListener('change', onZeProjectChange);
  // Import selects
  $('ziProject').addEventListener('change', onZiProjectChange);
  $('ziTasklist').addEventListener('change', onZiTasklistChange);
  $('ziTask').addEventListener('change', () => { $('zohoImportBtn').disabled = !gv('ziTask'); });
  $('zohoImportBtn').addEventListener('click', openZohoImportModal);
  $('closeZohoImportModal').addEventListener('click', () => closeModal('zohoImportModal'));
  $('cancelZohoImportBtn').addEventListener('click', () => closeModal('zohoImportModal'));
  $('ziImportBtn').addEventListener('click', importZohoTask);
  $('ziRunBtn').addEventListener('click', runZohoTask);


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
      case 'loadRec':      loadRecording(id);      break;
      case 'zpEditPortal': openZpPortalForm(parseInt(id)); break;
      case 'zpDelPortal':  deleteZpPortal(parseInt(id)); break;
      case 'zpEditEnv':    openZpEnvForm(parseInt(id)); break;
      case 'zpDelEnv':     deleteZpEnvironment(parseInt(id)); break;
    }
  });
}

// ═══════════════════════════════════════════════════
//  BACKGROUND MESSAGE HANDLER
// ═══════════════════════════════════════════════════
function onBgMsg(msg) {
  if (msg.type === 'STEP') {
    G.live.steps.push(msg.step);
    animateCount($('hSteps'), msg.total);
    renderSteps();
  }
  if (msg.type === 'STEPS_UPDATED') {
    // Full step list replaced (e.g. scroll_to inserted before click)
    G.live.steps = msg.steps;
    animateCount($('hSteps'), msg.total);
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

  // Fired when user clicks STOP on the in-page recording pill
  if (msg.type === 'REC_STOPPED' && msg.rec) {
    G.live.recording = false;
    G.live.steps     = msg.rec.steps   || [];
    G.live.network   = msg.rec.network || [];
    G.live.name      = msg.rec.name    || '';
    G.live.id        = msg.rec.id;
    // Reset inspect state since recording is over
    G.inspectActive = false;
    const ib = $('inspectBtn');
    if (ib) { ib.classList.remove('on'); ib.textContent = '🎯 Inspect'; }
    setRecUI(false);
    renderSteps();
    renderNetCalls();
    $('saveRecBtn').disabled = false;
    // No need to persist — background.js now auto-saves in stopRec()
    const idx = G.recordings.findIndex(r => r.id === msg.rec.id);
    if (idx >= 0) G.recordings[idx] = msg.rec;
    else G.recordings.unshift(msg.rec);
    updateCounts();
    renderLibrary();
    toast('✓ ' + (msg.rec.steps?.length || 0) + ' steps saved', 'pass');
  }

  // Locator picked from inspect mode
  if (msg.type === 'LOCATOR_SELECTED' && msg.locator) {
    const el = $('locatorResult');
    const sleepMs = msg.locator.sleep || msg.sleep || 0;
    if (el) {
      el.style.display = 'block';
      el.innerHTML =
        '<div style="font-size:10px;font-weight:700;color:var(--t3);text-transform:uppercase;letter-spacing:.5px;margin-bottom:4px">Selected Locator</div>'
        + '<div style="font-size:10px;color:var(--blue);font-weight:600;margin-bottom:2px">' + msg.locator.type + ' (' + msg.locator.strategy + ')' + (sleepMs ? ' &middot; ⏱ ' + sleepMs + 'ms' : '') + '</div>'
        + '<div style="font-size:11px;font-family:DM Mono,monospace;color:var(--tx);background:var(--sf3);padding:6px 8px;border-radius:6px;word-break:break-all;cursor:pointer" title="Click to copy" id="locatorValCopy">' + msg.locator.value + '</div>';
      const copyEl = $('locatorValCopy');
      if (copyEl) {
        copyEl.addEventListener('click', () => {
          navigator.clipboard.writeText(msg.locator.value).then(() => toast('Copied!', 'pass'));
        });
      }
    }
  }

  // Inspect stopped from page (ESC key)
  if (msg.type === 'INSPECT_STOPPED') {
    G.inspectActive = false;
    const btn = $('inspectBtn');
    if (btn) { btn.classList.remove('on'); btn.textContent = '🎯 Inspect'; }
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
      // Auto-stop inspect if active
      if (G.inspectActive) {
        await bg('STOP_INSPECT');
        G.inspectActive = false;
        const ib = $('inspectBtn');
        if (ib) { ib.classList.remove('on'); ib.textContent = '🎯 Inspect'; }
      }
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
        // Close popup so only the in-page pill remains
        setTimeout(() => window.close(), 400);
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

// ── Inspect mode toggle ──────────────────────────────────────────────────
async function handleInspectClick() {
  const btn = $('inspectBtn');
  if (!btn) return;
  if (G.live.recording) {
    toast('Stop recording first', 'fail');
    return;
  }
  if (G.inspectActive) {
    await bg('STOP_INSPECT');
    G.inspectActive = false;
    btn.classList.remove('on');
    btn.textContent = '🎯 Inspect';
    toast('Inspect mode off', 'info');
  } else {
    await bg('START_INSPECT');
    G.inspectActive = true;
    btn.classList.add('on');
    btn.textContent = '🎯 Inspecting…';
    toast('Hover over elements to see locators', 'pass');
  }
}

// Persist rec to storage AND update in-memory G.recordings
async function persistRec(rec) {
  await bg('SAVE_REC', { rec });
  const idx = G.recordings.findIndex(r => r.id === rec.id);
  if (idx >= 0) G.recordings[idx] = rec;
  else          G.recordings.unshift(rec);
  G.live.id = rec.id;
  // Keep lastStoppedRec in sync so popup reload shows latest edits
  await chrome.storage.local.set({ lastStoppedRec: rec });
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
  const inspBtn = $('inspectBtn');
  if (isRec) {
    ring.classList.add('on'); pill.classList.add('on');
    ico.textContent = '⏹'; txt.textContent = '■ Stop';
    title.textContent = 'Recording in progress…';
    sub.textContent   = 'Click ■ Stop when done · Double-click to assert';
    if (inspBtn) { inspBtn.disabled = true; inspBtn.style.opacity = '0.4'; inspBtn.style.pointerEvents = 'none'; }
  } else {
    ring.classList.remove('on'); pill.classList.remove('on');
    ico.textContent = '⏺'; txt.textContent = '● Rec';
    const n = G.live.steps.length;
    title.textContent = n > 0 ? '✓ Done — ' + n + ' steps saved to Library' : 'Click to Start Recording';
    sub.textContent   = n > 0 ? 'View in Library · Generate code · Run test' : 'Captures clicks · inputs · navigation';
    if (inspBtn) { inspBtn.disabled = false; inspBtn.style.opacity = '1'; inspBtn.style.pointerEvents = 'auto'; }
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
    let val = '';
    if (s.value && isRandomValue(s.value)) {
      val = '<div class="sv"><span class="rd-tag">' + randomTokenLabel(s.value) + '</span></div>';
    } else if (s.value) {
      val = '<div class="sv">"' + s.value.slice(0,40) + '"</div>';
    }
    if (s.sleep) val += '<div class="sv" style="color:var(--t2);font-size:11px">⏱ ' + s.sleep + 'ms</div>';
    return '<div class="step ' + cls + '" data-idx="' + i + '" draggable="true">'
      + '<div class="sdrag" title="Drag to reorder">⠿</div>'
      + '<div class="sn">' + (i+1) + '</div>'
      + '<span class="si">' + ico + '</span>'
      + '<div class="sb" style="cursor:pointer" data-action="editStep" data-id="' + i + '">'
        + '<div class="sa" title="' + (ACT_DESC[s.action] || '') + '">' + s.action + '</div>'
        + '<div class="st">' + tgt + '</div>' + val
      + '</div>'
      + '<button class="sdel" data-action="delStep" data-id="' + i + '">✕</button>'
      + '</div>';
  }).join('') + '</div>';
  // Attach drag-and-drop
  initStepDrag();
}

function editStep(i) {
  const s = G.live.steps[i];
  if (!s) return;
  $('stepEditTitle').textContent = 'Edit Step ' + (i+1);
  $('seAction').value  = s.action;
  $('seTarget').value  = s.target || s.url || '';
  $('seValue').value   = s.value  || '';
  $('seSleep').value   = s.sleep  || 0;
  // Show action description
  const descEl = $('seActionDesc');
  if (descEl) descEl.textContent = ACT_DESC[s.action] || '';
  G._editStepIdx = i;
  const ask     = $('seRandomAsk');
  const applied = $('seRandomApplied');
  if (s.action === 'SEND_KEYS') {
    if (isRandomValue(s.value)) {
      // Random data already applied — show applied state
      ask.style.display = 'none';
      applied.style.display = 'flex';
      $('rdAppliedTag').innerHTML = randomTokenLabel(s.value);
      $('seValue').value = s.value;
      $('seValue').style.display = 'none';
    } else {
      // No random data — show Yes/No prompt
      ask.style.display = 'flex';
      applied.style.display = 'none';
      $('seValue').style.display = '';
    }
  } else {
    ask.style.display = 'none';
    applied.style.display = 'none';
    $('seValue').style.display = '';
  }
  openModal('stepEditModal');
}

function applyStepEdit() {
  const i = G._editStepIdx;
  if (i === undefined || i < 0) return;
  const s = G.live.steps[i];
  s.action = $('seAction').value || s.action;
  s.target = $('seTarget').value || s.target;
  s.url    = s.action === 'NAVIGATE_TO' ? $('seTarget').value : s.url;
  s.value  = $('seValue').value;
  s.sleep  = parseInt($('seSleep').value) || 0;
  closeModal('stepEditModal');
  renderSteps();
  // Persist to lastStoppedRec so popup reload reflects edits
  const lsr = {
    id: G.live.id, name: G.live.name || '',
    steps: [...G.live.steps], network: [...G.live.network],
    startUrl: G.live.startUrl || G.live.steps[0]?.url || '',
    at: new Date().toISOString()
  };
  chrome.storage.local.set({ lastStoppedRec: lsr });
  $('saveRecBtn').disabled = false;
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
  // Persist deletion so popup reload reflects it
  if (G.live.steps.length) {
    chrome.storage.local.set({ lastStoppedRec: {
      id: G.live.id, name: G.live.name || '',
      steps: [...G.live.steps], network: [...G.live.network],
      startUrl: G.live.startUrl || G.live.steps[0]?.url || '',
      at: new Date().toISOString()
    }});
  } else {
    chrome.storage.local.remove('lastStoppedRec');
  }
}

function clearSteps() {
  G.live.steps=[]; G.live.network=[];
  renderSteps(); renderNetCalls();
  $('saveRecBtn').disabled = true;
  $('hSteps').textContent = '0';
  setRecUI(false);
  chrome.storage.local.remove('lastStoppedRec');
}

function openNameModal() { sv('nameInput', G.live.name || ''); openModal('nameModal'); }
function applyName()     { G.live.name = gv('nameInput') || G.live.name; closeModal('nameModal'); toast('Name updated', 'info'); } // kept for compat

// ═══════════════════════════════════════════════════
//  DRAG-AND-DROP STEP REORDER
// ═══════════════════════════════════════════════════
function initStepDrag() {
  const list = document.querySelector('.steps-list');
  if (!list) return;
  let dragIdx = null;
  list.querySelectorAll('.step').forEach(el => {
    el.addEventListener('dragstart', e => {
      dragIdx = parseInt(el.dataset.idx);
      el.classList.add('dragging');
      e.dataTransfer.effectAllowed = 'move';
      e.dataTransfer.setData('text/plain', dragIdx);
    });
    el.addEventListener('dragend', () => {
      el.classList.remove('dragging');
      list.querySelectorAll('.step').forEach(s => s.classList.remove('drag-over'));
      dragIdx = null;
    });
    el.addEventListener('dragover', e => {
      e.preventDefault();
      e.dataTransfer.dropEffect = 'move';
      const overIdx = parseInt(el.dataset.idx);
      list.querySelectorAll('.step').forEach(s => s.classList.remove('drag-over'));
      if (overIdx !== dragIdx) el.classList.add('drag-over');
    });
    el.addEventListener('dragleave', () => {
      el.classList.remove('drag-over');
    });
    el.addEventListener('drop', e => {
      e.preventDefault();
      const fromIdx = dragIdx;
      const toIdx = parseInt(el.dataset.idx);
      if (fromIdx === null || fromIdx === toIdx) return;
      const [moved] = G.live.steps.splice(fromIdx, 1);
      G.live.steps.splice(toIdx, 0, moved);
      renderSteps();
      $('saveRecBtn').disabled = false;
      // Persist reorder to lastStoppedRec
      if (G.live.steps.length) {
        chrome.storage.local.set({ lastStoppedRec: {
          id: G.live.id, name: G.live.name || '',
          steps: [...G.live.steps], network: [...G.live.network],
          startUrl: G.live.startUrl || G.live.steps[0]?.url || '',
          at: new Date().toISOString()
        }});
      }
      toast('Step moved', 'info');
    });
  });
}

// ═══════════════════════════════════════════════════
//  LOAD RECORDING INTO EDITOR (from Library)
// ═══════════════════════════════════════════════════
function loadRecording(id) {
  const rec = G.recordings.find(r => r.id === id);
  if (!rec) { toast('Recording not found', 'fail'); return; }
  G.live.steps   = [...(rec.steps || [])];
  G.live.network = [...(rec.network || [])];
  G.live.name    = rec.name || '';
  G.live.id      = rec.id;
  G.live.startUrl = rec.startUrl || '';
  G.live.recording = false;
  setRecUI(false);
  renderSteps();
  renderNetCalls();
  $('saveRecBtn').disabled = false;
  chrome.storage.local.set({ lastStoppedRec: rec });
  showPg('record');
  toast('📝 Loaded "' + rec.name + '" — edit & save', 'info');
}

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
      + '<span style="font-weight:600;font-size:11.5px" title="'+(ACT_DESC[s.action]||'')+'">'+s.action+'</span>'
      + '<span style="color:var(--t3);overflow:hidden;text-overflow:ellipsis;white-space:nowrap;font-size:10px;font-family:DM Mono,monospace">'+(s.target||s.url||'').slice(0,46)+'</span>'
      + '</div>'
    ).join('');
    if (steps.length > 4) preview += '<div style="font-size:10.5px;color:var(--t3);padding-left:22px">+' + (steps.length-4) + ' more</div>';
    return '<div class="rcard">'
      + '<div class="rcard-hd">'
        + '<div class="rthumb" data-action="loadRec" data-id="'+r.id+'" style="cursor:pointer" title="Click to edit">🖥️</div>'
        + '<div class="ri" data-action="loadRec" data-id="'+r.id+'" style="cursor:pointer" title="Click to edit"><div class="rname">'+r.name+'</div>'
          + '<div class="rmeta">'+steps.length+' steps · '+new Date(r.at).toLocaleTimeString()+'</div></div>'
        + '<div class="racts">'
          + '<button class="ia edit" data-action="loadRec"        data-id="'+r.id+'" title="Edit recording">📝</button>'
          + '<button class="ia add"  data-action="runRec"         data-id="'+r.id+'" title="Run test">▶</button>'
          + '<button class="ia gen"  data-action="jumpGenerate"   data-id="'+r.id+'" title="Generate code">⚡</button>'
          + '<button class="ia"      data-action="renameRec"      data-id="'+r.id+'" title="Rename" style="font-size:11px">✏</button>'
          + '<button class="ia push" data-action="recToPlatform"  data-id="'+r.id+'" title="Push to platform">↑</button>'
          + '<button class="ia del"  data-action="deleteRec"      data-id="'+r.id+'" title="Delete">✕</button>'
        + '</div>'
      + '</div>'
      + '<div class="rpreview" data-action="loadRec" data-id="'+r.id+'" style="cursor:pointer" title="Click to edit">'+preview+'</div>'
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
  const r = await bg('PUSH_PLATFORM', { data:{ type:'RECORDING', id:rec.id, name:rec.name, startUrl:rec.startUrl, steps:rec.steps, network:rec.network }});
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
  // Close popup — test pill will show on the page
  setTimeout(() => window.close(), 300);
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
  info.textContent   = (rec.steps?.length||0) + ' steps · ' + (rec.startUrl || '—');
}

function pickFW(el) {
  document.querySelectorAll('.fwc').forEach(c => c.classList.remove('on'));
  el.classList.add('on'); G.genFW = el.dataset.fw;
  const compat = {
    playwright:['javascript','typescript','python','java','csharp'],
    cypress:['javascript','typescript'], selenium:['javascript','python','java','csharp']
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

  toast('Running: ' + c.name, 'info');
  // Close popup for web replay — test pill will show on the page
  if (c.type !== 'API' && c.type !== 'WEB_API') {
    setTimeout(() => window.close(), 300);
  }

  const btn = document.querySelector('[data-action="runCase"][data-id="'+id+'"]');
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
//  PENDING TEST RESULT (auto-show after test replay)
// ═══════════════════════════════════════════════════
async function checkPendingTestResult() {
  const d = await chrome.storage.local.get('lastTestResult');
  if (!d.lastTestResult) return;
  const { res, caseName } = d.lastTestResult;
  // Clear it so it doesn't show again
  await chrome.storage.local.remove('lastTestResult');
  // Update local state
  const fullResult = { ...res, caseName };
  G.results.unshift(fullResult);
  renderResults(); updateCounts();
  // Show the result modal
  showRunResult({ name: caseName }, res);
  toast((res.pass ? '✓ Pass' : '✗ Fail') + ' — ' + caseName, res.pass ? 'pass' : 'fail');
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
  sv('zpClientId', G.settings.zpClientId || '');
  sv('zpClientSecret', G.settings.zpClientSecret || '');
  sv('zohoToken', G.settings.zohoToken || '');
  if (G.settings.zpClientId || G.settings.zpClientSecret) {
    const ti = $('zpTokenInfo');
    if (ti) ti.style.display = 'block';
  }
  renderZpPortals();
  renderZpEnvironments();
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
  s.setProperty('--bg','linear-gradient(135deg,#0f172a 0%,#1e1b4b 25%,#171728 50%,#1a0a2e 75%,#0f172a 100%)');
  s.setProperty('--bg-solid','#0f172a');
  s.setProperty('--glass','rgba(30,41,59,.65)');
  s.setProperty('--glass2','rgba(30,41,59,.45)');
  s.setProperty('--glass3','rgba(30,41,59,.3)');
  s.setProperty('--glassborder','rgba(148,163,184,.12)');
  s.setProperty('--sf','rgba(30,41,59,.65)');
  s.setProperty('--sf2','rgba(30,41,59,.45)');s.setProperty('--sf3','rgba(30,41,59,.3)');
  s.setProperty('--b','rgba(148,163,184,.1)');s.setProperty('--b2','rgba(148,163,184,.18)');
  s.setProperty('--tx','#e2e8f0');    s.setProperty('--t2','#94a3b8');
  s.setProperty('--t3','#64748b');    s.setProperty('--t4','#475569');
  s.setProperty('--brand','#60a5fa');
  s.setProperty('--pink','#f9a8d4');  s.setProperty('--pink-bg','rgba(249,168,212,.1)');
  s.setProperty('--mint','#6ee7b7');  s.setProperty('--mint-bg','rgba(110,231,183,.1)');
  s.setProperty('--sage','#86efac');  s.setProperty('--sage-bg','rgba(134,239,172,.1)');
  s.setProperty('--amber','#fcd34d'); s.setProperty('--amber-bg','rgba(252,211,77,.1)');
  s.setProperty('--blue','#93c5fd');  s.setProperty('--blue-bg','rgba(147,197,253,.1)');
  s.setProperty('--lilac','#c4b5fd');s.setProperty('--lilac-bg','rgba(196,181,253,.1)');
  s.setProperty('--red','#fca5a5');   s.setProperty('--red-bg','rgba(252,165,165,.1)');
}

function applyLight() {
  const s = document.documentElement.style;
  s.setProperty('--bg','linear-gradient(135deg,#dbeafe 0%,#e0e7ff 25%,#f3e8ff 50%,#fce7f3 75%,#dbeafe 100%)');
  s.setProperty('--bg-solid','#e8eeff');
  s.setProperty('--glass','rgba(255,255,255,.55)');
  s.setProperty('--glass2','rgba(255,255,255,.35)');
  s.setProperty('--glass3','rgba(255,255,255,.2)');
  s.setProperty('--glassborder','rgba(255,255,255,.65)');
  s.setProperty('--sf','rgba(255,255,255,.62)');
  s.setProperty('--sf2','rgba(255,255,255,.4)');s.setProperty('--sf3','rgba(255,255,255,.28)');
  s.setProperty('--b','rgba(148,163,184,.18)');s.setProperty('--b2','rgba(148,163,184,.28)');
  s.setProperty('--tx','#1e293b');    s.setProperty('--t2','#475569');
  s.setProperty('--t3','#94a3b8');    s.setProperty('--t4','#cbd5e1');
  s.setProperty('--brand','#3b82f6');
  s.setProperty('--pink','#f472b6');  s.setProperty('--pink-bg','rgba(244,114,182,.12)');
  s.setProperty('--mint','#34d399');  s.setProperty('--mint-bg','rgba(52,211,153,.12)');
  s.setProperty('--sage','#4ade80');  s.setProperty('--sage-bg','rgba(74,222,128,.12)');
  s.setProperty('--amber','#fbbf24');s.setProperty('--amber-bg','rgba(251,191,36,.12)');
  s.setProperty('--blue','#60a5fa');  s.setProperty('--blue-bg','rgba(96,165,250,.12)');
  s.setProperty('--lilac','#a78bfa');s.setProperty('--lilac-bg','rgba(167,139,250,.12)');
  s.setProperty('--red','#f87171');   s.setProperty('--red-bg','rgba(248,113,113,.12)');
}

async function clearAll() {
  if (!confirm('Clear ALL data?')) return;
  await chrome.storage.local.clear();
  // Re-save settings so they survive the clear
  await bg('SAVE_SETTINGS', { s: G.settings });
  G.recordings=[]; G.cases=[]; G.results=[];
  G.live.steps=[]; G.live.network=[]; G.live.name=''; G.live.id=null;
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
  animateCount($('hRecs'), G.recordings.length);
  animateCount($('hCases'), G.cases.length);
  animateCount($('hRuns'), G.results.length);
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
  if (name === 'zoho')     { populateZohoRecSel(); renderZpPortals(); renderZpEnvironments(); }
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

// ═══════════════════════════════════════════════════
//  RANDOM DATA MODAL
// ═══════════════════════════════════════════════════
let _rdType = 'string', _rdLen = 10, _rdXssIdx = 0;

function openRandomModal() {
  _rdType = 'string'; _rdLen = 10; _rdXssIdx = 0;
  // Check if current value is already random
  const cur = $('seValue').value;
  if (isRandomValue(cur)) {
    const p = parseRandomToken(cur);
    if (p) {
      _rdType = p.type;
      if (p.len) _rdLen = p.len;
      if (p.type === 'xss' && p.len !== undefined) _rdXssIdx = p.len;
    }
  }
  // Reset UI
  document.querySelectorAll('.rd-type').forEach(el => el.classList.toggle('on', el.dataset.rtype === _rdType));
  $('rdLenSlider').value = _rdLen;
  $('rdLenVal').textContent = _rdLen;
  renderRdConfig();
  updateRdPreview();
  renderXssList();
  openModal('randomModal');
}

function pickRdType(el) {
  _rdType = el.dataset.rtype;
  document.querySelectorAll('.rd-type').forEach(t => t.classList.toggle('on', t === el));
  renderRdConfig();
  updateRdPreview();
  if (_rdType === 'xss') renderXssList();
}

function renderRdConfig() {
  $('rdLenConfig').style.display   = (_rdType === 'string' || _rdType === 'number' || _rdType === 'paragraph') ? '' : 'none';
  $('rdEmailConfig').style.display = _rdType === 'email' ? '' : 'none';
  $('rdXssConfig').style.display   = _rdType === 'xss' ? '' : 'none';
  // Adjust slider range per type
  if (_rdType === 'string')    { $('rdLenSlider').min=1; $('rdLenSlider').max=100; }
  if (_rdType === 'number')    { $('rdLenSlider').min=1; $('rdLenSlider').max=20; }
  if (_rdType === 'paragraph') { $('rdLenSlider').min=10; $('rdLenSlider').max=500; }
}

function updateRdPreview() {
  _rdLen = parseInt($('rdLenSlider').value) || 10;
  $('rdLenVal').textContent = _rdLen;
  $('rdPreview').textContent = generatePreview(_rdType, _rdLen, _rdXssIdx);
}

function renderXssList() {
  $('rdXssList').innerHTML = XSS_PAYLOADS.map((x, i) =>
    '<div class="rd-xss' + (i === _rdXssIdx ? ' on' : '') + '" data-xidx="' + i + '">' + escHtml(x) + '</div>'
  ).join('');
  $('rdXssList').querySelectorAll('.rd-xss').forEach(el =>
    el.addEventListener('click', () => {
      _rdXssIdx = parseInt(el.dataset.xidx);
      $('rdXssList').querySelectorAll('.rd-xss').forEach(x => x.classList.toggle('on', x === el));
      $('rdPreview').textContent = XSS_PAYLOADS[_rdXssIdx];
    })
  );
}

function escHtml(s) { return s.replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;'); }

function applyRandomData() {
  let token;
  if (_rdType === 'xss')        token = '{{random:xss:' + _rdXssIdx + '}}';
  else if (_rdType === 'email') token = '{{random:email}}';
  else                          token = '{{random:' + _rdType + ':' + _rdLen + '}}';
  $('seValue').value = token;
  $('seValue').style.display = 'none';
  // Switch to applied state
  $('seRandomAsk').style.display = 'none';
  $('seRandomApplied').style.display = 'flex';
  $('rdAppliedTag').innerHTML = randomTokenLabel(token);
  closeModal('randomModal');
  toast('🎲 Random ' + _rdType + ' applied', 'pass');
}

// ═══════════════════════════════════════════════════
//  ZP INTEGRATION
// ═══════════════════════════════════════════════════

function getZohoCreds() {
  // Use first portal as default; prefer portalId over name (names can have spaces which Zoho rejects)
  const portals = G.settings.zpPortals || [];
  const firstPortal = portals[0] || {};
  return { token: G.settings.zohoToken, portal: firstPortal.id || firstPortal.name || G.settings.zpPortalId || G.settings.zohoPortal || '', dc: G.settings.zohoDC || '.com', clientId: G.settings.zpClientId, clientSecret: G.settings.zpClientSecret, portalId: firstPortal.id || G.settings.zpPortalId || '' };
}

async function saveZohoSettings() {
  G.settings.zpClientId     = gv('zpClientId');
  G.settings.zpClientSecret = gv('zpClientSecret');
  G.settings.zohoToken      = gv('zohoToken');
  await bg('SAVE_SETTINGS', { s: G.settings });
  if (G.settings.zpClientId || G.settings.zpClientSecret) {
    const ti = $('zpTokenInfo');
    if (ti) ti.style.display = 'block';
  }
  toast('ZP credentials saved!', 'pass');
}

async function testZohoConnection() {
  const token = gv('zohoToken');
  const { portal, dc } = getZohoCreds();
  if (!token || !portal) { toast('Enter refresh token & add a portal first', 'fail'); return; }
  const st = $('zohoConnStatus');
  st.style.display = 'block';
  st.style.background = 'rgba(59,130,246,.1)';
  st.style.color = '#60a5fa';
  st.textContent = 'Testing connection…';
  const r = await bg('ZOHO_TEST', { token, portal, dc });
  if (r?.ok) {
    st.style.background = 'rgba(34,197,94,.1)';
    st.style.color = '#22c55e';
    st.textContent = '✓ Connected — ' + r.count + ' project(s) found';
    G.settings.zohoToken = token;
    G.settings.zpClientId = gv('zpClientId');
    G.settings.zpClientSecret = gv('zpClientSecret');
    await bg('SAVE_SETTINGS', { s: G.settings });
  } else {
    st.style.background = 'rgba(239,68,68,.1)';
    st.style.color = '#ef4444';
    st.textContent = '✗ ' + (r?.error || 'Connection failed');
  }
}

// ── ZP Portals (multiple) ────────────────────────────
let _zpEditPortalIdx = -1;

function renderZpPortals() {
  const portals = G.settings.zpPortals || [];
  const wrap = $('zpPortalList');
  if (!wrap) return;
  const form = $('zpPortalForm');

  if (!portals.length) {
    wrap.innerHTML = '<div style="text-align:center;padding:18px 0">'
      + '<div style="font-size:11px;color:var(--t3);margin-bottom:8px">No portals configured</div>'
      + '<button class="btn btn-dark btn-sm" id="zpPortalAddCenterBtn">+ Add Portal</button>'
      + '</div>';
    if (form) form.style.display = 'none';
    const cb = $('zpPortalAddCenterBtn');
    if (cb) cb.addEventListener('click', () => openZpPortalForm(-1));
    return;
  }

  let html = '<div style="display:flex;justify-content:flex-end;margin-bottom:6px">'
    + '<button class="btn btn-dark btn-xs" id="zpPortalAddTopBtn">+ Add</button></div>';
  portals.forEach((p, i) => {
    html += '<div style="display:flex;align-items:center;gap:8px;padding:7px 10px;background:var(--glass);border:1px solid var(--glassborder);border-radius:var(--rs);margin-bottom:4px">'
      + '<div style="flex:1;min-width:0">'
        + '<div style="font-size:12px;font-weight:600;color:var(--tx)">' + escHtml(p.name) + '</div>'
        + (p.id ? '<div style="font-size:10.5px;color:var(--t3);font-family:\'DM Mono\',monospace">ID: ' + escHtml(p.id) + '</div>' : '')
      + '</div>'
      + '<button class="ia edit" data-action="zpEditPortal" data-id="' + i + '" title="Edit">✏️</button>'
      + '<button class="ia del" data-action="zpDelPortal" data-id="' + i + '" title="Delete">🗑</button>'
      + '</div>';
  });
  wrap.innerHTML = html;
  const tb = $('zpPortalAddTopBtn');
  if (tb) tb.addEventListener('click', () => openZpPortalForm(-1));
}

function openZpPortalForm(idx) {
  _zpEditPortalIdx = idx;
  const form = $('zpPortalForm');
  if (!form) return;
  form.style.display = 'block';
  if (idx >= 0 && (G.settings.zpPortals || [])[idx]) {
    sv('zpPortalName', G.settings.zpPortals[idx].name);
    sv('zpPortalId', G.settings.zpPortals[idx].id || '');
  } else {
    sv('zpPortalName', '');
    sv('zpPortalId', '');
  }
}

async function saveZpPortal() {
  const name = gv('zpPortalName'), id = gv('zpPortalId');
  if (!name) { toast('Portal name is required', 'fail'); return; }
  if (!G.settings.zpPortals) G.settings.zpPortals = [];
  if (_zpEditPortalIdx >= 0) {
    G.settings.zpPortals[_zpEditPortalIdx] = { name, id };
  } else {
    G.settings.zpPortals.push({ name, id });
  }
  // Keep legacy field in sync with first portal
  G.settings.zohoPortal = G.settings.zpPortals[0]?.name || '';
  G.settings.zpPortalId = G.settings.zpPortals[0]?.id || '';
  await bg('SAVE_SETTINGS', { s: G.settings });
  _zpEditPortalIdx = -1;
  $('zpPortalForm').style.display = 'none';
  renderZpPortals();
  toast('Portal saved!', 'pass');
}

async function deleteZpPortal(idx) {
  if (!G.settings.zpPortals) return;
  G.settings.zpPortals.splice(idx, 1);
  G.settings.zohoPortal = G.settings.zpPortals[0]?.name || '';
  G.settings.zpPortalId = G.settings.zpPortals[0]?.id || '';
  await bg('SAVE_SETTINGS', { s: G.settings });
  renderZpPortals();
  toast('Portal removed', 'info');
}

// ── ZP Environments (multiple, URL only) ─────────────
let _zpEditEnvIdx = -1;

function renderZpEnvironments() {
  const envs = G.settings.zpEnvironments || [];
  const wrap = $('zpEnvList');
  if (!wrap) return;
  const form = $('zpEnvForm');

  if (!envs.length) {
    wrap.innerHTML = '<div style="text-align:center;padding:18px 0">'
      + '<div style="font-size:11px;color:var(--t3);margin-bottom:8px">No environments configured</div>'
      + '<button class="btn btn-dark btn-sm" id="zpEnvAddCenterBtn">+ Add Environment</button>'
      + '</div>';
    if (form) form.style.display = 'none';
    const cb = $('zpEnvAddCenterBtn');
    if (cb) cb.addEventListener('click', () => openZpEnvForm(-1));
    return;
  }

  let html = '<div style="display:flex;justify-content:flex-end;margin-bottom:6px">'
    + '<button class="btn btn-dark btn-xs" id="zpEnvAddTopBtn">+ Add</button></div>';
  envs.forEach((env, i) => {
    const label = typeof env === 'string' ? env : env.url;
    html += '<div style="display:flex;align-items:center;gap:8px;padding:7px 10px;background:var(--glass);border:1px solid var(--glassborder);border-radius:var(--rs);margin-bottom:4px">'
      + '<div style="flex:1;min-width:0">'
        + '<div style="font-size:11.5px;color:var(--tx);overflow:hidden;text-overflow:ellipsis;white-space:nowrap;font-family:\'DM Mono\',monospace">' + escHtml(label) + '</div>'
      + '</div>'
      + '<button class="ia edit" data-action="zpEditEnv" data-id="' + i + '" title="Edit">✏️</button>'
      + '<button class="ia del" data-action="zpDelEnv" data-id="' + i + '" title="Delete">🗑</button>'
      + '</div>';
  });
  wrap.innerHTML = html;
  const tb = $('zpEnvAddTopBtn');
  if (tb) tb.addEventListener('click', () => openZpEnvForm(-1));
}

function openZpEnvForm(idx) {
  _zpEditEnvIdx = idx;
  const form = $('zpEnvForm');
  if (!form) return;
  form.style.display = 'block';
  if (idx >= 0 && G.settings.zpEnvironments[idx]) {
    const env = G.settings.zpEnvironments[idx];
    sv('zpEnvUrl', typeof env === 'string' ? env : env.url);
  } else {
    sv('zpEnvUrl', '');
  }
}

async function saveZpEnvironment() {
  const url = gv('zpEnvUrl');
  if (!url) { toast('URL is required', 'fail'); return; }
  if (!G.settings.zpEnvironments) G.settings.zpEnvironments = [];
  if (_zpEditEnvIdx >= 0) {
    G.settings.zpEnvironments[_zpEditEnvIdx] = { url };
  } else {
    G.settings.zpEnvironments.push({ url });
  }
  await bg('SAVE_SETTINGS', { s: G.settings });
  _zpEditEnvIdx = -1;
  $('zpEnvForm').style.display = 'none';
  renderZpEnvironments();
  toast('Environment saved!', 'pass');
}

async function deleteZpEnvironment(idx) {
  if (!G.settings.zpEnvironments) return;
  G.settings.zpEnvironments.splice(idx, 1);
  await bg('SAVE_SETTINGS', { s: G.settings });
  renderZpEnvironments();
  toast('Environment removed', 'info');
}

// ── ZP Section Toggles ──────────────────────────────
function toggleZpSection(bodyId, arrowId) {
  const body = $(bodyId), arrow = $(arrowId);
  if (!body) return;
  const hidden = body.style.display === 'none';
  body.style.display = hidden ? '' : 'none';
  if (arrow) arrow.textContent = hidden ? '▼' : '▶';
}

function populateZohoRecSel() {
  const sel = $('zohoExpRec'), cur = sel.value;
  sel.innerHTML = '<option value="">— Select —</option>'
    + G.recordings.map(r =>
      '<option value="' + r.id + '">' + escHtml(r.name) + ' (' + (r.steps?.length || 0) + ' steps)</option>'
    ).join('');
  if (cur && G.recordings.find(r => r.id === cur)) sel.value = cur;
  $('zohoExportBtn').disabled = !sel.value;
  // Also load import projects
  loadZiProjects();
}

async function openZohoExportModal() {
  const recId = gv('zohoExpRec');
  if (!recId) { toast('Select a recording first', 'fail'); return; }
  const rec = G.recordings.find(r => r.id === recId);
  if (!rec) return;
  const { token, portal } = getZohoCreds();
  if (!token || !portal) { toast('Configure ZP connection first', 'fail'); return; }
  const dc = getZohoCreds().dc;

  // Pre-fill
  $('zeRecName').textContent = rec.name + ' (' + (rec.steps?.length || 0) + ' steps)';
  $('zeTaskName').value = rec.name;
  $('zeTaskDesc').value = 'Automated test: ' + rec.name + '\nSteps: ' + (rec.steps?.length || 0) + '\nURL: ' + (rec.startUrl || rec.steps?.[0]?.target || '—');
  $('zeProject').innerHTML = '<option value="">Loading…</option>';
  $('zeTasklist').innerHTML = '<option value="">Select a project first</option>';
  $('zeTasklist').disabled = true;
  $('zeStatus').style.display = 'none';
  $('doZohoExportBtn').disabled = false;
  openModal('zohoExportModal');

  // Load projects
  const r = await bg('ZOHO_PROJECTS', { token, portal, dc });
  if (r?.ok) {
    $('zeProject').innerHTML = '<option value="">— Select project —</option>'
      + (r.projects || []).map(p => '<option value="' + (p.id_string || p.id) + '">' + escHtml(p.name) + '</option>').join('');
  } else {
    $('zeProject').innerHTML = '<option value="">Failed to load projects</option>';
    toast('✗ ' + (r?.error || 'Could not load projects'), 'fail');
  }
}

async function onZeProjectChange() {
  const projectId = gv('zeProject');
  const tl = $('zeTasklist');
  if (!projectId) {
    tl.innerHTML = '<option value="">Select a project first</option>';
    tl.disabled = true;
    return;
  }
  tl.innerHTML = '<option value="">Loading…</option>';
  tl.disabled = true;
  const { token, portal, dc } = getZohoCreds();
  const r = await bg('ZOHO_TASKLISTS', { token, portal, dc, projectId });
  if (r?.ok) {
    tl.innerHTML = '<option value="">(No tasklist / default)</option>'
      + (r.tasklists || []).map(t => '<option value="' + (t.id_string || t.id) + '">' + escHtml(t.name) + '</option>').join('');
    tl.disabled = false;
  } else {
    tl.innerHTML = '<option value="">Failed to load</option>';
  }
}

async function doZohoExport() {
  const recId = gv('zohoExpRec');
  const rec = G.recordings.find(r => r.id === recId);
  if (!rec) return;
  const projectId  = gv('zeProject');
  const tasklistId = gv('zeTasklist');
  const taskName   = gv('zeTaskName') || rec.name;
  const taskDesc   = $('zeTaskDesc').value || '';
  if (!projectId) { toast('Select a project', 'fail'); return; }
  const { token, portal, dc } = getZohoCreds();

  const st = $('zeStatus');
  st.style.display = 'block';
  st.style.background = 'rgba(59,130,246,.1)';
  st.style.color = '#60a5fa';
  st.textContent = 'Exporting…';
  $('doZohoExportBtn').disabled = true;

  // Prepare attachments
  const attachSteps = $('zeAttachSteps').checked;
  const attachCode  = $('zeAttachCode').checked;
  let stepsJson = null, codeText = null, codeFilename = null;

  if (attachSteps) {
    stepsJson = JSON.stringify({ name: rec.name, steps: rec.steps, startUrl: rec.startUrl, network: rec.network }, null, 2);
  }
  if (attachCode) {
    const codeR = await bg('GEN_CODE', { rec, fw: G.settings.fw, lang: G.settings.lang });
    if (codeR?.code) {
      codeText = codeR.code;
      const ext = { javascript:'.js', typescript:'.ts', python:'.py', java:'.java', csharp:'.cs' }[G.settings.lang] || '.js';
      codeFilename = rec.name.replace(/[^a-zA-Z0-9]/g, '_').toLowerCase() + ext;
    }
  }

  const r = await bg('ZOHO_EXPORT', { token, portal, dc, projectId, tasklistId, taskName, taskDesc, stepsJson, codeText, codeFilename });
  if (r?.ok) {
    st.style.background = 'rgba(34,197,94,.1)';
    st.style.color = '#22c55e';
    let msg = '✓ Task created: ' + (r.taskName || taskName);
    if (r.attachments?.length) {
      const ok = r.attachments.filter(a => a.ok).length;
      const total = r.attachments.length;
      msg += ' · ' + ok + '/' + total + ' attachments';
      if (ok < total) {
        const fails = r.attachments.filter(a => !a.ok).map(a => a.name + ': ' + (a.err || '?'));
        msg += '\n' + fails.join('\n');
        st.style.background = 'rgba(234,179,8,.12)';
        st.style.color = '#ca8a04';
      }
    }
    st.textContent = msg;
    st.style.whiteSpace = 'pre-wrap';
    toast('📤 Exported to ZP!', 'pass');
  } else {
    st.style.background = 'rgba(239,68,68,.1)';
    st.style.color = '#ef4444';
    st.textContent = '✗ ' + (r?.error || 'Export failed');
    $('doZohoExportBtn').disabled = false;
  }
}

// ── ZP Import ──────────────────────────────────────
let _zohoTasks = [];
let _zohoSelectedTask = null;
let _zohoImportedSteps = null;

async function loadZiProjects() {
  const { token, portal, dc } = getZohoCreds();
  if (!token || !portal) return;
  const sel = $('ziProject');
  sel.innerHTML = '<option value="">Loading…</option>';
  const r = await bg('ZOHO_PROJECTS', { token, portal, dc });
  if (r?.ok) {
    sel.innerHTML = '<option value="">— Select project —</option>'
      + (r.projects || []).map(p => '<option value="' + (p.id_string || p.id) + '">' + escHtml(p.name) + '</option>').join('');
  } else {
    sel.innerHTML = '<option value="">Failed to load</option>';
  }
}

async function onZiProjectChange() {
  const projectId = gv('ziProject');
  const tl = $('ziTasklist');
  const tk = $('ziTask');
  tk.innerHTML = '<option value="">Select a tasklist/project first</option>';
  tk.disabled = true;
  $('zohoImportBtn').disabled = true;
  if (!projectId) {
    tl.innerHTML = '<option value="">Select a project first</option>';
    tl.disabled = true;
    return;
  }
  tl.innerHTML = '<option value="">Loading…</option>';
  tl.disabled = true;
  const { token, portal, dc } = getZohoCreds();

  // Load tasklists
  const r = await bg('ZOHO_TASKLISTS', { token, portal, dc, projectId });
  if (r?.ok) {
    tl.innerHTML = '<option value="_all">All tasks (no filter)</option>'
      + (r.tasklists || []).map(t => '<option value="' + (t.id_string || t.id) + '">' + escHtml(t.name) + '</option>').join('');
    tl.disabled = false;
  } else {
    tl.innerHTML = '<option value="">Failed to load</option>';
  }
  // Also load all tasks for this project
  await loadZiTasks(projectId, null);
}

async function onZiTasklistChange() {
  const projectId = gv('ziProject');
  const tasklistId = gv('ziTasklist');
  if (!projectId) return;
  await loadZiTasks(projectId, tasklistId === '_all' ? null : tasklistId);
}

async function loadZiTasks(projectId, tasklistId) {
  const tk = $('ziTask');
  tk.innerHTML = '<option value="">Loading tasks…</option>';
  tk.disabled = true;
  $('zohoImportBtn').disabled = true;
  const { token, portal, dc } = getZohoCreds();
  const r = await bg('ZOHO_TASKS', { token, portal, dc, projectId });
  if (r?.ok) {
    let tasks = r.tasks || [];
    // Filter by tasklist if specified
    if (tasklistId) {
      tasks = tasks.filter(t => {
        const tlId = t.tasklist?.id || t.tasklist?.id_string || t.tasklist_id;
        return tlId === tasklistId;
      });
    }
    _zohoTasks = tasks;
    if (!tasks.length) {
      tk.innerHTML = '<option value="">No tasks found</option>';
      return;
    }
    tk.innerHTML = '<option value="">— Select task —</option>'
      + tasks.map(t => {
        const badge = t.status?.name || 'Open';
        return '<option value="' + (t.id_string || t.id) + '">' + escHtml(t.name) + ' [' + badge + ']</option>';
      }).join('');
    tk.disabled = false;
  } else {
    tk.innerHTML = '<option value="">Failed to load</option>';
  }
}

async function openZohoImportModal() {
  const projectId = gv('ziProject');
  const taskId = gv('ziTask');
  if (!projectId || !taskId) { toast('Select a task first', 'fail'); return; }

  const { token, portal, dc } = getZohoCreds();
  _zohoSelectedTask = { projectId, taskId };
  _zohoImportedSteps = null;

  $('ziTitle').textContent = 'Loading…';
  $('ziDetail').innerHTML = '<div style="text-align:center;padding:20px;color:var(--t3)">Loading task details…</div>';
  $('ziAttachInfo').innerHTML = '';
  $('ziImportStatus').style.display = 'none';
  $('ziRunBtn').disabled = true;
  $('ziImportBtn').disabled = true;
  openModal('zohoImportModal');

  // Load task detail
  const r = await bg('ZOHO_TASK_DETAIL', { token, portal, dc, projectId, taskId });
  if (!r?.ok) {
    $('ziTitle').textContent = 'Error';
    $('ziDetail').innerHTML = '<div style="color:#ef4444">' + escHtml(r?.error || 'Failed') + '</div>';
    return;
  }

  const task = r.task;
  _zohoSelectedTask.task = task;
  $('ziTitle').textContent = task.name || 'Task';
  $('ziDetail').innerHTML = '<table style="width:100%;font-size:11.5px;border-collapse:collapse">'
    + '<tr><td style="color:var(--t3);padding:4px 8px 4px 0;white-space:nowrap">Status</td><td style="color:var(--t1)">' + escHtml(task.status?.name || 'Open') + '</td></tr>'
    + '<tr><td style="color:var(--t3);padding:4px 8px 4px 0">Priority</td><td style="color:var(--t1)">' + escHtml(task.priority || '—') + '</td></tr>'
    + '<tr><td style="color:var(--t3);padding:4px 8px 4px 0">Progress</td><td style="color:var(--t1)">' + (task.percent_complete || 0) + '%</td></tr>'
    + (task.description ? '<tr><td style="color:var(--t3);padding:4px 8px 4px 0;vertical-align:top">Desc</td><td style="color:var(--t1);word-break:break-word">' + escHtml(task.description).replace(/&lt;br\/?&gt;/g, '<br>').replace(/\n/g, '<br>') + '</td></tr>' : '')
    + '</table>';

  // Load attachments
  $('ziAttachInfo').innerHTML = '<span style="color:var(--t3)">📎 Checking attachments…</span>';
  const ar = await bg('ZOHO_ATTACHMENTS', { token, portal, dc, projectId, taskId });
  const attachments = ar?.attachments || [];
  // Search for steps JSON across common field names (may have timestamp in name)
  const stepsAttach = attachments.find(a => {
    const fn = (a.filename || a.name || a.file_name || a.display_name || '').toLowerCase();
    return fn.endsWith('.json');
  });

  if (ar && !ar.ok && ar.error) {
    $('ziAttachInfo').innerHTML = '<span style="color:#ef4444">📎 Attachment check failed: ' + escHtml(ar.error) + '</span>';
  } else if (stepsAttach) {
    const stepsName = stepsAttach.filename || stepsAttach.name || stepsAttach.file_name || stepsAttach.display_name || 'steps.json';
    $('ziAttachInfo').innerHTML = '<span style="color:#22c55e">📎 ' + escHtml(stepsName) + ' found — will be imported with test steps</span>';
    _zohoSelectedTask.stepsAttachId = stepsAttach.attachment_id || stepsAttach.id || stepsAttach.id_string;
    _zohoSelectedTask.stepsDownloadUrl = stepsAttach.download_url || stepsAttach.content_url || '';
    _zohoSelectedTask.stepsFileId = stepsAttach.third_party_file_id || '';
  } else if (attachments.length) {
    const names = attachments.map(a => a.filename || a.name || a.file_name || a.display_name || '?').join(', ');
    $('ziAttachInfo').innerHTML = '<span style="color:#f59e0b">📎 ' + attachments.length + ' attachment(s) found (' + escHtml(names) + ') but no .json file</span>';
  } else {
    $('ziAttachInfo').innerHTML = '<span style="color:var(--t3)">📎 No attachments — task will import without steps</span>';
  }

  $('ziRunBtn').disabled = false;
  $('ziImportBtn').disabled = false;
}

async function fetchStepsFromAttachment() {
  const { token, portal, dc } = getZohoCreds();
  const { projectId, taskId, stepsAttachId, stepsDownloadUrl, stepsFileId } = _zohoSelectedTask || {};

  // Try 1: Download via documents API or attachment file directly
  if (stepsAttachId) {
    console.log('[ZOHO] Trying attachment download:', stepsAttachId, 'fileId:', stepsFileId);
    const r = await bg('ZOHO_DOWNLOAD_ATTACH', { token, portal, dc, projectId, taskId, attachId: stepsAttachId, downloadUrl: stepsDownloadUrl, fileId: stepsFileId });
    console.log('[ZOHO] Attachment download result:', JSON.stringify(r).slice(0, 300));
    if (r?.ok) {
      if (r.data && r.data.steps) return r.data;
      if (r.raw) { try { const p = JSON.parse(r.raw); if (p.steps) return p; } catch(e) {} }
    }
  }

  // Try 2: Read steps from task comment (reliable fallback)
  if (projectId && taskId) {
    console.log('[ZOHO] Trying comments fallback');
    const cr = await bg('ZOHO_TASK_COMMENTS', { token, portal, dc, projectId, taskId });
    console.log('[ZOHO] Comments result:', JSON.stringify(cr).slice(0, 300));
    if (cr?.ok && cr.stepsData) return cr.stepsData;
  }

  return null;
}

async function importZohoTask() {
  if (!_zohoSelectedTask?.task) return;
  const task = _zohoSelectedTask.task;
  const st = $('ziImportStatus');

  st.style.display = 'block';
  st.style.background = 'rgba(59,130,246,.1)';
  st.style.color = '#60a5fa';
  st.textContent = 'Importing…';
  $('ziImportBtn').disabled = true;

  // Download steps (from attachment or comment)
  let stepsData = null;
  st.textContent = 'Downloading steps…';
  stepsData = await fetchStepsFromAttachment();

  const rec = {
    id: uid(),
    name: '[ZP] ' + (task.name || 'Imported'),
    steps: stepsData?.steps || [],
    network: stepsData?.network || [],
    startUrl: stepsData?.startUrl || '',
    at: new Date().toISOString(),
    zohoTaskId: task.id_string || task.id,
    zohoProjectId: _zohoSelectedTask.projectId
  };

  G.recordings.push(rec);
  await bg('SAVE_REC', { rec });

  const stepCount = rec.steps.length;
  st.style.background = 'rgba(34,197,94,.1)';
  st.style.color = '#22c55e';
  st.textContent = '✓ Imported with ' + stepCount + ' step(s)' + (stepCount ? '' : ' — no .json found');

  toast('📥 Imported: ' + rec.name + ' (' + stepCount + ' steps)', 'pass');
  setTimeout(() => { closeModal('zohoImportModal'); showPg('library'); }, 1200);
}

async function runZohoTask() {
  if (!_zohoSelectedTask?.task) return;
  const task = _zohoSelectedTask.task;
  const st = $('ziImportStatus');

  // Check if we already have this task imported with steps
  let rec = G.recordings.find(r => r.zohoTaskId === (task.id_string || task.id) && r.steps?.length > 0);

  if (!rec) {
    // Need to import first
    st.style.display = 'block';
    st.style.background = 'rgba(59,130,246,.1)';
    st.style.color = '#60a5fa';
    st.textContent = 'Downloading steps…';

    let stepsData = await fetchStepsFromAttachment();

    if (!stepsData?.steps?.length) {
      st.style.background = 'rgba(239,68,68,.1)';
      st.style.color = '#ef4444';
      st.textContent = '✗ No steps found on this task — cannot run';
      toast('No steps found — export a recording with steps first', 'fail');
      return;
    }

    rec = {
      id: uid(),
      name: '[ZP] ' + (task.name || 'Test'),
      steps: stepsData.steps,
      network: stepsData.network || [],
      startUrl: stepsData.startUrl || '',
      at: new Date().toISOString(),
      zohoTaskId: task.id_string || task.id,
      zohoProjectId: _zohoSelectedTask.projectId
    };
    G.recordings.push(rec);
    await bg('SAVE_REC', { rec });
  }

  st.style.display = 'block';
  st.style.background = 'rgba(59,130,246,.1)';
  st.style.color = '#60a5fa';
  st.textContent = 'Running ' + rec.steps.length + ' steps…';

  closeModal('zohoImportModal');
  setTimeout(() => window.close(), 300);
  // Run via background using RUN_CASE
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
  const result = await bg('RUN_CASE', { c: fakeCase });
  if (result) {
    const run = {
      id: uid(),
      recId: rec.id,
      recName: rec.name,
      ts: Date.now(),
      ...result
    };
    G.results.unshift(run);
    await bg('SAVE_RESULTS', { results: G.results });

    // Upload report back to ZP
    const { token, portal, dc } = getZohoCreds();
    if (token && portal && _zohoSelectedTask.projectId) {
      try {
        const reportText = '== Test Report ==\n'
          + 'Recording: ' + rec.name + '\n'
          + 'Status: ' + (result.pass ? 'PASSED ✓' : 'FAILED ✗') + '\n'
          + 'Steps: ' + (result.stepsRun || 0) + '/' + (rec.steps?.length || 0) + '\n'
          + 'Duration: ' + dur(result.duration || 0) + '\n'
          + 'Time: ' + new Date().toISOString() + '\n'
          + (result.error ? 'Error: ' + result.error + '\n' : '');

        await bg('ZOHO_EXPORT', {
          token, portal, dc,
          projectId: _zohoSelectedTask.projectId,
          tasklistId: '',
          taskName: '',
          taskDesc: '',
          stepsJson: null,
          codeText: reportText,
          codeFilename: 'test_report_' + Date.now() + '.txt',
          _existingTaskId: task.id_string || task.id
        });
      } catch(e) { /* best effort */ }
    }

    openModal('runModal');
    $('runMTitle').textContent = result.pass ? '✅ Test Passed' : '❌ Test Failed';
    $('runMBody').innerHTML = '<div style="font-size:12px">'
      + '<div><strong>Recording:</strong> ' + escHtml(rec.name) + '</div>'
      + '<div><strong>Status:</strong> ' + (result.pass ? '<span style="color:#22c55e">PASSED</span>' : '<span style="color:#ef4444">FAILED</span>') + '</div>'
      + '<div><strong>Steps:</strong> ' + (result.stepsRun || 0) + '/' + (rec.steps?.length || 0) + '</div>'
      + '<div><strong>Duration:</strong> ' + dur(result.duration || 0) + '</div>'
      + (result.error ? '<div style="color:#ef4444;margin-top:8px"><strong>Error:</strong> ' + escHtml(result.error) + '</div>' : '')
      + '</div>';
    toast(result.pass ? '✅ Test passed!' : '❌ Test failed', result.pass ? 'pass' : 'fail');
  }
}

boot();
