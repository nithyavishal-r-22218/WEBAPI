// ── Keep service worker alive ──────────────────────
// MV3 service workers sleep after 30s of inactivity; alarm-based keepalive
const _keepAlive = () => chrome.runtime.getPlatformInfo(() => {});

// ── Alarm-based keepalive (MV3 best practice) ──
chrome.alarms.create('keepAlive', { periodInMinutes: 0.4 });
chrome.alarms.onAlarm.addListener((alarm) => {
  if (alarm.name === 'keepAlive') _keepAlive();
});


// ═══════════════════════════════════════════════════
//  WebAPI Automation Tool v2 — Background
// ═══════════════════════════════════════════════════

let REC = { active:false, tabId:null, steps:[], network:[], t0:null };

// ── Install ──────────────────────────────────────
chrome.runtime.onInstalled.addListener(async () => {
  const d = await chrome.storage.local.get(['recordings','cases','settings']);
  if (!d.recordings) await chrome.storage.local.set({ recordings:[], cases:[], runResults:[] });
  if (!d.settings)   await chrome.storage.local.set({ settings:{ url:'', key:'', fw:'playwright', lang:'javascript', theme:'light', randomEmailDomain:'@test.com', randomPhonePrefix:'+1-555-' } });
});

// ── Messages ────────────────────────────────────
chrome.runtime.onMessage.addListener((msg, sender, reply) => {
  (async () => {
    switch(msg.type) {
      // Recording
      case 'REC_START': await startRec(msg.tabId); reply({ok:true}); break;
      case 'REC_STOP':  { const r = await stopRec(); reply({ok:true,rec:r}); break; }
      case 'REC_STATE': reply({...REC}); break;
      case 'REC_STEP':  addStep(msg.step); reply({ok:true}); break;
      case 'REC_INSERT_BEFORE_LAST': insertStepBeforeLast(msg.step); reply({ok:true}); break;
      case 'REC_NET':   addNet(msg.net); reply({ok:true}); break;
      case 'REC_DEL_STEP': delStep(msg.idx); reply({ok:true}); break;

      // Inspect
      case 'START_INSPECT': {
        const tabs = await chrome.tabs.query({active:true, currentWindow:true});
        if (tabs[0]) {
          // Always inject into all frames (including dynamic iframes) first
          try { await chrome.scripting.executeScript({target:{tabId:tabs[0].id, allFrames:true}, files:['recorder.js']}); } catch(e) {}
          // Small delay for iframes to initialize, then send to all frames
          setTimeout(() => {
            chrome.tabs.sendMessage(tabs[0].id, {type:'START_INSPECT'}).catch(()=>{});
          }, 100);
        }
        reply({ok:true});
        break;
      }
      case 'STOP_INSPECT': {
        const tabs = await chrome.tabs.query({active:true, currentWindow:true});
        if (tabs[0]) {
          try { await chrome.scripting.executeScript({target:{tabId:tabs[0].id, allFrames:true}, files:['recorder.js']}); } catch(e) {}
          chrome.tabs.sendMessage(tabs[0].id, {type:'STOP_INSPECT'}).catch(()=>{});
        }
        reply({ok:true});
        break;
      }
      case 'LOCATOR_SELECTED': {
        broadcast({type:'LOCATOR_SELECTED', locator: msg.locator, sleep: msg.locator?.sleep || 0});
        reply({ok:true});
        break;
      }
      case 'OPEN_POPUP': {
        chrome.action.openPopup().catch(()=>{});
        reply({ok:true});
        break;
      }

      // Storage
      case 'GET_RECS':    { const d=await chrome.storage.local.get('recordings'); reply(d.recordings||[]); break; }
      case 'SAVE_REC':    await saveRec(msg.rec); reply({ok:true}); break;
      case 'DEL_REC':     await delRec(msg.id);   reply({ok:true}); break;
      case 'GET_CASES':   { const d=await chrome.storage.local.get('cases'); reply(d.cases||[]); break; }
      case 'SAVE_CASE':   await saveCase(msg.c);  reply({ok:true}); break;
      case 'DEL_CASE':    await delCase(msg.id);  reply({ok:true}); break;
      case 'GET_RESULTS': { const d=await chrome.storage.local.get('runResults'); reply(d.runResults||[]); break; }
      case 'SAVE_RESULT': await saveResult(msg.r); reply({ok:true}); break;
      case 'GET_SETTINGS':{ const d=await chrome.storage.local.get('settings'); reply(d.settings||{}); break; }
      case 'SAVE_SETTINGS': await chrome.storage.local.set({settings:msg.s}); reply({ok:true}); break;

      // Actions
      case 'GEN_CODE':   reply({ code: genCode(msg.rec, msg.fw, msg.lang) }); break;
      case 'RUN_CASE':   { const r = await runCase(msg.c); reply(r); break; }
      case 'PUSH_PLATFORM': { const r = await pushPlatform(msg.data); reply(r); break; }
      case 'HEALTH_CHECK':  { const r = await healthCheck(msg.url,msg.key); reply(r); break; }
      case 'SCROLL_DETECTED': {
        if (REC.active && REC.tabId) {
          chrome.tabs.sendMessage(REC.tabId, {type:'SCROLL_DETECTED'}).catch(()=>{});
        }
        reply({ok:true});
        break;
      }

      // Zoho Projects
      case 'ZOHO_TEST':       { const r = await zohoTest(msg.token, msg.portal, msg.dc); reply(r); break; }
      case 'ZOHO_PROJECTS':   { const r = await zohoGetProjects(msg.token, msg.portal, msg.dc); reply(r); break; }
      case 'ZOHO_TASKLISTS':  { const r = await zohoGetTasklists(msg.token, msg.portal, msg.projectId, msg.dc); reply(r); break; }
      case 'ZOHO_EXPORT':     { const r = await zohoExportTask(msg); reply(r); break; }
      case 'ZOHO_TASKS':      { const r = await zohoGetTasks(msg.token, msg.portal, msg.projectId, msg.dc); reply(r); break; }
      case 'ZOHO_TASK_DETAIL':{ const r = await zohoGetTaskDetail(msg.token, msg.portal, msg.projectId, msg.taskId, msg.dc); reply(r); break; }
      case 'ZOHO_ALL_TASKS':  { const r = await zohoGetAllTasks(msg.token, msg.portal, msg.dc); reply(r); break; }
      case 'ZOHO_ATTACHMENTS':{ const r = await zohoGetAttachments(msg.token, msg.portal, msg.projectId, msg.taskId, msg.dc); reply(r); break; }
      case 'ZOHO_DOWNLOAD_ATTACH':{ const r = await zohoDownloadAttachment(msg.token, msg.portal, msg.projectId, msg.taskId, msg.attachId, msg.dc, msg.downloadUrl, msg.fileId); reply(r); break; }
      case 'ZOHO_TASK_COMMENTS':{ const r = await zohoGetTaskComments(msg.token, msg.portal, msg.projectId, msg.taskId, msg.dc); reply(r); break; }
      case 'ZOHO_SEARCH_PROJECT':{ const r = await zohoSearchProject(msg.token, msg.portal, msg.dc, msg.projectName); reply(r); break; }
      case 'ZOHO_CREATE_PROJECT':{ const r = await zohoCreateProject(msg.token, msg.portal, msg.dc, msg.projectName, msg.description); reply(r); break; }
      case 'SMART_RUN':   { const r = await smartReplay(msg.c); reply(r); break; }
      case 'SEED_FLOWS':  { const r = await seedSampleFlows(); reply(r); break; }

      default: reply({ok:false,err:'unknown:'+msg.type});
    }
  })();
  return true; // keep channel open
});

// ── Tab close cleanup ────────────────────────────
chrome.tabs.onRemoved.addListener(id => { if(REC.active && REC.tabId===id) stopRec(); });

// ── Re-inject into all frames on tab updates (catches dynamic iframes) ───
chrome.tabs.onUpdated.addListener((tabId, changeInfo) => {
  if (REC.active && REC.tabId === tabId && changeInfo.status === 'complete') {
    chrome.scripting.executeScript({ target:{tabId, allFrames:true}, func:injectRecorder }).catch(()=>{});
  }
});

// ── Inject into dynamically created sub-frames (iframes) ─────────────────
chrome.webNavigation.onCompleted.addListener((details) => {
  if (details.frameId === 0) return; // skip main frame
  if (REC.active && REC.tabId === details.tabId) {
    // Inject recorder into new sub-frame
    chrome.scripting.executeScript({
      target: { tabId: details.tabId, frameIds: [details.frameId] },
      func: injectRecorder
    }).catch(()=>{});
    // Also inject content script for inspector
    chrome.scripting.executeScript({
      target: { tabId: details.tabId, frameIds: [details.frameId] },
      files: ['recorder.js']
    }).catch(()=>{});
  }
});

// ══════════════════════════════════════════════════
//  RECORDING
// ══════════════════════════════════════════════════
async function startRec(tabId) {
  REC = { active:true, tabId, steps:[], network:[], t0:Date.now() };
  await chrome.scripting.executeScript({ target:{tabId, allFrames:true}, func:injectRecorder });
  badge('●', '#dc2626', tabId);
  broadcast({ type:'REC_STARTED' });
}

async function stopRec() {
  if (!REC.active) return null;
  const rec = {
    id: 'r'+Date.now(),
    name: 'UI Flow '+new Date().toLocaleTimeString('en',{hour:'2-digit',minute:'2-digit'}),
    steps: [...REC.steps],
    network: [...REC.network],
    startUrl: REC.steps[0]?.url || '',
    ms: Date.now() - REC.t0,
    at: new Date().toISOString(),
    // Zoho Projects context — stored for smart replay
    _portal: zpExtractPortal(REC.steps[0]?.url || ''),
    _projectId: zpExtractProjectId(REC.steps[0]?.url || '')
  };
  if (REC.tabId) {
    badge('', '#2563eb', REC.tabId);
    // Stop inspect mode and clean up
    chrome.tabs.sendMessage(REC.tabId, {type:'STOP_INSPECT'}).catch(()=>{});
    chrome.tabs.sendMessage(REC.tabId, {type:'REC_STOPPED'}).catch(()=>{});
  }
  REC = { active:false, tabId:null, steps:[], network:[], t0:null };
  // Always persist the recording so steps are never lost
  await saveRec(rec);
  // Store as last stopped recording for popup to restore
  await chrome.storage.local.set({ lastStoppedRec: rec });
  broadcast({ type:'REC_STOPPED', rec });
  return rec;
}

function addStep(step) {
  // Consecutive duplicate check: skip if previous step has same action + target
  const prev = REC.steps[REC.steps.length - 1];
  if (prev && step.action === prev.action && step.target === prev.target
      && step.action !== 'NAVIGATE_TO' && step.action !== 'SEND_KEYS') {
    return;
  }
  step.idx = REC.steps.length;
  REC.steps.push(step);
  broadcast({ type:'STEP', step, total:REC.steps.length });
}

// Insert a step before the last step (used for scroll_to before click)
function insertStepBeforeLast(step) {
  if (REC.steps.length === 0) {
    addStep(step);
    return;
  }
  // Insert before the last step
  const insertIdx = REC.steps.length - 1;
  REC.steps.splice(insertIdx, 0, step);
  // Re-index all steps
  REC.steps.forEach((s, i) => s.idx = i);
  broadcast({ type:'STEPS_UPDATED', steps:REC.steps, total:REC.steps.length });
}

function addNet(net) {
  REC.network.push(net);
  broadcast({ type:'NET', net, total:REC.network.length });
}

function delStep(idx) {
  REC.steps.splice(idx,1);
  REC.steps.forEach((s,i)=>s.idx=i);
}

function badge(text, color, tabId) {
  try {
    if(tabId) {
      chrome.action.setBadgeText({text, tabId});
      chrome.action.setBadgeBackgroundColor({color, tabId});
    }
  } catch{}
}

function broadcast(msg) {
  chrome.runtime.sendMessage(msg).catch(()=>{});
}

// ══════════════════════════════════════════════════
//  PAGE RECORDER  (injected into tab)
// ══════════════════════════════════════════════════
function injectRecorder() {
  if (window.__WEBAPI_REC__) return;
  window.__WEBAPI_REC__ = true;
  let seq = 0;
  let lastActionKey = '';   // for dedup
  let lastRecordTime = 0;  // timestamp dedup
  let lastClickTime = 0;   // track last CLICK to tag auto-navigations
  const recentlySentInputs = new WeakMap(); // el → timestamp, prevents double SEND_KEYS after random popup

  // ── ZPQA-first XPath selector builder ────────────────────────────────────────
  // Deep zpqa search: self → ancestors → descendants → siblings' descendants
  function _findZpqa(el) {
    if (!el || !el.getAttribute) return null;
    // 1. Self
    if (el.getAttribute('data-zpqa')) return el;
    // 2. Ancestors (closest)
    const ancestor = el.closest('[data-zpqa]');
    if (ancestor) return ancestor;
    // 3. Descendants (deep search, not just first child)
    const desc = el.querySelector('[data-zpqa]');
    if (desc) return desc;
    // 4. Parent's children (siblings) that contain zpqa
    if (el.parentElement) {
      const sibling = el.parentElement.querySelector('[data-zpqa]');
      if (sibling) return sibling;
      // 5. Grandparent's descendants
      if (el.parentElement.parentElement) {
        const gp = el.parentElement.parentElement.querySelector('[data-zpqa]');
        if (gp) return gp;
      }
    }
    return null;
  }

  function sel(el, shallow) {
    if (!el) return '//body';
    const tag = el.tagName ? el.tagName.toLowerCase() : '*';
    if (el === document.body) {
      if (el.getAttribute('contenteditable') === 'true') {
        const aria = el.getAttribute('aria-label');
        if (aria) return `//body[@aria-label='${aria}']`;
        return `//body[@contenteditable='true']`;
      }
      return '//body';
    }
    // Handle contenteditable elements
    if (el.getAttribute && el.getAttribute('contenteditable') === 'true') {
      const aria = el.getAttribute('aria-label');
      if (aria) return `//${tag}[@aria-label='${aria}']`;
      const role = el.getAttribute('role');
      if (role) return `//${tag}[@role='${role}' and @contenteditable='true']`;
    }
    // Priority 1: ZPQA locator — shallow: self-only (for hover recording, avoids sibling zpqa); deep: full search
    const zpqaEl = shallow
      ? (el.getAttribute && el.getAttribute('data-zpqa') ? el : null)
      : _findZpqa(el);
    if (zpqaEl) {
      const zpqa = zpqaEl.getAttribute('data-zpqa');
      const ztag = zpqaEl.tagName ? zpqaEl.tagName.toLowerCase() : '*';
      return `//${ztag}[@data-zpqa='${zpqa}']`;
    }
    // Priority 2: test IDs
    const tid = el.dataset?.testid || el.getAttribute('data-testid') || el.getAttribute('data-test') || el.getAttribute('data-cy') || el.getAttribute('data-qa');
    if (tid) return `//${tag}[@data-testid='${tid}']`;
    // Priority 3: name attribute (form fields)
    const name = el.getAttribute('name');
    if (name) return `//${tag}[@name='${name}']`;
    // Priority 4: aria-label (skip trivial "true"/"false" values)
    const aria = el.getAttribute('aria-label');
    if (aria && aria !== 'true' && aria !== 'false') return `//${tag}[@aria-label='${aria}']`;
    // Priority 5: placeholder (form fields)
    const ph = el.getAttribute('placeholder');
    if (ph) return `//${tag}[@placeholder='${ph}']`;
    // Priority 6: label association (for attribute → input ID)
    if (el.id) {
      const label = document.querySelector('label[for="' + el.id + '"]');
      if (label) {
        const labelText = (label.textContent || '').trim().slice(0, 40);
        if (labelText) return `//${tag}[@id='${el.id}']`;
      }
    }
    // Priority 7: data-tooltip
    const tooltip = el.getAttribute('data-tooltip');
    if (tooltip && tooltip !== 'true' && tooltip !== 'false') return `//${tag}[@data-tooltip='${tooltip}']`;
    // Priority 8: role + aria-label or role + data-tooltip
    const role = el.getAttribute('role');
    if (role && aria && aria !== 'true') return `//${tag}[@role='${role}' and @aria-label='${aria}']`;
    if (role && tooltip && tooltip !== 'true') return `//${tag}[@role='${role}' and @data-tooltip='${tooltip}']`;
    // Priority 9: role + text
    const txt = (el.innerText || '').trim().slice(0, 30);
    if (role && txt) return `//${tag}[@role='${role}' and contains(text(),'${txt.replace(/'/g, "\\'")}')]`;
    // Priority 10: id
    if (el.id) return `//${tag}[@id='${el.id}']`;
    // Priority 11: title attribute
    const title = el.getAttribute('title');
    if (title) return `//${tag}[@title='${title}']`;
    // Priority 12: stable classes
    const cls = Array.from(el.classList || [])
      .filter(c => !/^(hover|focus|active|is-|ng-|v-|css-)/.test(c))
      .slice(0, 2);
    if (cls.length) return `//${tag}[contains(@class,'${cls[0]}')]`;
    return `//${tag}`;
  }

  function snap(el) {
    try { const r = el.getBoundingClientRect(); return { x:Math.round(r.x), y:Math.round(r.y), w:Math.round(r.width), h:Math.round(r.height) }; }
    catch { return null; }
  }

  function updCnt(n) {
    const e = document.getElementById('__wb_cnt');
    if (e) e.textContent = n;
  }

  function send(step) {
    // Skip steps with empty/generic locators (e.g. //span, //div, //button)
    const noTargetActions = ['NAVIGATE_TO','REFRESH','BACK','FORWARD','CLOSE','QUIT','GET_CURRENT_URL','GET_TITLE','GET_PAGE_SOURCE'];
    if (!noTargetActions.includes(step.action)) {
      const t = (step.target || '').trim();
      if (!t) { console.log('[WebAPI-REC] DROPPED: empty target', step.action); return; }
      if (/^\/\/[a-z]+(\[\d+\])?$/.test(t)) { console.log('[WebAPI-REC] DROPPED: generic locator', t, step.action); return; }
    }
    // Dedup: skip if same action+target+value as the very last step
    const key = step.action + '|' + step.target + '|' + (step.value || '');
    if (key === lastActionKey && step.action !== 'NAVIGATE_TO') { console.log('[WebAPI-REC] DROPPED: dedup key', step.action, step.target); return; }
    // Timestamp dedup: skip if same action recorded within 300ms
    const now = Date.now();
    if (now - lastRecordTime < 300 && step.action !== 'NAVIGATE_TO' && step.action !== 'SEND_KEYS') { console.log('[WebAPI-REC] DROPPED: timestamp dedup', step.action, step.target, now - lastRecordTime + 'ms'); return; }
    lastRecordTime = now;
    lastActionKey = key;
    step.id = ++seq;

    // ── Normalize URLs: replace environment-specific values with dynamic placeholders ──
    // This makes recordings portable across environments, portals, and projects.
    const _curOrigin = location.origin;
    const _curHref = location.href;
    // Extract portal name from current URL: /portal/{portalName}
    const _portalMatch = _curHref.match(/\/portal\/([^\/\#\?]+)/);
    const _curPortal = _portalMatch ? _portalMatch[1] : null;
    // Extract project ID from URL hash: #allprojects/ID, #zp/projects/ID, #project/ID, etc.
    const _projIdMatch = _curHref.match(/#(?:allprojects|project|zp\/projects|kanban|gantt)\/(\d{10,})/);
    const _curProjectId = _projIdMatch ? _projIdMatch[1] : null;

    function _normalizeUrl(u) {
      if (!u) return u;
      // 1. Replace origin
      if (_curOrigin && u.startsWith(_curOrigin)) u = '{{baseUrl}}' + u.slice(_curOrigin.length);
      // 2. Replace portal name
      if (_curPortal) u = u.replace(new RegExp('/portal/' + _curPortal.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), 'g'), '/portal/{{portal}}');
      // 3. Replace project IDs (Zoho long numeric IDs: 15+ digits after known hash paths)
      if (_curProjectId) u = u.replace(new RegExp('(#(?:allprojects|project|zp/projects|kanban|gantt)/)' + _curProjectId, 'g'), '$1{{projectId}}');
      // 4. Replace any remaining Zoho long IDs in hash (task IDs, view IDs, etc.)
      // Process the hash portion to replace all long numeric IDs not already handled
      const hashIdx = u.indexOf('#');
      if (hashIdx >= 0) {
        const beforeHash = u.slice(0, hashIdx);
        let hashPart = u.slice(hashIdx);
        hashPart = hashPart.replace(/\/(\d{10,})/g, function(match, id) {
          // Skip if already replaced as {{projectId}}
          if (u.includes('{{projectId}}') && id === _curProjectId) return match;
          return '/{{zpId:' + id + '}}';
        });
        u = beforeHash + hashPart;
      }
      return u;
    }

    if (step.url) step.url = _normalizeUrl(step.url);
    if (step.target && step.action === 'NAVIGATE_TO') step.target = _normalizeUrl(step.target);

    // Track CLICK timestamps for auto-navigation detection
    if (step.action === 'CLICK' || step.action === 'DOUBLE_CLICK' || step.action === 'RIGHT_CLICK') {
      lastClickTime = Date.now();
    }
    // Tag NAVIGATE_TO steps caused by a preceding CLICK (SPA navigation via pushState/replaceState)
    // These are auto-triggered by the click and should be skipped during replay (let the click navigate naturally)
    if (step.action === 'NAVIGATE_TO' && lastClickTime && (Date.now() - lastClickTime < 1500)) {
      step.autoNav = true;
    }

    // Flag steps from iframes so replay knows to target the right frame
    if (window !== window.top) {
      step.iframe = true;
      // Try to find the iframe's selector from the parent for context
      try {
        const frames = window.parent.document.querySelectorAll('iframe');
        for (const f of frames) {
          if (f.contentWindow === window) {
            const iid = f.id || f.name || f.getAttribute('aria-label') || '';
            const icls = Array.from(f.classList || []).filter(c => !/^(hover|focus|active)/.test(c)).slice(0, 2);
            if (f.id) step.iframeSelector = '#' + CSS.escape(f.id);
            else if (f.name) step.iframeSelector = 'iframe[name="' + f.name + '"]';
            else if (icls.length) step.iframeSelector = 'iframe.' + icls.join('.');
            else step.iframeSelector = 'iframe';
            break;
          }
        }
      } catch(e) { /* cross-origin, can't access parent */ }
    }
    chrome.runtime.sendMessage({ type:'REC_STEP', step }).catch(() => {});
    updCnt(seq);
  }

  // ── Compact floating pill (only in top frame) ──────────────────────────────
  const PILL_ID = '__webapi_pill';
  const isTopFrame = (window === window.top);
  if (isTopFrame && document.getElementById(PILL_ID)) return;

  if (!isTopFrame) {
    // In iframes: skip pill UI, only attach event listeners for recording
  } else {

  const pill = document.createElement('div');
  pill.id = PILL_ID;
  pill.innerHTML = `
    <style>
      @keyframes __wb_blink{0%,100%{opacity:1}50%{opacity:.2}}
      #${PILL_ID}{position:fixed;top:12px;right:12px;z-index:2147483647;
        display:flex;align-items:center;gap:6px;
        background:linear-gradient(135deg,#0f172a,#1e3a5f);
        border:1px solid rgba(255,255,255,.15);border-radius:20px;
        padding:5px 10px;font:600 11px/1 -apple-system,system-ui,sans-serif;
        color:#fff;box-shadow:0 4px 20px rgba(0,0,0,.45);
        cursor:move;user-select:none}
      #${PILL_ID} .wb-dot{width:7px;height:7px;border-radius:50%;background:#dc2626;
        animation:__wb_blink 1s infinite;flex-shrink:0}
      #${PILL_ID} .wb-cnt{color:#9ca3af;font-weight:400;font-size:10px;min-width:28px}
      #${PILL_ID} button{border:none;border-radius:5px;padding:3px 7px;
        font:700 10px -apple-system,sans-serif;cursor:pointer;flex-shrink:0;
        transition:background .12s}
      #${PILL_ID} .wb-stop{background:#dc2626;color:#fff}
      #${PILL_ID} .wb-stop:hover{background:#b91c1c}
      #${PILL_ID} .wb-insp{background:rgba(37,99,235,.8);color:#fff}
      #${PILL_ID} .wb-insp:hover{background:#2563eb}
      #${PILL_ID} .wb-insp.on{background:#16a34a}
      #${PILL_ID} .wb-max{background:rgba(255,255,255,.12);color:#fff}
      #${PILL_ID} .wb-max:hover{background:rgba(255,255,255,.25)}
    </style>
    <span class="wb-dot"></span>
    <span class="wb-cnt" id="__wb_cnt">0</span>
    <button class="wb-stop" id="__wb_stop" title="Stop recording">■</button>
    <button class="wb-insp" id="__wb_insp" title="Toggle inspector">🎯</button>
    <button class="wb-max" id="__wb_max" title="Open popup">⬡</button>`;
  document.body.appendChild(pill);

  // ── Stop button ───────────────────────────────────────────────────
  document.getElementById('__wb_stop').addEventListener('click', e => {
    e.stopPropagation();
    // Directly stop inspector before sending REC_STOP (same execution context, no message needed)
    if (window.__WEBAPI_API && window.__WEBAPI_API.stopInspect) {
      window.__WEBAPI_API.stopInspect();
    }
    if (window.__WEBAPI_API) {
      window.__WEBAPI_API.hideHighlight();
      window.__WEBAPI_API.hideLocatorPanel();
    }
    document.body.style.cursor = '';
    window.__WEBAPI_INSPECTING__ = false;
    chrome.runtime.sendMessage({ type:'REC_STOP' });
  });

  // ── Inspector toggle ──────────────────────────────────────────────
  document.getElementById('__wb_insp').addEventListener('click', e => {
    e.stopPropagation();
    const btn = e.currentTarget;
    if (window.__WEBAPI_INSPECTING__) {
      // Directly stop via API (same context) + notify background
      if (window.__WEBAPI_API && window.__WEBAPI_API.stopInspect) {
        window.__WEBAPI_API.stopInspect();
      }
      chrome.runtime.sendMessage({ type:'STOP_INSPECT' });
      btn.classList.remove('on');
      btn.title = 'Toggle inspector';
    } else {
      chrome.runtime.sendMessage({ type:'START_INSPECT' });
      btn.classList.add('on');
      btn.title = 'Inspector ON';
    }
  });

  // ── Maximize — open the extension popup ───────────────────────────
  document.getElementById('__wb_max').addEventListener('click', e => {
    e.stopPropagation();
    chrome.runtime.sendMessage({ type:'OPEN_POPUP' });
  });

  // ── Drag ──────────────────────────────────────────────────────────
  let dragX=0, dragY=0, dragging=false;
  pill.addEventListener('mousedown', e => {
    if (e.target.tagName === 'BUTTON') return;
    dragging = true;
    dragX = e.clientX - pill.getBoundingClientRect().left;
    dragY = e.clientY - pill.getBoundingClientRect().top;
    pill.style.cursor = 'grabbing';
  });
  document.addEventListener('mousemove', e => {
    if (!dragging) return;
    pill.style.right = 'auto';
    pill.style.left  = (e.clientX - dragX) + 'px';
    pill.style.top   = (e.clientY - dragY) + 'px';
  });
  document.addEventListener('mouseup', () => {
    if (dragging) { dragging = false; pill.style.cursor = 'move'; }
  });

  } // end of isTopFrame pill block

  // ── Initial navigate (top frame only) ───────────────────────────────────────
  if (isTopFrame) send({ action:'NAVIGATE_TO', target:location.href, value:'', url:location.href, t:Date.now() });

  // ── Scroll detection & confirmation popup ──────────────────────────────────
  let scrollPopup = null;
  let scrollTimer = null;
  let lastScrollT = 0;
  let scrollDetected = false;

  function removeScrollPopup() {
    if (scrollPopup) { scrollPopup.remove(); scrollPopup = null; }
  }

  // After a click is recorded, auto-record scroll_to if scroll was detected (no popup)
  function maybeShowScrollConfirm(target, tagName, text, bounds) {
    if (!scrollDetected) return;
    scrollDetected = false;
    // Silently insert scroll_to step before the click — no popup needed
    chrome.runtime.sendMessage({ type:'REC_INSERT_BEFORE_LAST', step:{ action:'SCROLL_TO_ELEMENT', target:target, tagName:tagName, text:text, value:'', url:location.href, t:Date.now(), bounds:bounds, scrollTimeout:10000, scrollAttempts:20 } }).catch(() => {});
  }

  // Listen for scroll-detected broadcast from any frame (including parent)
  chrome.runtime.onMessage.addListener(msg => {
    if (msg.type === 'SCROLL_DETECTED' && window.__WEBAPI_REC__) {
      scrollDetected = true;
    }
  });

  document.addEventListener('scroll', () => {
    if (!window.__WEBAPI_REC__) return;
    if (window.__WEBAPI_INSPECTING__) return;
    const now = Date.now();
    if (now - lastScrollT < 1500) return; // throttle
    lastScrollT = now;
    clearTimeout(scrollTimer);
    scrollTimer = setTimeout(() => {
      if (!window.__WEBAPI_REC__) return;
      scrollDetected = true;
      // Broadcast to all frames so iframes also know scroll happened
      chrome.runtime.sendMessage({ type:'SCROLL_DETECTED' }).catch(()=>{});
    }, 400);
  }, true);

  // ── Hover detection (records hover when it triggers DOM changes) ────────────
  let hoverEl = null;
  let hoverTimer = null;
  let hoverObserver = null;
  let hoverMutations = 0;

  function startHoverWatch(el) {
    if (hoverObserver) hoverObserver.disconnect();
    hoverMutations = 0;
    hoverObserver = new MutationObserver(muts => {
      // Count meaningful mutations (new nodes appearing = hover triggered content)
      for (const m of muts) {
        if (m.type === 'childList' && m.addedNodes.length > 0) {
          for (const n of m.addedNodes) {
            if (n.nodeType === 1 && !n.id?.startsWith('__webapi_')) hoverMutations++;
          }
        }
        if (m.type === 'attributes' && (m.attributeName === 'style' || m.attributeName === 'class')) {
          hoverMutations++;
        }
      }
    });
    hoverObserver.observe(document.body, { childList:true, subtree:true, attributes:true, attributeFilter:['style','class'] });
  }

  function stopHoverWatch() {
    if (hoverObserver) { hoverObserver.disconnect(); hoverObserver = null; }
  }

  document.addEventListener('mouseenter', e => {
    if (!window.__WEBAPI_REC__) return;
    if (window.__WEBAPI_INSPECTING__) return;
    const el = e.target;
    if (!el || el === document || el === document.documentElement || el === document.body) return;
    if (el.closest('#' + PILL_ID)) return;
    if (el.closest('#__webapi_scroll_popup')) return;
    if (el.closest('#' + RANDOM_POPUP_ID)) return;
    if (el.closest('#__webapi_lpanel') || el.closest('#__webapi_highlight') || el.closest('#__webapi_hlabel') || el.closest('#__webapi_sleep_pill')) return;
    // Only watch meaningful elements (not tiny text nodes)
    if (['SPAN','A','BUTTON','LI','DIV','TD','TH','TR','IMG','SVG','LABEL','SUMMARY'].indexOf(el.tagName) === -1
        && !el.getAttribute('role') && !el.getAttribute('data-zpqa') && !el.classList.length) return;
    clearTimeout(hoverTimer);
    hoverEl = el;
    startHoverWatch(el);
    hoverTimer = setTimeout(() => {
      stopHoverWatch();
      // If hovering caused DOM changes (dropdown/tooltip appeared), record it
      if (hoverMutations >= 2 && hoverEl === el) {
        const tgt = sel(el, true);
        const tagName = el.tagName.toLowerCase();
        const text = (el.innerText||el.getAttribute('aria-label')||el.title||'').trim().slice(0,60);
        send({ action:'MOVE_TO_ELEMENT', target:tgt, tagName:tagName, text:text, value:'', url:location.href, t:Date.now(), bounds:snap(el) });
      }
      hoverMutations = 0;
      hoverEl = null;
    }, 500);
  }, true);

  document.addEventListener('mouseleave', e => {
    if (e.target === hoverEl) {
      clearTimeout(hoverTimer);
      stopHoverWatch();
      hoverEl = null;
    }
  }, true);

  // ── Hover highlight during recording ────────────────────────────────────────
  // Disabled — highlight overlay was distracting during element inspection.
  // The crosshair cursor and locator panel still indicate the target element.

  // ── Click → show locator picker → record step on selection ──────────────────
  document.addEventListener('click', e => {    if (!window.__WEBAPI_REC__) return;    if (window.__WEBAPI_INSPECTING__) return;
    const el = e.target;
    if (el.closest('#' + PILL_ID)) return;
    if (el.closest('#__webapi_scroll_popup')) return;
    if (el.closest('#' + RANDOM_POPUP_ID)) return;
    if (el.closest('#__webapi_lpanel') || el.closest('#__webapi_highlight') || el.closest('#__webapi_hlabel') || el.closest('#__webapi_sleep_pill')) return;

    const api = window.__WEBAPI_API;

    function recordClick(target, tagName, text, bounds, sleep) {
      send({ action:'CLICK', target:target, tagName:tagName, text:text, value:'', url:location.href, t:Date.now(), bounds:bounds, sleep:sleep||0 });
      // After recording click, check if scroll was detected and offer scroll_to
      maybeShowScrollConfirm(target, tagName, text, bounds);
    }

    // Deep zpqa search on self, ancestors, descendants
    const zpqaEl = _findZpqa(el);
    if (zpqaEl) {
      const text = (el.innerText||el.value||el.placeholder||'').trim().slice(0,60);
      recordClick(sel(zpqaEl), zpqaEl.tagName.toLowerCase(), text, snap(zpqaEl));
    } else {
      // No zpqa found — auto-pick best locator (no popup, no freeze)
      const tagName = el.tagName.toLowerCase();
      const text = (el.innerText||el.value||el.placeholder||'').trim().slice(0,60);
      recordClick(sel(el), tagName, text, snap(el));
    }
  }, true);

  // ── Right-click recording ────────────────────────────────────────────────────
  // Use mousedown (button=2) to capture the real element before any app overlay.
  // Apps often intercept contextmenu with stopImmediatePropagation, so we
  // handle everything in mousedown which fires first and isn't blocked.
  document.addEventListener('mousedown', e => {
    if (e.button !== 2) return;          // only right-click
    if (!window.__WEBAPI_REC__) return;
    if (window.__WEBAPI_INSPECTING__) return;
    const el = e.target;
    if (el.closest('#' + PILL_ID)) return;
    if (el.closest('#__webapi_scroll_popup')) return;
    if (el.closest('#' + RANDOM_POPUP_ID)) return;
    if (el.closest('#__webapi_lpanel') || el.closest('#__webapi_highlight') || el.closest('#__webapi_hlabel') || el.closest('#__webapi_sleep_pill')) return;

    const api = window.__WEBAPI_API;

    function recordRightClick(target, tagName, text, bounds, sleep) {
      send({ action:'RIGHT_CLICK', target:target, tagName:tagName, text:text, value:'', url:location.href, t:Date.now(), bounds:bounds, sleep:sleep||0 });
    }

    // Deep zpqa search on self, ancestors, descendants
    const zpqaEl = _findZpqa(el);
    if (zpqaEl) {
      const text = (el.innerText||el.value||el.placeholder||'').trim().slice(0,60);
      recordRightClick(sel(zpqaEl), zpqaEl.tagName.toLowerCase(), text, snap(zpqaEl));
    } else {
      const tagName = el.tagName.toLowerCase();
      const text = (el.innerText||el.value||el.placeholder||'').trim().slice(0,60);
      recordRightClick(sel(el), tagName, text, snap(el));
    }
  }, true);

  // ── Detect contenteditable elements (rich text editors) ─────────────────────
  function isContentEditable(el) {
    if (!el) return false;
    if (el.isContentEditable) return true;
    if (el.getAttribute && el.getAttribute('contenteditable') === 'true') return true;
    return false;
  }

  function getEditableRoot(el) {
    let node = el;
    while (node) {
      if (node.getAttribute && node.getAttribute('contenteditable') === 'true') return node;
      node = node.parentElement;
    }
    return null;
  }

  // ── Random data prompt during recording ──────────────────────────────────────
  const RANDOM_POPUP_ID = '__webapi_random_popup';
  let randomPopup = null;
  let randomAutoTimer = null;
  function removeRandomPopup() {
    clearTimeout(randomAutoTimer);
    if (randomPopup) { randomPopup.remove(); randomPopup = null; }
  }
  function positionNearEl(popup, el) {
    const r = el.getBoundingClientRect();
    const gap = 8;
    // Use actual rendered size (forces layout calc)
    const pH = popup.offsetHeight || 320;
    const pW = popup.offsetWidth || 340;
    // Try below the element first
    let top = r.bottom + gap;
    let left = r.left;
    // If it would go off-screen bottom, place above
    if (top + pH > window.innerHeight) top = Math.max(gap, r.top - pH - gap);
    // If still off-screen (element near top), clamp to viewport
    if (top < gap) top = gap;
    // Keep within horizontal bounds
    if (left + pW > window.innerWidth) left = Math.max(gap, window.innerWidth - pW - gap);
    if (left < gap) left = gap;
    popup.style.position = 'fixed';
    popup.style.top = top + 'px';
    popup.style.left = left + 'px';
    popup.style.bottom = 'auto';
    popup.style.right = 'auto';
  }
  // Smart auto-detect: guess the best random type from field attributes (Zoho Projects aware)
  function _autoDetectRandomType(el) {
    const zpqa = (el.getAttribute('data-zpqa') || '').toLowerCase();
    const name = (el.getAttribute('name') || '').toLowerCase();
    const ph   = (el.getAttribute('placeholder') || '').toLowerCase();
    const aria = (el.getAttribute('aria-label') || '').toLowerCase();
    const type = (el.getAttribute('type') || '').toLowerCase();
    const ac   = (el.getAttribute('autocomplete') || '').toLowerCase();
    const all  = zpqa + ' ' + name + ' ' + ph + ' ' + aria + ' ' + ac;

    // Zoho Projects specific patterns
    if (/task.?name|taskTitle|addtask/i.test(all))  return 'taskname';
    if (/bug.?name|bug.?title|defect/i.test(all))   return 'bugname';
    if (/project.?name/i.test(all))                  return 'projectname';
    if (/task.?list|tasklist/i.test(all))             return 'tasklistname';
    if (/comment|note(?!book)|feedback/i.test(all))  return 'comment';

    // Generic patterns
    if (type==='email' || /email|e.?mail/i.test(all))           return 'email';
    if (type==='tel' || /phone|mobile|tel/i.test(all))          return 'phone';
    if (type==='date' || /\bdate\b|due.?date|\bstart.?date\b|\bend.?date\b/i.test(all)) return 'date';
    if (/name|full.?name|user.?name|assign|owner/i.test(all))   return 'username';
    if (/desc|description|comment|note|summary/i.test(all))     return 'paragraph';
    if (type==='number' || /amount|count|qty|quantity/i.test(all)) return 'number';
    return null; // no suggestion
  }

  function showRandomPrompt(step, el) {
    // Prevent showing a second popup if one is already visible
    if (randomPopup) return;

    // Auto-apply for high-confidence Zoho field types (matched from data-zpqa)
    const _zpqa = (el.getAttribute('data-zpqa') || '').toLowerCase();
    const ZPQA_AUTO_MAP = {
      'projectname':'projectname', 'project_name':'projectname',
      'taskname':'taskname', 'task_name':'taskname', 'addtask':'taskname', 'tasktitle':'taskname',
      'tasklistname':'tasklistname', 'tasklist_name':'tasklistname', 'addtasklist':'tasklistname',
      'bugname':'bugname', 'bug_name':'bugname', 'bugtitle':'bugname', 'defectname':'bugname'
    };
    if (_zpqa && ZPQA_AUTO_MAP[_zpqa]) {
      const autoType = ZPQA_AUTO_MAP[_zpqa];
      step.value = '{{random:' + autoType + '}}';
      send(step);
      recentlySentInputs.set(el, Date.now());
      // Brief green outline to indicate auto-fill
      try { el.style.outline = '2px solid #00d4aa'; el.style.outlineOffset = '2px'; setTimeout(() => { el.style.outline = ''; el.style.outlineOffset = ''; }, 1500); } catch(e) {}
      return;
    }

    removeRandomPopup();
    randomPopup = document.createElement('div');
    randomPopup.id = RANDOM_POPUP_ID;
    const fieldLabel = step.text || step.target;
    const shortLabel = fieldLabel.length > 40 ? fieldLabel.slice(0, 37) + '...' : fieldLabel;
    const btnStyle = 'border:1px solid rgba(255,255,255,.15);background:rgba(255,255,255,.06);color:#fff;padding:6px 8px;border-radius:8px;font:600 11px -apple-system,sans-serif;cursor:pointer;text-align:center;transition:background .12s';
    const suggestedType = _autoDetectRandomType(el);
    const suggestBadge = suggestedType ? ' <span style="color:#00d4aa;font-size:10px">— suggested: ' + suggestedType + '</span>' : '';
    randomPopup.style.cssText = 'z-index:2147483647;background:linear-gradient(135deg,#0f172a,#1e3a5f);border:1px solid rgba(255,255,255,.18);border-radius:12px;padding:14px 18px;font:500 12px/1.5 -apple-system,system-ui,sans-serif;color:#fff;box-shadow:0 8px 30px rgba(0,0,0,.4);max-width:340px;min-width:260px;max-height:90vh;overflow-y:auto;pointer-events:auto;';
    randomPopup.innerHTML =
      '<div id="__wb_rd_step1">'
      + '<div style="margin-bottom:8px;font-weight:700;font-size:13px">🎲 Use random data?' + suggestBadge + '</div>'
      + '<div style="color:#94a3b8;font-size:11px;margin-bottom:10px">Field: <b>' + shortLabel.replace(/</g,'&lt;').replace(/>/g,'&gt;') + '</b></div>'
      + '<div style="display:grid;grid-template-columns:1fr 1fr;gap:6px;margin-bottom:6px">'
      + '<button class="__wb_rd_btn" data-type="string" style="' + btnStyle + '">🔤 String</button>'
      + '<button class="__wb_rd_btn" data-type="number" style="' + btnStyle + '">🔢 Number</button>'
      + '<button class="__wb_rd_btn" data-type="email" style="' + btnStyle + '">📧 Email</button>'
      + '<button class="__wb_rd_btn" data-type="paragraph" style="' + btnStyle + '">📝 Paragraph</button>'
      + '</div>'
      + '<div style="color:#64748b;font-size:10px;margin-bottom:4px;text-transform:uppercase;letter-spacing:.5px">Zoho Projects</div>'
      + '<div style="display:grid;grid-template-columns:1fr 1fr;gap:6px;margin-bottom:6px">'
      + '<button class="__wb_rd_btn" data-type="taskname" style="' + btnStyle + '">📋 Task Name</button>'
      + '<button class="__wb_rd_btn" data-type="bugname" style="' + btnStyle + '">🐛 Bug Name</button>'
      + '<button class="__wb_rd_btn" data-type="tasklistname" style="' + btnStyle + '">📂 Tasklist</button>'
      + '<button class="__wb_rd_btn" data-type="comment" style="' + btnStyle + '">💬 Comment</button>'
      + '<button class="__wb_rd_btn" data-type="username" style="' + btnStyle + '">👤 User Name</button>'
      + '<button class="__wb_rd_btn" data-type="date" style="' + btnStyle + '">📅 Date</button>'
      + '<button class="__wb_rd_btn" data-type="phone" style="' + btnStyle + '">📱 Phone</button>'
      + '<button class="__wb_rd_btn" data-type="uuid" style="' + btnStyle + '">🆔 UUID</button>'
      + '</div>'
      + '<div style="display:flex;gap:8px;justify-content:flex-end">'
      + '<button id="__wb_rd_no" style="border:1px solid rgba(255,255,255,.2);background:none;color:#94a3b8;padding:5px 14px;border-radius:6px;font:600 11px -apple-system,sans-serif;cursor:pointer">No, use typed value</button>'
      + '</div>'
      + '</div>'
      + '<div id="__wb_rd_step2" style="display:none">'
      + '<div style="margin-bottom:8px;font-weight:700;font-size:13px">📏 Set length</div>'
      + '<div style="color:#94a3b8;font-size:11px;margin-bottom:8px">Type: <b id="__wb_rd_type_label"></b></div>'
      + '<div style="display:flex;align-items:center;gap:10px;margin-bottom:10px">'
      + '<input id="__wb_rd_range" type="range" min="1" max="200" value="10" style="flex:1;accent-color:#2563eb;cursor:pointer">'
      + '<input id="__wb_rd_len" type="number" min="1" max="500" value="10" style="width:52px;background:rgba(255,255,255,.1);border:1px solid rgba(255,255,255,.2);color:#fff;border-radius:6px;padding:4px 6px;font:600 12px -apple-system,sans-serif;text-align:center">'
      + '</div>'
      + '<div style="display:flex;gap:8px;justify-content:flex-end">'
      + '<button id="__wb_rd_back" style="border:1px solid rgba(255,255,255,.2);background:none;color:#94a3b8;padding:5px 14px;border-radius:6px;font:600 11px -apple-system,sans-serif;cursor:pointer">← Back</button>'
      + '<button id="__wb_rd_apply" style="border:none;background:#2563eb;color:#fff;padding:5px 14px;border-radius:6px;font:600 11px -apple-system,sans-serif;cursor:pointer">Apply</button>'
      + '</div>'
      + '</div>';
    document.documentElement.appendChild(randomPopup);
    positionNearEl(randomPopup, el);

    let chosenType = '';
    const defaults = { string: 10, number: 5, paragraph: 100 };
    const maxVals = { string: 100, number: 20, paragraph: 500 };
    const labels = { string: '🔤 String', number: '🔢 Number', paragraph: '📝 Paragraph' };

    // No-length types: apply directly without step 2
    const NO_LEN_TYPES = new Set(['email','taskname','bugname','projectname','username','phone','date','uuid','timestamp','comment','tasklistname']);

    // Hover effects on type buttons
    randomPopup.querySelectorAll('.__wb_rd_btn').forEach(btn => {
      // Highlight suggested type
      if (suggestedType && btn.dataset.type === suggestedType) {
        btn.style.background = 'rgba(0,212,170,.15)';
        btn.style.borderColor = '#00d4aa';
      }
      btn.addEventListener('mouseenter', () => { btn.style.background = 'rgba(37,99,235,.5)'; btn.style.borderColor = '#2563eb'; });
      btn.addEventListener('mouseleave', () => {
        if (suggestedType && btn.dataset.type === suggestedType) {
          btn.style.background = 'rgba(0,212,170,.15)'; btn.style.borderColor = '#00d4aa';
        } else {
          btn.style.background = 'rgba(255,255,255,.06)'; btn.style.borderColor = 'rgba(255,255,255,.15)';
        }
      });
      btn.addEventListener('click', ev => {
        ev.stopPropagation(); ev.preventDefault();
        chosenType = btn.dataset.type;
        if (NO_LEN_TYPES.has(chosenType)) {
          // These types have no length parameter — apply directly
          // date needs mode param (any/past/future), others are plain
          step.value = chosenType === 'date' ? '{{random:date:any}}' : '{{random:' + chosenType + '}}';
          send(step);
          recentlySentInputs.set(el, Date.now());
          removeRandomPopup();
          return;
        }
        // Show step 2 — length picker
        const step1 = randomPopup.querySelector('#__wb_rd_step1');
        const step2 = randomPopup.querySelector('#__wb_rd_step2');
        step1.style.display = 'none';
        step2.style.display = 'block';
        randomPopup.querySelector('#__wb_rd_type_label').textContent = labels[chosenType] || chosenType;
        const rangeEl = randomPopup.querySelector('#__wb_rd_range');
        const lenEl = randomPopup.querySelector('#__wb_rd_len');
        const defLen = defaults[chosenType] || 10;
        rangeEl.max = maxVals[chosenType] || 200;
        rangeEl.value = defLen;
        lenEl.value = defLen;
        // Sync range ↔ number
        rangeEl.addEventListener('input', () => { lenEl.value = rangeEl.value; });
        lenEl.addEventListener('input', () => { rangeEl.value = lenEl.value; });
        // Reset auto-dismiss timer for step 2
        clearTimeout(randomAutoTimer);
        randomAutoTimer = setTimeout(() => { if (randomPopup) { send(step); recentlySentInputs.set(el, Date.now()); removeRandomPopup(); } }, 15000);
      });
    });

    // "No, use typed value"
    randomPopup.querySelector('#__wb_rd_no').addEventListener('click', ev => {
      ev.stopPropagation(); ev.preventDefault();
      send(step);
      recentlySentInputs.set(el, Date.now());
      removeRandomPopup();
    });

    // Back button
    randomPopup.querySelector('#__wb_rd_back').addEventListener('click', ev => {
      ev.stopPropagation(); ev.preventDefault();
      randomPopup.querySelector('#__wb_rd_step1').style.display = 'block';
      randomPopup.querySelector('#__wb_rd_step2').style.display = 'none';
      clearTimeout(randomAutoTimer);
      randomAutoTimer = setTimeout(() => { if (randomPopup) { send(step); recentlySentInputs.set(el, Date.now()); removeRandomPopup(); } }, 15000);
    });

    // Apply button
    randomPopup.querySelector('#__wb_rd_apply').addEventListener('click', ev => {
      ev.stopPropagation(); ev.preventDefault();
      const len = parseInt(randomPopup.querySelector('#__wb_rd_len').value, 10) || defaults[chosenType] || 10;
      step.value = '{{random:' + chosenType + ':' + len + '}}';
      send(step);
      recentlySentInputs.set(el, Date.now());
      removeRandomPopup();
    });

    // Auto-dismiss after 15s — use typed value
    randomAutoTimer = setTimeout(() => {
      if (randomPopup) {
        send(step);
        recentlySentInputs.set(el, Date.now());
        removeRandomPopup();
      }
    }, 15000);
  }

  // ── Type (debounced, captures final value only) ──────────────────────────────
  const inputMap = new WeakMap();
  document.addEventListener('input', e => {
    if (!window.__WEBAPI_REC__) return;
    if (window.__WEBAPI_INSPECTING__) return;
    if (randomPopup) return; // suppress input while random prompt is open
    const el = e.target;
    if (el.closest('#' + RANDOM_POPUP_ID)) return;
    if (el.closest('#__webapi_sleep_pill')) return;

    // Handle contenteditable elements (rich text editors like <body contenteditable>)
    const editableRoot = getEditableRoot(el);
    if (editableRoot) {
      // Skip if this element recently had a step sent via random popup
      const lastSentCE = recentlySentInputs.get(editableRoot);
      if (lastSentCE && Date.now() - lastSentCE < 3000) return;
      clearTimeout(inputMap.get(editableRoot));
      inputMap.set(editableRoot, setTimeout(() => {
        if (randomPopup) return; // popup already showing from a previous timer
        const content = editableRoot.innerText || editableRoot.textContent || '';
        const api = window.__WEBAPI_API;
        const stepBase = { action:'SEND_KEYS', tagName:editableRoot.tagName.toLowerCase(),
          text:editableRoot.getAttribute('aria-label') || editableRoot.className || 'contenteditable',
          value:content.trim().slice(0, 500), url:location.href, t:Date.now(),
          contenteditable:true };
        if (api) {
          const zpqa = editableRoot.getAttribute('data-zpqa');
          if (zpqa) {
            stepBase.target = sel(editableRoot);
            showRandomPrompt(stepBase, editableRoot);
          } else {
            // Auto-pick best locator using deep zpqa search (no popup, no freeze)
            stepBase.target = sel(editableRoot);
            showRandomPrompt(stepBase, editableRoot);
          }
        } else {
          stepBase.target = sel(editableRoot);
          showRandomPrompt(stepBase, editableRoot);
        }
      }, 800));
      return;
    }

    if (!['INPUT','TEXTAREA','SELECT'].includes(el.tagName)) return;
    // Skip if this element recently had a step sent via random popup
    const lastSentInput = recentlySentInputs.get(el);
    if (lastSentInput && Date.now() - lastSentInput < 3000) return;
    clearTimeout(inputMap.get(el));
    inputMap.set(el, setTimeout(() => {
      if (randomPopup) return; // popup already showing from a previous timer
      if (el.tagName === 'SELECT') {
        send({ action:'SEND_KEYS', target:sel(el), tagName:el.tagName.toLowerCase(),
          text:el.placeholder||el.name||el.ariaLabel||'',
          value:el.value, url:location.href, t:Date.now() });
      } else {
        const api = window.__WEBAPI_API;
        const stepBase = { action:'SEND_KEYS', tagName:el.tagName.toLowerCase(),
          text:el.placeholder||el.name||el.ariaLabel||'',
          value:el.value, url:location.href, t:Date.now() };
        if (api) {
          const zpqa = el.getAttribute('data-zpqa');
          if (zpqa) {
            stepBase.target = sel(el);
            showRandomPrompt(stepBase, el);
          } else {
            // Auto-pick best locator using deep zpqa search (no popup, no freeze)
            stepBase.target = sel(el);
            showRandomPrompt(stepBase, el);
          }
        } else {
          stepBase.target = sel(el);
          showRandomPrompt(stepBase, el);
        }
      }
    }, 600));
  }, true);

  // ── Double-click → assert ───────────────────────────────────────────────────
  document.addEventListener('dblclick', e => {
    if (!window.__WEBAPI_REC__) return;
    if (window.__WEBAPI_INSPECTING__) return;
    const el = e.target;
    if (el.closest('#' + PILL_ID)) return;
    if (el.closest('#' + RANDOM_POPUP_ID)) return;
    if (el.closest('#__webapi_sleep_pill')) return;
    const text = (el.innerText || '').trim().slice(0, 80);
    if (!text) return;
    const tgt = sel(el);
    send({ action:'ASSERT_CHECK', target:tgt, value:text, text, url:location.href, t:Date.now() });
    el.style.outline = '2px solid #00d4aa';
    setTimeout(() => el.style.outline = '', 1500);
  }, true);

  // ── Keyboard shortcuts & navigation keys ──────────────────────────────────────
  const NAV_KEYS = new Set(['Enter','Tab','Escape','Backspace','Delete',
    'ArrowUp','ArrowDown','ArrowLeft','ArrowRight',
    'PageUp','PageDown','Home','End',
    'F1','F2','F3','F4','F5','F6','F7','F8','F9','F10','F11','F12']);
  document.addEventListener('keydown', e => {
    if (!window.__WEBAPI_REC__) return;
    if (window.__WEBAPI_INSPECTING__) return;
    if (e.target.closest('#' + PILL_ID)) return;
    if (e.target.closest('#' + RANDOM_POPUP_ID)) return;

    const hasModifier = e.ctrlKey || e.metaKey || e.altKey;
    const isNavKey = NAV_KEYS.has(e.key);
    const isModCombo = hasModifier && e.key.length === 1;

    if (!isNavKey && !isModCombo) return;
    // Skip bare Shift combos with single char (that's just typing uppercase)
    if (!isNavKey && !e.ctrlKey && !e.metaKey && !e.altKey && e.shiftKey) return;

    // Build combo string e.g. "Control+a", "Shift+ArrowDown", "Meta+c"
    const parts = [];
    if (e.ctrlKey || e.metaKey) parts.push('Control');
    if (e.altKey)   parts.push('Alt');
    if (e.shiftKey) parts.push('Shift');
    parts.push(e.key.length === 1 ? e.key.toLowerCase() : e.key);
    const combo = parts.join('+');

    const tgt = sel(e.target);

    // Map to specific framework key actions
    let keyAction = 'SHORTCUT_KEY';
    if (e.key === 'Enter' && !hasModifier) keyAction = 'ENTER_KEY';
    else if (e.key === 'Escape' && !hasModifier) keyAction = 'ESCAPE_KEY';
    else if ((e.key === 'Backspace' || e.key === 'Delete') && !hasModifier) keyAction = 'BACK_SPACE_KEY';
    else if (hasModifier && ['a','c','x','v'].includes(e.key.toLowerCase())) keyAction = 'CUT_COPY_PASTE_SELECTALL';

    send({ action:keyAction, target:tgt, value:combo, text:combo, url:location.href, t:Date.now(),
           modifiers:{ ctrlKey:e.ctrlKey||e.metaKey, altKey:e.altKey, shiftKey:e.shiftKey } });
  }, true);

  // ── Page refresh / navigation capture ───────────────────────────────────────
  window.addEventListener('beforeunload', () => {
    chrome.runtime.sendMessage({ type:'REC_STEP', step:{
      action:'NAVIGATE_TO', target:location.href, value:'', url:location.href,
      note:'page-refresh', t:Date.now(), id:++seq
    }}).catch(() => {});
  });

  // ── SPA navigation ───────────────────────────────────────────────────────────
  const pPush = history.pushState.bind(history);
  const pRepl = history.replaceState.bind(history);
  history.pushState = (...a) => { pPush(...a); setTimeout(() => { send({ action:'NAVIGATE_TO', target:location.href, value:'', url:location.href, t:Date.now() }); }, 50); };
  history.replaceState = (...a) => { pRepl(...a); setTimeout(() => { send({ action:'NAVIGATE_TO', target:location.href, value:'', url:location.href, t:Date.now() }); }, 50); };
  window.addEventListener('popstate', () => { send({ action:'NAVIGATE_TO', target:location.href, value:'', url:location.href, t:Date.now() }); });

  // ── Network intercept ────────────────────────────────────────────────────────
  const oFetch = window.fetch;
  window.fetch = async function(...a) {
    const resp = await oFetch.apply(this, a);
    try {
      const url    = typeof a[0]==='string' ? a[0] : (a[0]?.url||'');
      const method = (a[1]?.method||'GET').toUpperCase();
      chrome.runtime.sendMessage({ type:'REC_NET', net:{ url, method, status:resp.status, t:Date.now() }}).catch(() => {});
    } catch {}
    return resp;
  };
  const oOpen = XMLHttpRequest.prototype.open;
  XMLHttpRequest.prototype.open = function(m, u, ...r) {
    this.__wu = u; this.__wm = m;
    this.addEventListener('load', function() {
      chrome.runtime.sendMessage({ type:'REC_NET', net:{ url:this.__wu, method:this.__wm, status:this.status, t:Date.now() }}).catch(() => {});
    });
    return oOpen.call(this, m, u, ...r);
  };

  // ── Cleanup on stop ──────────────────────────────────────────────────────────
  chrome.runtime.onMessage.addListener(msg => {
    if (msg.type === 'REC_STOPPED') {
      document.getElementById(PILL_ID)?.remove();
      document.getElementById('__webapi_scroll_popup')?.remove();
      window.__WEBAPI_REC__ = false;
      scrollDetected = false;
      clearTimeout(hoverTimer); stopHoverWatch(); hoverEl = null;
      // Fully stop inspect mode via the proper API (removes listeners, cursor, overlays)
      if (window.__WEBAPI_API && window.__WEBAPI_API.stopInspect) {
        window.__WEBAPI_API.stopInspect();
      }
      // Extra safety: clean up any leftover UI
      if (window.__WEBAPI_API) {
        window.__WEBAPI_API.hideHighlight();
        window.__WEBAPI_API.hideLocatorPanel();
      }
      document.body.style.cursor = '';
    }
  });

  // ── Iframe monitoring for recording contenteditable editors ────────────────
  function _getIframeCssSel(iframe) {
    if (iframe.id) return '#' + iframe.id;
    if (iframe.name) return 'iframe[name="' + iframe.name + '"]';
    const zpqa = iframe.getAttribute && iframe.getAttribute('data-zpqa');
    if (zpqa) return 'iframe[data-zpqa="' + zpqa + '"]';
    const cls = (iframe.className || '').trim();
    if (cls) return 'iframe.' + cls.split(/\s+/).filter(c => c && !/hover|focus|active/.test(c)).slice(0,2).join('.');
    const parent = iframe.parentElement;
    if (parent) {
      const idx = Array.from(parent.querySelectorAll(':scope > iframe')).indexOf(iframe);
      if (idx >= 0) return 'iframe:nth-of-type(' + (idx + 1) + ')';
    }
    return 'iframe';
  }

  function _monitorIframe(iframe) {
    if (iframe.__webapi_monitored) return;
    try {
      const iDoc = iframe.contentDocument;
      if (!iDoc || !iDoc.body) return;
      iframe.__webapi_monitored = true;
      const iframeSel = _getIframeCssSel(iframe);

      // Debounced input on contenteditable body inside iframe
      let _ifrInputTimer = null;
      iDoc.addEventListener('input', e => {
        if (!window.__WEBAPI_REC__) return;
        if (window.__WEBAPI_INSPECTING__) return;
        const el = e.target;
        const editRoot = (el && el.getAttribute && el.getAttribute('contenteditable') === 'true') ? el
          : (el && el.isContentEditable) ? (iDoc.body.isContentEditable ? iDoc.body : el) : null;
        if (!editRoot) return;
        clearTimeout(_ifrInputTimer);
        _ifrInputTimer = setTimeout(() => {
          const content = (editRoot.innerText || editRoot.textContent || '').trim().slice(0, 500);
          if (!content) return;
          const ariaLabel = editRoot.getAttribute && editRoot.getAttribute('aria-label');
          let target = '//body[@contenteditable=\'true\']';
          if (ariaLabel) target = '//body[@aria-label=\'' + ariaLabel.replace(/'/g, "\\'") + '\']';
          else if (editRoot.tagName !== 'BODY') {
            const tag = editRoot.tagName.toLowerCase();
            target = '//' + tag + '[@contenteditable=\'true\']';
          }
          send({
            action: 'SEND_KEYS', target: target, tagName: editRoot.tagName.toLowerCase(),
            text: ariaLabel || 'contenteditable', value: content,
            url: location.href, t: Date.now(),
            contenteditable: true, iframe: true, iframeSelector: iframeSel
          });
        }, 800);
      }, true);

      // Click handler for non-body elements inside iframe
      iDoc.addEventListener('click', e => {
        if (!window.__WEBAPI_REC__) return;
        if (window.__WEBAPI_INSPECTING__) return;
        const el = e.target;
        if (!el || (el.tagName === 'BODY' && el.isContentEditable)) return; // Just focusing editor — skip
        const tag = (el.tagName || 'div').toLowerCase();
        const text = (el.innerText || '').trim().slice(0, 60);
        const ariaLabel = el.getAttribute && el.getAttribute('aria-label');
        let target = '//' + tag;
        if (ariaLabel) target += '[@aria-label=\'' + ariaLabel.replace(/'/g, "\\'") + '\']';
        send({
          action: 'CLICK', target: target, tagName: tag,
          text: text, value: '', url: location.href, t: Date.now(),
          iframe: true, iframeSelector: iframeSel
        });
      }, true);
    } catch (ex) {
      // Cross-origin iframe — silently skip
    }
  }

  function _scanIframes() {
    document.querySelectorAll('iframe').forEach(_monitorIframe);
  }
  _scanIframes();
  setInterval(_scanIframes, 3000);
  document.addEventListener('focusin', () => setTimeout(_scanIframes, 200), true);
}


// ══════════════════════════════════════════════════
//  WEBAPI SYNC  — mirror every write to the WEBAPI backend
// ══════════════════════════════════════════════════

// Fetch settings then POST/DELETE to WEBAPI. Never throws — errors are silent.
async function gmSync(method, path, body) {
  try {
    const d   = await chrome.storage.local.get('settings');
    const cfg = d.settings || {};
    if (!cfg.url) return { ok: false, error: 'No API URL configured' };
    const url = cfg.url + path;
    const key = cfg.key || '';
    const opts = {
      method,
      headers: { 'Content-Type': 'application/json', 'x-api-key': key },
      signal: AbortSignal.timeout(6000)
    };
    if (body) opts.body = JSON.stringify(body);
    const r = await fetch(url, opts);
    return { ok: r.ok, status: r.status };
  } catch (e) {
    return { ok: false, error: e.message };
  }
}

// Broadcast sync status back to popup so it can show a toast/indicator
function broadcastSync(ok, label) {
  broadcast({ type: 'SYNC_STATUS', ok, label });
}

// ══════════════════════════════════════════════════
//  STORAGE  (local chrome.storage + WEBAPI sync)
// ══════════════════════════════════════════════════
async function saveRec(rec) {
  // 1. Save locally first (always works offline)
  const d = await chrome.storage.local.get('recordings');
  let recs = d.recordings || [];
  const i = recs.findIndex(r => r.id === rec.id);
  i >= 0 ? recs[i] = rec : recs.unshift(rec);
  await chrome.storage.local.set({ recordings: recs });

  // 2. Sync to WEBAPI backend
  const r = await gmSync('POST', '/recordings', {
    id:       rec.id,
    name:     rec.name,
    startUrl: rec.startUrl || rec.steps?.[0]?.url || '',
    steps:    rec.steps    || [],
    network:  rec.network  || [],
    ms:       rec.ms       || 0,
    at:       rec.at       || new Date().toISOString()
  });
  broadcastSync(r.ok, rec.name);
}

async function delRec(id) {
  const d = await chrome.storage.local.get('recordings');
  await chrome.storage.local.set({ recordings: (d.recordings || []).filter(r => r.id !== id) });
  await gmSync('DELETE', '/recordings/' + id);
}

async function saveCase(c) {
  // 1. Save locally
  const d = await chrome.storage.local.get('cases');
  let cs = d.cases || [];
  const i = cs.findIndex(x => x.id === c.id);
  i >= 0 ? cs[i] = c : cs.unshift(c);
  await chrome.storage.local.set({ cases: cs });

  // 2. Sync to WEBAPI
  const r = await gmSync('POST', '/cases', {
    id:              c.id,
    recording_id:    c.recordingId || null,
    name:            c.name,
    type:            c.type            || 'WEB',
    framework:       c.framework       || 'playwright',
    language:        c.language        || 'javascript',
    method:          c.method          || 'GET',
    apiUrl:          c.apiUrl          || '',
    expectedStatus:  c.expectedStatus  || 200,
    body:            c.body            || '',
    assertions:      c.assertions      || '',
    browser:         c.browser         || 'chromium',
    webUrl:          c.webUrl          || '',
    steps:           c.steps           || '',
    _recordingSteps: c._recordingSteps || [],
    generatedCode:   c.generatedCode   || '',
    lastRun:         c.lastRun         || null,
    lastMs:          c.lastMs          || null,
    createdAt:       c.createdAt       || new Date().toISOString()
  });
  broadcastSync(r.ok, c.name);
}

async function delCase(id) {
  const d = await chrome.storage.local.get('cases');
  await chrome.storage.local.set({ cases: (d.cases || []).filter(c => c.id !== id) });
  await gmSync('DELETE', '/cases/' + id);
}

async function saveResult(r) {
  // 1. Save locally
  const d = await chrome.storage.local.get('runResults');
  let rs = d.runResults || [];
  rs.unshift(r);
  if (rs.length > 100) rs = rs.slice(0, 100);
  await chrome.storage.local.set({ runResults: rs });

  // 2. Sync to WEBAPI
  await gmSync('POST', '/results', {
    id:       r.id,
    caseId:   r.caseId   || null,
    caseName: r.caseName || r.name || '',
    caseType: r.caseType || '',
    pass:     r.pass,
    status:   r.status   || null,
    ms:       r.ms       || 0,
    error:    r.error    || null,
    note:     r.note     || null,
    body:     r.body     || null,
    steps:    r.steps    || [],
    t0:       r.t0       || new Date().toISOString()
  });
}

// ══════════════════════════════════════════════════
//  SHARED XSS PAYLOADS (used by genCode + resolveValue)
// ══════════════════════════════════════════════════
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
  'javascript:alert(document.cookie)',
  '"><img src=x onerror=alert(document.domain)>',
  '<math><mtext><table><mglyph><svg><mtext><textarea><path id=x style=d:expression(alert(1))>',
  'data:text/html,<script>alert(1)</script>'
];

// ══════════════════════════════════════════════════
//  CODE GENERATION
// ══════════════════════════════════════════════════
function genCode(rec, fw, lang) {
  const steps = rec.steps||[];
  const nets  = rec.network||[];
  const name  = rec.name||'RecordedTest';
  const safe  = name.replace(/[^a-zA-Z0-9]/g,'_');
  const hasRandom = steps.some(s => s.value && s.value.startsWith('{{random:') && s.value.endsWith('}}'));
  const hasVarRef = steps.some(s => s.value && s.value.startsWith('{{var:') && s.value.endsWith('}}'));

  // Parse a {{random:type:param}} token
  function parseRd(v) {
    const m = v.match(/^\{\{random:(\w+)(?::([^\}]+))?\}\}$/);
    if (!m) return null;
    const len = m[2] ? parseInt(m[2]) : NaN;
    return { type: m[1], len: isNaN(len) ? 10 : len, param: m[2] || null };
  }

  // Check for {{var:step_N}} references
  function isVarRef(v) { return v && v.startsWith('{{var:') && v.endsWith('}}'); }
  function parseVarRef(v) {
    const m = v.match(/^\{\{var:step_(\d+)\}\}$/);
    return m ? parseInt(m[1]) : null;
  }

  // JS helper functions for random data generation
  // Email domain & phone prefix read from settings at code-gen time
  const _cgEmailDomain = rec._emailDomain || '@test.com';
  const _cgPhonePrefix = rec._phonePrefix || '+1-555-';
  const rdHelpersJS = `// Random data helpers — configure EMAIL_DOMAIN and PHONE_PREFIX for your environment
const EMAIL_DOMAIN = '${_cgEmailDomain}';
const PHONE_PREFIX = '${_cgPhonePrefix}';
function _randStr(n){const c='abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ';let r='';for(let i=0;i<n;i++)r+=c[Math.floor(Math.random()*c.length)];return r;}
function _randNum(n){let r='';for(let i=0;i<n;i++)r+=Math.floor(Math.random()*10);if(r[0]==='0'&&n>1)r=(Math.floor(Math.random()*9)+1)+r.slice(1);return r;}
function _randEmail(){return _randStr(8).toLowerCase()+EMAIL_DOMAIN;}
function _randPara(n){const w=['the','quick','brown','fox','jumps','over','lazy','dog','lorem','ipsum','dolor','sit','amet'];let r='';while(r.length<n)r+=w[Math.floor(Math.random()*w.length)]+' ';return r.slice(0,n);}
function _randTaskName(){const p=['Task','Item','Work','Todo','Story','Ticket'];return p[Math.floor(Math.random()*p.length)]+'_Auto_'+_randStr(6)+'_'+_randNum(4);}
function _randBugName(){const p=['Bug','Defect','Issue','Error','Fault'];return p[Math.floor(Math.random()*p.length)]+'_Auto_'+_randStr(6)+'_'+_randNum(4);}
function _randProjectName(){const p=['Project','Sprint','Release','Module'];return p[Math.floor(Math.random()*p.length)]+'_Auto_'+_randStr(5)+'_'+_randNum(3);}
function _randUsername(){const f=['Alice','Bob','Carol','Dave','Eve','Frank','Grace','Henry','Ivy','Jack'];const l=['Smith','Jones','Brown','Wilson','Taylor','Clark'];return f[Math.floor(Math.random()*f.length)]+' '+l[Math.floor(Math.random()*l.length)];}
function _randPhone(){return PHONE_PREFIX+_randNum(3)+'-'+_randNum(4);}
function _randDate(m){const d=86400000,n=Date.now();if(m==='past')return new Date(n-Math.floor(Math.random()*90)*d).toISOString().slice(0,10);if(m==='future')return new Date(n+Math.floor(Math.random()*90+1)*d).toISOString().slice(0,10);return new Date(n+Math.floor(Math.random()*180-90)*d).toISOString().slice(0,10);}
function _randUUID(){return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g,c=>{const r=Math.random()*16|0;return(c==='x'?r:(r&0x3|0x8)).toString(16);});}
function _randComment(){const a=['Verified','Reviewed','Updated','Checked','Tested','Approved','Confirmed','Noted'];const c=['the changes','this item','the implementation','the fix','the feature','the update'];return a[Math.floor(Math.random()*a.length)]+' '+c[Math.floor(Math.random()*c.length)]+' \u2014 Auto_'+_randStr(6);}
function _randTasklistName(){const p=['Tasklist','Module','Phase','Feature','Component','Sprint'];return p[Math.floor(Math.random()*p.length)]+'_Auto_'+_randStr(5)+'_'+_randNum(3);}
`;

  const rdHelpersPy = `import random, string\n\n# Configure for your environment\nEMAIL_DOMAIN = '${_cgEmailDomain}'\nPHONE_PREFIX = '${_cgPhonePrefix}'\n\ndef _rand_str(n):\n    return ''.join(random.choices(string.ascii_letters, k=n))\n\ndef _rand_num(n):\n    return str(random.randint(10**(n-1), 10**n-1)) if n > 1 else str(random.randint(0, 9))\n\ndef _rand_email():\n    return _rand_str(8).lower() + EMAIL_DOMAIN\n\ndef _rand_para(n):\n    words = ['the','quick','brown','fox','jumps','over','lazy','dog','lorem','ipsum']\n    r = ''\n    while len(r) < n: r += random.choice(words) + ' '\n    return r[:n]\n\ndef _rand_task_name():\n    import random as _r\n    p = ['Task','Item','Work','Todo','Story','Ticket']\n    return _r.choice(p) + '_Auto_' + _rand_str(6) + '_' + _rand_num(4)\n\ndef _rand_bug_name():\n    import random as _r\n    p = ['Bug','Defect','Issue','Error','Fault']\n    return _r.choice(p) + '_Auto_' + _rand_str(6) + '_' + _rand_num(4)\n\ndef _rand_project_name():\n    import random as _r\n    p = ['Project','Sprint','Release','Module']\n    return _r.choice(p) + '_Auto_' + _rand_str(5) + '_' + _rand_num(3)\n\ndef _rand_username():\n    import random as _r\n    f = ['Alice','Bob','Carol','Dave','Eve','Frank','Grace','Henry','Ivy','Jack']\n    l = ['Smith','Jones','Brown','Wilson','Taylor','Clark']\n    return _r.choice(f) + ' ' + _r.choice(l)\n\ndef _rand_phone():\n    return PHONE_PREFIX + _rand_num(3) + '-' + _rand_num(4)\n\ndef _rand_date(mode='any'):\n    from datetime import datetime, timedelta\n    import random as _r\n    if mode == 'past': d = datetime.now() - timedelta(days=_r.randint(1,90))\n    elif mode == 'future': d = datetime.now() + timedelta(days=_r.randint(1,90))\n    else: d = datetime.now() + timedelta(days=_r.randint(-90,90))\n    return d.strftime('%Y-%m-%d')\n\ndef _rand_uuid():\n    import uuid\n    return str(uuid.uuid4())\n\ndef _rand_comment():\n    import random as _r\n    a = ['Verified','Reviewed','Updated','Checked','Tested','Approved','Confirmed','Noted']\n    c = ['the changes','this item','the implementation','the fix','the feature','the update']\n    return _r.choice(a) + ' ' + _r.choice(c) + ' — Auto_' + _rand_str(6)\n\ndef _rand_tasklist_name():\n    import random as _r\n    p = ['Tasklist','Module','Phase','Feature','Component','Sprint']\n    return _r.choice(p) + '_Auto_' + _rand_str(5) + '_' + _rand_num(3)\n`;

  // Return JS expression for a random token
  function rdExprJS(v) {
    const rd = parseRd(v);
    if (!rd) return "'" + v.replace(/'/g,"\\'") + "'";
    if (rd.type==='string')      return `_randStr(${rd.len})`;
    if (rd.type==='number')      return `_randNum(${rd.len})`;
    if (rd.type==='email')       return `_randEmail()`;
    if (rd.type==='paragraph')   return `_randPara(${rd.len})`;
    if (rd.type==='xss')         return "'" + (XSS_PAYLOADS[rd.len]||XSS_PAYLOADS[0]).replace(/'/g,"\\'") + "'";
    if (rd.type==='taskname')    return `_randTaskName()`;
    if (rd.type==='bugname')     return `_randBugName()`;
    if (rd.type==='projectname') return `_randProjectName()`;
    if (rd.type==='username')    return `_randUsername()`;
    if (rd.type==='phone')       return `_randPhone()`;
    if (rd.type==='date')        return `_randDate('${rd.param||'any'}')`;
    if (rd.type==='uuid')        return `_randUUID()`;
    if (rd.type==='comment')     return `_randComment()`;
    if (rd.type==='tasklistname') return `_randTasklistName()`;
    return "'" + v.replace(/'/g,"\\'") + "'";
  }

  // Return Python expression for a random token
  function rdExprPy(v) {
    const rd = parseRd(v);
    if (!rd) return '"' + v.replace(/"/g,'\\"') + '"';
    if (rd.type==='string')      return `_rand_str(${rd.len})`;
    if (rd.type==='number')      return `_rand_num(${rd.len})`;
    if (rd.type==='email')       return `_rand_email()`;
    if (rd.type==='paragraph')   return `_rand_para(${rd.len})`;
    if (rd.type==='xss')         return '"' + (XSS_PAYLOADS[rd.len]||XSS_PAYLOADS[0]).replace(/"/g,'\\"') + '"';
    if (rd.type==='taskname')    return `_rand_task_name()`;
    if (rd.type==='bugname')     return `_rand_bug_name()`;
    if (rd.type==='projectname') return `_rand_project_name()`;
    if (rd.type==='username')    return `_rand_username()`;
    if (rd.type==='phone')       return `_rand_phone()`;
    if (rd.type==='date')        return `_rand_date('${rd.param||'any'}')`;
    if (rd.type==='uuid')        return `_rand_uuid()`;
    if (rd.type==='comment')     return `_rand_comment()`;
    if (rd.type==='tasklistname') return `_rand_tasklist_name()`;
    return '"' + v.replace(/"/g,'\\"') + '"';
  }

  // Return Java expression for a random token
  function rdExprJava(v) {
    const rd = parseRd(v);
    if (!rd) return '"' + v.replace(/"/g,'\\"') + '"';
    if (rd.type==='string')      return `_randStr(${rd.len})`;
    if (rd.type==='number')      return `_randNum(${rd.len})`;
    if (rd.type==='email')       return `_randEmail()`;
    if (rd.type==='paragraph')   return `_randPara(${rd.len})`;
    if (rd.type==='xss')         return '"' + (XSS_PAYLOADS[rd.len]||XSS_PAYLOADS[0]).replace(/"/g,'\\"') + '"';
    if (rd.type==='taskname')    return `_randTaskName()`;
    if (rd.type==='bugname')     return `_randBugName()`;
    if (rd.type==='projectname') return `_randProjectName()`;
    if (rd.type==='username')    return `_randUsername()`;
    if (rd.type==='phone')       return `_randPhone()`;
    if (rd.type==='date')        return `_randDate("${rd.param||'any'}")`;
    if (rd.type==='uuid')        return `_randUUID()`;
    if (rd.type==='comment')     return `_randComment()`;
    if (rd.type==='tasklistname') return `_randTasklistName()`;
    return '"' + v.replace(/"/g,'\\"') + '"';
  }

  function isRd(v) { return v && v.startsWith('{{random:') && v.endsWith('}}'); }

  // Helper: convert XPath to Cypress xpath() or Selenium By.xpath()
  function isXPath(sel) { return sel && (sel.startsWith('/') || sel.startsWith('//')); }

  // Cypress selector: use cy.xpath() for XPath, cy.get() for CSS
  function cyGet(sel) {
    return isXPath(sel) ? `cy.xpath('${sel}')` : `cy.get('${sel}')`;
  }

  // Selenium selector: use By.xpath() for XPath, By.cssSelector() for CSS
  function seBy(sel) {
    return isXPath(sel) ? `By.xpath("${sel}")` : `By.cssSelector("${sel}")`;
  }

  // Track random-value variables for correlated assertions
  const _rdVarMap = {};
  let _rdVarCount = 0;

  // Step converters per framework
  const S = (step) => {
    const t=step.target, v=(step.value||'').replace(/'/g,"\\'");
    switch(step.action) {
      case 'NAVIGATE_TO':
        if(fw==='playwright') return `  await page.goto('${t}');`;
        if(fw==='cypress')    return `    cy.visit('${t}');`;
        if(fw==='selenium')   return `    driver.get("${t}");`;
        return `// NAVIGATE_TO ${t}`;
      case 'CLICK':
        if(fw==='playwright') return `  await page.click('${t}'); // ${step.text||''}`;
        if(fw==='cypress')    return `    ${cyGet(t)}.click(); // ${step.text||''}`;
        if(fw==='selenium')   return `    driver.findElement(${seBy(t)}).click();`;
        return `// CLICK ${t}`;
      case 'DOUBLE_CLICK':
        if(fw==='playwright') return `  await page.dblclick('${t}'); // ${step.text||''}`;
        if(fw==='cypress')    return `    ${cyGet(t)}.dblclick(); // ${step.text||''}`;
        if(fw==='selenium')   return `    new Actions(driver).doubleClick(driver.findElement(${seBy(t)})).perform()`;
        return `// DOUBLE_CLICK ${t}`;
      case 'SEND_KEYS':
        if (isRd(step.value)) {
          const re = rdExprJS(step.value);
          // Store in a variable so assertions can reference it
          const varName = '_val' + (++_rdVarCount);
          if (step.id) _rdVarMap['step_' + step.id] = varName;
          if(fw==='playwright') return `  const ${varName} = ${re};\n  await page.fill('${t}', ${varName});`;
          if(fw==='cypress')    return `    const ${varName} = ${re};\n    ${cyGet(t)}.clear().type(${varName});`;
          if(fw==='selenium')   return `    String ${varName} = ${re};\n    driver.findElement(${seBy(t)}).clear();\n    driver.findElement(${seBy(t)}).sendKeys(${varName})`;
        }
        if(fw==='playwright') return `  await page.fill('${t}', '${v}');`;
        if(fw==='cypress')    return `    ${cyGet(t)}.clear().type('${v}');`;
        if(fw==='selenium')   return `    driver.findElement(${seBy(t)}).clear();\n    driver.findElement(${seBy(t)}).sendKeys("${v}");`;
        return `// SEND_KEYS ${t}`;
      case 'CLEAR':
        if(fw==='playwright') return `  await page.fill('${t}', '');`;
        if(fw==='cypress')    return `    ${cyGet(t)}.clear();`;
        if(fw==='selenium')   return `    driver.findElement(${seBy(t)}).clear();`;
        return `// CLEAR ${t}`;
      case 'ASSERT_CHECK':
        // If value references a variable from a prior random SEND_KEYS step, use the variable
        if (isVarRef(step.value)) {
          const refId = parseVarRef(step.value);
          const varName = refId !== null ? _rdVarMap['step_' + refId] : null;
          if (varName) {
            if(fw==='playwright') return `  await expect(page.locator('${t}')).toContainText(${varName});`;
            if(fw==='cypress')    return `    ${cyGet(t)}.should('contain.text', ${varName});`;
            if(fw==='selenium')   return `    assertThat(driver.findElement(${seBy(t)}).getText(), containsString(${varName}));`;
          }
        }
        if(fw==='playwright') return `  await expect(page.locator('${t}')).toContainText('${v}');`;
        if(fw==='cypress')    return `    ${cyGet(t)}.should('contain.text', '${v}');`;
        if(fw==='selenium')   return `    assertThat(driver.findElement(${seBy(t)}).getText(), containsString("${v}"));`;
        return `// ASSERT_CHECK ${t} contains "${v}"`;
      case 'SCROLL_TO_ELEMENT':
        if(fw==='playwright') return `  await page.locator('${t}').scrollIntoViewIfNeeded({ timeout: ${step.scrollTimeout||10000} }); // scroll to element`;
        if(fw==='cypress')    return `    ${cyGet(t)}.scrollIntoView({ timeout: ${step.scrollTimeout||10000} });`;
        if(fw==='selenium')   return `    driver.executeScript("arguments[0].scrollIntoView(true)", driver.findElement(${seBy(t)}));`;
        return `// SCROLL_TO_ELEMENT ${t}`;
      case 'SCROLL_TO_ELEMENT_AND_CLICK':
        if(fw==='playwright') return `  await page.locator('${t}').scrollIntoViewIfNeeded();\n  await page.click('${t}');`;
        if(fw==='cypress')    return `    ${cyGet(t)}.scrollIntoView().click();`;
        if(fw==='selenium')   return `    {\n      WebElement el = driver.findElement(${seBy(t)});\n      driver.executeScript("arguments[0].scrollIntoView(true)", el);\n      el.click();\n    }`;
        return `// SCROLL_TO_ELEMENT_AND_CLICK ${t}`;
      case 'MOVE_TO_ELEMENT':
      case 'MOVE_TO_ELEMENT_WITHOUT_CLICK':
        if(fw==='playwright') return `  await page.hover('${t}'); // ${step.text||''}`;
        if(fw==='cypress')    return `    ${cyGet(t)}.trigger('mouseover'); // ${step.text||''}`;
        if(fw==='selenium')   return `    new Actions(driver).moveToElement(driver.findElement(${seBy(t)})).perform()`;
        return `// ${step.action} ${t}`;
      case 'ENTER_KEY':
        if(fw==='playwright') return `  await page.keyboard.press('Enter');`;
        if(fw==='cypress')    return `    ${cyGet(t)}.type('{enter}');`;
        if(fw==='selenium')   return `    new Actions(driver).sendKeys(Keys.ENTER).perform();`;
        return `// ENTER_KEY`;
      case 'ESCAPE_KEY':
        if(fw==='playwright') return `  await page.keyboard.press('Escape');`;
        if(fw==='cypress')    return `    cy.get('body').type('{esc}');`;
        if(fw==='selenium')   return `    new Actions(driver).sendKeys(Keys.ESCAPE).perform();`;
        return `// ESCAPE_KEY`;
      case 'BACK_SPACE_KEY':
        if(fw==='playwright') return `  await page.keyboard.press('Backspace');`;
        if(fw==='cypress')    return `    ${cyGet(t)}.type('{backspace}');`;
        if(fw==='selenium')   return `    new Actions(driver).sendKeys(Keys.BACK_SPACE).perform();`;
        return `// BACK_SPACE_KEY`;
      case 'CUT_COPY_PASTE_SELECTALL':
      case 'SHORTCUT_KEY':
        if(fw==='playwright') return `  await page.keyboard.press('${v}');`;
        if(fw==='cypress')    return `    cy.get('body').type('${'{'+v.replace(/\+/g,'}{').replace(/{([a-z])}/g,'$1')+'}'}', { release: false });`;
        if(fw==='selenium')   return `    new Actions(driver).sendKeys(${v.includes('+') ? v.split('+').map(k=>'Keys.'+k.toUpperCase()).join(', ') : 'Keys.'+v.toUpperCase()}).perform();`;
        return `// ${step.action} ${v}`;
      case 'RIGHT_CLICK':
        if(fw==='playwright') return `  await page.click('${t}', { button: 'right' }); // ${step.text||''}`;
        if(fw==='cypress')    return `    ${cyGet(t)}.rightclick(); // ${step.text||''}`;
        if(fw==='selenium')   return `    new Actions(driver).contextClick(driver.findElement(${seBy(t)})).perform();`;
        return `// RIGHT_CLICK ${t}`;
      case 'REFRESH':
        if(fw==='playwright') return `  await page.reload();`;
        if(fw==='cypress')    return `    cy.reload();`;
        if(fw==='selenium')   return `    driver.navigate().refresh();`;
        return `// REFRESH`;
      case 'BACK':
        if(fw==='playwright') return `  await page.goBack();`;
        if(fw==='cypress')    return `    cy.go('back');`;
        if(fw==='selenium')   return `    driver.navigate().back();`;
        return `// BACK`;
      case 'FORWARD':
        if(fw==='playwright') return `  await page.goForward();`;
        if(fw==='cypress')    return `    cy.go('forward');`;
        if(fw==='selenium')   return `    driver.navigate().forward();`;
        return `// FORWARD`;
      default: return `  // ${step.action}: ${t}`;
    }
  };

  const stepsCode = steps.map(S).join('\n');
  const apiCode = nets.slice(0,5).map(n=>`  // 🌐 ${n.method} ${n.url} → ${n.status}`).join('\n');

  // Language templates
  if(fw==='playwright') {
    if(lang==='javascript') return `const { test, expect } = require('@playwright/test');
${hasRandom ? '\n'+rdHelpersJS : ''}
/**
 * Generated by WebAPI Automation Tool
 * Recording: ${name}
 * Steps: ${steps.length} | API calls: ${nets.length}
 * Generated: ${new Date().toLocaleString()}
 */
test('${name}', async ({ page }) => {
${stepsCode}
${apiCode?'\n'+apiCode:''}
});`;
    if(lang==='typescript') return `import { test, expect, Page } from '@playwright/test';
${hasRandom ? '\n'+rdHelpersJS : ''}
test('${name}', async ({ page }: { page: Page }) => {
${stepsCode}
});`;
    if(lang==='python') {
      const py = steps.map(s=>{
        const t=s.target, v=(s.value||'').replace(/"/g,'\\"');
        switch(s.action){
          case 'NAVIGATE_TO': return `    page.goto("${t}")`;
          case 'CLICK': return `    page.click("${t}")  # ${s.text||''}`;
          case 'DOUBLE_CLICK': return `    page.dblclick("${t}")  # ${s.text||''}`;
          case 'SEND_KEYS': {
            if (isRd(s.value)) {
              const vn = '_val' + (++_rdVarCount);
              if (s.id) _rdVarMap['step_' + s.id] = vn;
              return `    ${vn} = ${rdExprPy(s.value)}\n    page.fill("${t}", ${vn})`;
            }
            return `    page.fill("${t}", "${v}")`;
          }
          case 'CLEAR': return `    page.fill("${t}", "")`;
          case 'ASSERT_CHECK': {
            if (isVarRef(s.value)) {
              const ri = parseVarRef(s.value);
              const vn = ri !== null ? _rdVarMap['step_' + ri] : null;
              if (vn) return `    expect(page.locator("${t}")).to_contain_text(${vn})`;
            }
            return `    expect(page.locator("${t}")).to_contain_text("${v}")`;
          }
          case 'MOVE_TO_ELEMENT': case 'MOVE_TO_ELEMENT_WITHOUT_CLICK': return `    page.hover("${t}")  # ${s.text||''}`;
          case 'ENTER_KEY': return `    page.keyboard.press("Enter")`;
          case 'ESCAPE_KEY': return `    page.keyboard.press("Escape")`;
          case 'BACK_SPACE_KEY': return `    page.keyboard.press("Backspace")`;
          case 'CUT_COPY_PASTE_SELECTALL': case 'SHORTCUT_KEY': return `    page.keyboard.press("${v}")`;
          case 'RIGHT_CLICK': return `    page.click("${t}", button="right")  # ${s.text||''}`;
          case 'REFRESH': return `    page.reload()`;
          case 'BACK': return `    page.go_back()`;
          case 'FORWARD': return `    page.go_forward()`;
          default: return `    # ${s.action}: ${t}`;
        }
      }).join('\n');
      return `import pytest\nfrom playwright.sync_api import Page, expect\n${hasRandom ? '\n'+rdHelpersPy+'\n' : ''}\ndef test_${safe.toLowerCase()}(page: Page):\n    """${name} — ${new Date().toLocaleString()}"""\n\n${py}\n`;
    }
    if(lang==='java') {
      const jv = steps.map(s=>{
        switch(s.action){
          case 'NAVIGATE_TO': return `        page.navigate("${s.target}");`;
          case 'CLICK': return `        page.click("${s.target}");`;
          case 'DOUBLE_CLICK': return `        page.dblclick("${s.target}");`;
          case 'SEND_KEYS': {
            if (isRd(s.value)) {
              const vn = '_val' + (++_rdVarCount);
              if (s.id) _rdVarMap['step_' + s.id] = vn;
              return `        String ${vn} = ${rdExprJava(s.value)};\n        page.fill("${s.target}", ${vn});`;
            }
            return `        page.fill("${s.target}", "${s.value||''}");`;
          }
          case 'CLEAR': return `        page.fill("${s.target}", "");`;
          case 'ASSERT_CHECK': {
            if (isVarRef(s.value)) {
              const ri = parseVarRef(s.value);
              const vn = ri !== null ? _rdVarMap['step_' + ri] : null;
              if (vn) return `        assertThat(page.locator("${s.target}")).containsText(${vn});`;
            }
            return `        assertThat(page.locator("${s.target}")).containsText("${s.value||''}");`;
          }
          case 'MOVE_TO_ELEMENT': case 'MOVE_TO_ELEMENT_WITHOUT_CLICK': return `        page.hover("${s.target}");`;
          case 'ENTER_KEY': return `        page.keyboard().press("Enter");`;
          case 'ESCAPE_KEY': return `        page.keyboard().press("Escape");`;
          case 'BACK_SPACE_KEY': return `        page.keyboard().press("Backspace");`;
          case 'CUT_COPY_PASTE_SELECTALL': case 'SHORTCUT_KEY': return `        page.keyboard().press("${s.value||''}");`;
          case 'RIGHT_CLICK': return `        page.click("${s.target}", new Page.ClickOptions().setButton(MouseButton.RIGHT));`;
          default: return `        // ${s.action}`;
        }
      }).join('\n');
      return `import com.microsoft.playwright.*;\nimport static com.microsoft.playwright.assertions.PlaywrightAssertions.assertThat;\nimport org.junit.jupiter.api.Test;\n\nclass ${safe}Test {\n    @Test\n    void test${safe}() {\n        try (Playwright pw = Playwright.create()) {\n            Page page = pw.chromium().launch().newPage();\n${jv}\n        }\n    }\n}`;
    }
    if(lang==='csharp') {
      const cs = steps.map(s=>{
        switch(s.action){
          case 'NAVIGATE_TO': return `        await Page.GotoAsync("${s.target}");`;
          case 'CLICK': return `        await Page.ClickAsync("${s.target}");`;
          case 'DOUBLE_CLICK': return `        await Page.DblClickAsync("${s.target}");`;
          case 'SEND_KEYS': {
            if (isRd(s.value)) {
              const vn = '_val' + (++_rdVarCount);
              if (s.id) _rdVarMap['step_' + s.id] = vn;
              return `        var ${vn} = ${rdExprJS(s.value)};\n        await Page.FillAsync("${s.target}", ${vn});`;
            }
            return `        await Page.FillAsync("${s.target}", "${s.value||''}");`;
          }
          case 'CLEAR': return `        await Page.FillAsync("${s.target}", "");`;
          case 'ASSERT_CHECK': {
            if (isVarRef(s.value)) {
              const ri = parseVarRef(s.value);
              const vn = ri !== null ? _rdVarMap['step_' + ri] : null;
              if (vn) return `        await Expect(Page.Locator("${s.target}")).ToContainTextAsync(${vn});`;
            }
            return `        await Expect(Page.Locator("${s.target}")).ToContainTextAsync("${s.value||''}");`;
          }
          case 'MOVE_TO_ELEMENT': case 'MOVE_TO_ELEMENT_WITHOUT_CLICK': return `        await Page.HoverAsync("${s.target}");`;
          case 'ENTER_KEY': return `        await Page.Keyboard.PressAsync("Enter");`;
          case 'ESCAPE_KEY': return `        await Page.Keyboard.PressAsync("Escape");`;
          case 'BACK_SPACE_KEY': return `        await Page.Keyboard.PressAsync("Backspace");`;
          case 'CUT_COPY_PASTE_SELECTALL': case 'SHORTCUT_KEY': return `        await Page.Keyboard.PressAsync("${s.value||''}");`;
          case 'RIGHT_CLICK': return `        await Page.ClickAsync("${s.target}", new() { Button = MouseButton.Right });`;
          default: return `        // ${s.action}`;
        }
      }).join('\n');
      return `using Microsoft.Playwright.NUnit;\nusing NUnit.Framework;\n\n[TestFixture]\npublic class ${safe}Tests : PageTest {\n    [Test]\n    public async Task Test${safe}() {\n${cs}\n    }\n}`;
    }
  }

  if(fw==='cypress') {
    const body = steps.map(S).join('\n');
    if(lang==='typescript') return `${hasRandom ? rdHelpersJS+'\n' : ''}describe('${name}', () => {\n  it('recorded flow', () => {\n${body}\n  });\n});`;
    return `${hasRandom ? rdHelpersJS+'\n' : ''}describe('${name}', () => {\n  it('recorded flow', () => {\n${body}\n  });\n});`;
  }

  if(fw==='selenium') {
    // Python/Java Selenium helper: pick By strategy based on selector type
    function pyBy(sel) { return isXPath(sel) ? `By.XPATH, "${sel}"` : `By.CSS_SELECTOR, "${sel}"`; }
    function javaBy(sel) { return isXPath(sel) ? `By.xpath("${sel}")` : `By.cssSelector("${sel}")`; }

    if(lang==='python') {
      const py = steps.map(s=>{
        const t=s.target, v=s.value||'';
        switch(s.action){
          case 'NAVIGATE_TO': return `        self.driver.get("${t}")`;
          case 'CLICK': return `        self.driver.find_element(${pyBy(t)}).click()`;
          case 'DOUBLE_CLICK': return `        from selenium.webdriver.common.action_chains import ActionChains\n        ActionChains(self.driver).double_click(self.driver.find_element(${pyBy(t)})).perform()`;
          case 'SEND_KEYS': {
            if (isRd(s.value)) {
              const vn = '_val' + (++_rdVarCount);
              if (s.id) _rdVarMap['step_' + s.id] = vn;
              return `        ${vn} = ${rdExprPy(s.value)}\n        el = self.driver.find_element(${pyBy(t)})\n        el.clear(); el.send_keys(${vn})`;
            }
            return `        el = self.driver.find_element(${pyBy(t)})\n        el.clear(); el.send_keys("${v}")`;
          }
          case 'CLEAR': return `        self.driver.find_element(${pyBy(t)}).clear()`;
          case 'ASSERT_CHECK': {
            if (isVarRef(s.value)) {
              const ri = parseVarRef(s.value);
              const vn = ri !== null ? _rdVarMap['step_' + ri] : null;
              if (vn) return `        assert ${vn} in self.driver.find_element(${pyBy(t)}).text`;
            }
            return `        assert "${v}" in self.driver.find_element(${pyBy(t)}).text`;
          }
          case 'MOVE_TO_ELEMENT': case 'MOVE_TO_ELEMENT_WITHOUT_CLICK': return `        from selenium.webdriver.common.action_chains import ActionChains\n        ActionChains(self.driver).move_to_element(self.driver.find_element(${pyBy(t)})).perform()`;
          case 'ENTER_KEY': return `        from selenium.webdriver.common.keys import Keys\n        ActionChains(self.driver).send_keys(Keys.ENTER).perform()`;
          case 'ESCAPE_KEY': return `        from selenium.webdriver.common.keys import Keys\n        ActionChains(self.driver).send_keys(Keys.ESCAPE).perform()`;
          case 'BACK_SPACE_KEY': return `        from selenium.webdriver.common.keys import Keys\n        ActionChains(self.driver).send_keys(Keys.BACK_SPACE).perform()`;
          case 'CUT_COPY_PASTE_SELECTALL': case 'SHORTCUT_KEY': return `        from selenium.webdriver.common.keys import Keys\n        ActionChains(self.driver).send_keys(${v.includes('+') ? v.split('+').map(k=>'Keys.'+k.toUpperCase()).join(', ') : 'Keys.'+v.toUpperCase()}).perform()`;
          case 'RIGHT_CLICK': return `        from selenium.webdriver.common.action_chains import ActionChains\n        ActionChains(self.driver).context_click(self.driver.find_element(${pyBy(t)})).perform()`;
          case 'REFRESH': return `        self.driver.refresh()`;
          case 'BACK': return `        self.driver.back()`;
          case 'FORWARD': return `        self.driver.forward()`;
          default: return `        # ${s.action}`;
        }
      }).join('\n');
      return `import unittest\nfrom selenium import webdriver\nfrom selenium.webdriver.common.by import By\n${hasRandom ? '\n'+rdHelpersPy+'\n' : ''}\nclass ${safe}Test(unittest.TestCase):\n    def setUp(self):\n        self.driver = webdriver.Chrome()\n        self.driver.implicitly_wait(10)\n    def tearDown(self): self.driver.quit()\n\n    def test_flow(self):\n${py}\n\nif __name__ == '__main__': unittest.main()`;
    }
    if(lang==='java') {
      const jv = steps.map(s=>{
        switch(s.action){
          case 'NAVIGATE_TO': return `        driver.get("${s.target}");`;
          case 'CLICK': return `        driver.findElement(${javaBy(s.target)}).click();`;
          case 'DOUBLE_CLICK': return `        new org.openqa.selenium.interactions.Actions(driver).doubleClick(driver.findElement(${javaBy(s.target)})).perform();`;
          case 'SEND_KEYS': {
            if (isRd(s.value)) {
              const vn = '_val' + (++_rdVarCount);
              if (s.id) _rdVarMap['step_' + s.id] = vn;
              return `        String ${vn} = ${rdExprJava(s.value)};\n        driver.findElement(${javaBy(s.target)}).sendKeys(${vn});`;
            }
            return `        driver.findElement(${javaBy(s.target)}).sendKeys("${s.value||''}");`;
          }
          case 'CLEAR': return `        driver.findElement(${javaBy(s.target)}).clear();`;
          case 'MOVE_TO_ELEMENT': case 'MOVE_TO_ELEMENT_WITHOUT_CLICK': return `        new org.openqa.selenium.interactions.Actions(driver).moveToElement(driver.findElement(${javaBy(s.target)})).perform();`;
          case 'ENTER_KEY': return `        new org.openqa.selenium.interactions.Actions(driver).sendKeys(Keys.ENTER).perform();`;
          case 'ESCAPE_KEY': return `        new org.openqa.selenium.interactions.Actions(driver).sendKeys(Keys.ESCAPE).perform();`;
          case 'BACK_SPACE_KEY': return `        new org.openqa.selenium.interactions.Actions(driver).sendKeys(Keys.BACK_SPACE).perform();`;
          case 'CUT_COPY_PASTE_SELECTALL': case 'SHORTCUT_KEY': return `        new org.openqa.selenium.interactions.Actions(driver).sendKeys(${(s.value||'').includes('+') ? (s.value||'').split('+').map(k=>'Keys.'+k.toUpperCase()).join(', ') : 'Keys.'+(s.value||'').toUpperCase()}).perform();`;
          case 'RIGHT_CLICK': return `        new org.openqa.selenium.interactions.Actions(driver).contextClick(driver.findElement(${javaBy(s.target)})).perform();`;
          case 'REFRESH': return `        driver.navigate().refresh();`;
          case 'BACK': return `        driver.navigate().back();`;
          case 'FORWARD': return `        driver.navigate().forward();`;
          default: return `        // ${s.action}`;
        }
      }).join('\n');
      return `import org.junit.jupiter.api.*;\nimport org.openqa.selenium.*;\nimport org.openqa.selenium.chrome.ChromeDriver;\n\nclass ${safe}Test {\n    WebDriver driver;\n    @BeforeEach void setUp(){ driver = new ChromeDriver(); }\n    @AfterEach  void tearDown(){ driver.quit(); }\n\n    @Test void testFlow() {\n${jv}\n    }\n}`;
    }
    const seJs = steps.map(S).join('\n');
    return `const { Builder, By } = require('selenium-webdriver');\n${hasRandom ? '\n'+rdHelpersJS : ''}\ndescribe('${name}', function() {\n  let driver;\n  before(async () => { driver = await new Builder().forBrowser('chrome').build(); });\n  after(async  () => { await driver.quit(); });\n\n  it('flow', async function() {\n${seJs}\n  });\n});`;
  }

  return `// Framework "${fw}" / Language "${lang}"\n// Steps: ${steps.length}\n${stepsCode}`;
}

// ══════════════════════════════════════════════════
//  TEST PILL  (injected into tab during test replay)
// ══════════════════════════════════════════════════
function injectTestPill(name, totalSteps) {
  const PILL_ID = '__webapi_testpill';
  if (document.getElementById(PILL_ID)) return;
  const pill = document.createElement('div');
  pill.id = PILL_ID;
  pill.innerHTML = `
    <style>
      @keyframes __wt_spin{to{transform:rotate(360deg)}}
      #${PILL_ID}{position:fixed;top:12px;right:12px;z-index:2147483647;
        display:flex;align-items:center;gap:8px;
        background:linear-gradient(135deg,#0f172a,#1e3a5f);
        border:1px solid rgba(255,255,255,.15);border-radius:20px;
        padding:6px 14px;font:600 11px/1 -apple-system,system-ui,sans-serif;
        color:#fff;box-shadow:0 4px 20px rgba(0,0,0,.45);
        cursor:move;user-select:none}
      #${PILL_ID} .wt-spin{width:12px;height:12px;border:2px solid rgba(255,255,255,.2);
        border-top-color:#00d4aa;border-radius:50%;animation:__wt_spin .8s linear infinite;flex-shrink:0}
      #${PILL_ID} .wt-label{color:#00d4aa;font-size:10px;letter-spacing:.3px}
      #${PILL_ID} .wt-name{color:#e2e8f0;font-size:11px;max-width:160px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap}
      #${PILL_ID} .wt-prog{color:#9ca3af;font-size:10px;font-weight:400}
    </style>
    <span class="wt-spin" id="__wt_spin"></span>
    <span class="wt-label">RUNNING</span>
    <span class="wt-name">${name}</span>
    <span class="wt-prog" id="__wt_prog">0/${totalSteps}</span>`;
  document.body.appendChild(pill);
  // Make draggable
  let dx=0,dy=0,dr=false;
  pill.addEventListener('mousedown',e=>{dr=true;dx=e.clientX-pill.getBoundingClientRect().left;dy=e.clientY-pill.getBoundingClientRect().top;pill.style.cursor='grabbing';});
  document.addEventListener('mousemove',e=>{if(!dr)return;pill.style.right='auto';pill.style.left=(e.clientX-dx)+'px';pill.style.top=(e.clientY-dy)+'px';});
  document.addEventListener('mouseup',()=>{if(dr){dr=false;pill.style.cursor='move';}});
}

function removeTestPill() {
  const el = document.getElementById('__webapi_testpill');
  if (el) el.remove();
}

// ══════════════════════════════════════════════════
//  TEST RUNNER
// ══════════════════════════════════════════════════
async function runCase(c) {
  const t0  = Date.now();
  const res = { id:'run'+Date.now(), caseId:c.id, name:c.name, t0:new Date().toISOString(), steps:[] };

  try {
    if (c.type === 'API' || c.type === 'WEB_API') {
      // ── Real HTTP test ─────────────────────────────────────────────────────
      const d   = await chrome.storage.local.get('settings');
      const cfg = d.settings || {};
      const url = (c.apiUrl||'').startsWith('http') ? c.apiUrl : cfg.url + (c.apiUrl || '/health');
      const opts = {
        method:  c.method || 'GET',
        headers: { 'Content-Type':'application/json', 'x-api-key': cfg.key||'' },
        signal:  AbortSignal.timeout(15000)
      };
      if (c.method !== 'GET' && c.body) opts.body = c.body;
      const r    = await fetch(url, opts);
      let body   = '', json = null;
      try { body = await r.text(); json = JSON.parse(body); } catch {}
      const pass = r.status === (parseInt(c.expectedStatus) || 200);
      res.status = r.status; res.body = body; res.json = json;
      res.pass   = pass; res.ms = Date.now() - t0;
      res.error  = pass ? null : `Expected status ${c.expectedStatus}, got ${r.status}`;

    } else {
      // ── Web/recording replay ───────────────────────────────────────────────
      // Use raw recording steps if available (from _recordingSteps field)
      let rawSteps = c._recordingSteps;

      if (rawSteps && rawSteps.length > 0) {
        // Replay steps in the active tab using chrome.scripting
        const tabs     = await chrome.tabs.query({ active:true, currentWindow:true });
        const tab      = tabs[0];

        if (!tab) {
          res.pass  = false; res.ms = Date.now()-t0;
          res.error = 'No active tab — open the target page and try again';
        } else {
          // Resolve dynamic placeholders from current tab's session
          let _tabOrigin = '';
          try { _tabOrigin = new URL(tab.url).origin; } catch {}
          const _tabPortalM = (tab.url || '').match(/\/portal\/([^\/\#\?]+)/);
          const _tabPortal = _tabPortalM ? _tabPortalM[1] : '';
          const _tabProjM = (tab.url || '').match(/#(?:allprojects|project|zp\/projects|kanban|gantt)\/(\d{10,})/);
          const _tabProjectId = _tabProjM ? _tabProjM[1] : '';
          rawSteps = rawSteps.map(s => {
            const ns = { ...s };
            ['url', 'target'].forEach(k => {
              if (!ns[k]) return;
              if (_tabOrigin) ns[k] = ns[k].replace(/\{\{baseUrl\}\}/g, _tabOrigin);
              if (_tabPortal) ns[k] = ns[k].replace(/\{\{portal\}\}/g, _tabPortal);
              if (_tabProjectId) ns[k] = ns[k].replace(/\{\{projectId\}\}/g, _tabProjectId);
              // {{zpId:*}} left unresolved — replaySteps resolves them lazily from the live URL
            });
            return ns;
          });

          // Rewrite origin to match current tab (for legacy recordings without {{baseUrl}})
          let _rcRecOrigin = '';
          try { _rcRecOrigin = new URL(rawSteps[0]?.url || '').origin; } catch {}
          let _rcCurOrigin = '';
          try { _rcCurOrigin = new URL(tab.url).origin; } catch {}
          if (_rcRecOrigin && _rcCurOrigin && _rcRecOrigin !== _rcCurOrigin) {
            rawSteps = rawSteps.map(s => {
              const ns = { ...s };
              if (ns.url && ns.url.startsWith(_rcRecOrigin)) ns.url = _rcCurOrigin + ns.url.slice(_rcRecOrigin.length);
              if (ns.target && ns.action === 'NAVIGATE_TO' && ns.target.startsWith(_rcRecOrigin)) ns.target = _rcCurOrigin + ns.target.slice(_rcRecOrigin.length);
              return ns;
            });
          }

          // Environment URL substitution (overrides origin rewrite if active env is set)
          const d2 = await chrome.storage.local.get('settings');
          const envs = (d2.settings || {}).zpEnvironments || [];
          const activeEnv = envs.find(e => e.active) || null;
          if (activeEnv && activeEnv.url) {
            const stepOrigin = (() => { try { return new URL(rawSteps[0]?.url || '').origin; } catch { return ''; } })();
            if (stepOrigin && activeEnv.url !== stepOrigin) {
              rawSteps = rawSteps.map(s => {
                const ns = { ...s };
                if (ns.url && ns.url.startsWith(stepOrigin)) ns.url = activeEnv.url + ns.url.slice(stepOrigin.length);
                if (ns.target && ns.action === 'NAVIGATE_TO' && ns.target.startsWith(stepOrigin)) ns.target = activeEnv.url + ns.target.slice(stepOrigin.length);
                return ns;
              });
            }
          }

          let startUrl = c.webUrl || rawSteps[0]?.url || '';
          // Resolve any remaining {{zpId:*}} in the start URL
          if (startUrl.includes('{{zpId:')) {
            const _moduleMatch = startUrl.match(/(.*?\/(?:tasks|issues|bugs|milestones|forums))\b/);
            if (_moduleMatch) {
              startUrl = _moduleMatch[1];
            }
          }
          startUrl = startUrl.replace(/\{\{zpId:(\d+)\}\}/g, '$1');

          // Stop inspect mode and hide all overlays before replay
          try {
            await chrome.tabs.sendMessage(tab.id, {type:'STOP_INSPECT'});
          } catch {}
          await chrome.scripting.executeScript({
            target: { tabId: tab.id },
            func: () => {
              if (window.__WEBAPI_API) {
                if (window.__WEBAPI_API.stopInspect) window.__WEBAPI_API.stopInspect();
                window.__WEBAPI_API.hideHighlight();
                window.__WEBAPI_API.hideLocatorPanel();
              }
              document.body.style.cursor = '';
            }
          }).catch(()=>{});

          // Show test-running pill on the page
          const safeName = (c.name || 'Test').replace(/[`$\\"]/g, '');
          await chrome.scripting.executeScript({
            target: { tabId: tab.id },
            func: injectTestPill,
            args: [safeName, rawSteps.length]
          }).catch(()=>{});

          // Navigate to start URL first
          if (startUrl && startUrl !== tab.url) {
            await chrome.tabs.update(tab.id, { url: startUrl });
            await new Promise(r => setTimeout(r, 1500)); // wait for load
          }

          // Inject and run the replay script
          const _rdCfg1 = { emailDomain: (d2.settings||{}).randomEmailDomain || '@test.com', phonePrefix: (d2.settings||{}).randomPhonePrefix || '+1-555-' };
          const result = await chrome.scripting.executeScript({
            target: { tabId: tab.id },
            func: replaySteps,
            args: [rawSteps, _rdCfg1]
          });

          const replayResult = result?.[0]?.result || {};
          res.pass  = replayResult.pass !== false;
          res.ms    = Date.now() - t0;
          res.note  = replayResult.note || ('Replayed ' + rawSteps.length + ' steps in ' + (new URL(startUrl||'http://x').hostname));
          res.error = replayResult.error || null;
          res.steps = replayResult.steps || [];

          // Remove test pill from page
          await chrome.scripting.executeScript({
            target: { tabId: tab.id },
            func: removeTestPill
          }).catch(()=>{});
        }
      } else {
        // No raw steps — report clearly instead of faking a random result
        res.pass  = false; res.ms = Date.now()-t0;
        res.note  = 'No recorded steps attached to this test. Open the recording in Library and click ▶ Run, or re-record the flow.';
        res.error = null;
      }
    }
  } catch(e) {
    res.pass = false; res.ms = Date.now()-t0; res.error = e.message;
  }

  res.tf = new Date().toISOString();

  // Persist pass/fail back onto the case
  const d  = await chrome.storage.local.get('cases');
  const cs = d.cases || [];
  const ci = cs.findIndex(x => x.id === c.id);
  if (ci >= 0) {
    cs[ci].lastRun = res.pass ? 'pass' : 'fail';
    cs[ci].lastMs  = res.ms;
    await chrome.storage.local.set({ cases: cs });
  }
  await saveResult(res);

  // Open popup after test completes so user sees the result
  // Store result for popup to pick up immediately
  await chrome.storage.local.set({ lastTestResult: { res, caseName: c.name, caseId: c.id } });
  try { await chrome.action.openPopup(); } catch {}

  return res;
}

// Injected into the tab to replay recorded steps
function replaySteps(steps, rdCfg) {
  return (async () => {
    // Attach runtime config so resolveValue can access it
    steps.__rdCfg = rdCfg || {};
    const log = [];
    let errMsg = null;

    // Resolve dynamic placeholders from the current session
    const _baseUrl = location.origin;
    const _href = location.href;
    const _portalM = _href.match(/\/portal\/([^\/\#\?]+)/);
    const _portal = _portalM ? _portalM[1] : '';
    const _projM = _href.match(/#(?:allprojects|project|zp\/projects|kanban|gantt)\/(\d{10,})/);
    const _projectId = _projM ? _projM[1] : '';

    for (let i = 0; i < steps.length; i++) {
      const s = steps[i];
      if (s && typeof s === 'object') {
        ['url', 'target'].forEach(k => {
          if (!s[k]) return;
          s[k] = s[k].replace(/\{\{baseUrl\}\}/g, _baseUrl);
          if (_portal) s[k] = s[k].replace(/\{\{portal\}\}/g, _portal);
          if (_projectId) s[k] = s[k].replace(/\{\{projectId\}\}/g, _projectId);
          // NOTE: {{zpId:*}} is NOT resolved here — it is resolved lazily before each step
          // so that entity IDs (task, issue, bug) created during replay can be picked up from the live URL
        });
      }
    }

    // Lazy zpId resolver: resolves {{zpId:*}} placeholders using the CURRENT live URL.
    // Called right before each step executes, so entity IDs created during replay are used.
    function _resolveLiveIds(s) {
      if (!s || typeof s !== 'object') return;
      const liveHref = location.href;

      ['url', 'target'].forEach(k => {
        if (!s[k] || !s[k].includes('{{zpId:')) return;
        // For each {{zpId:originalId}}, look at the URL segment BEFORE it to find what kind of ID it is
        // e.g. "custom-view/{{zpId:123}}" → find "custom-view/DIGITS" in the live URL
        // e.g. "task-detail/{{zpId:456}}" → find "task-detail/DIGITS" in the live URL
        s[k] = s[k].replace(/([\/\-])(\{\{zpId:(\d+)\}\})/g, (match, sep, placeholder, origId) => {
          // Get the path segment before this ID
          const beforeIdx = s[k].lastIndexOf('/', s[k].indexOf(placeholder) - 1);
          const segment = s[k].substring(beforeIdx + 1, s[k].indexOf(placeholder));
          // Clean up the segment name (e.g. "task-detail/", "custom-view/")
          const segName = segment.replace(/\/$/, '');

          if (segName) {
            // Search for this same segment in the live URL followed by a numeric ID
            const liveMatch = liveHref.match(new RegExp(segName.replace(/[.*+?^${}()|[\]\\]/g, '\\$&') + '/(\\d{10,})'));
            if (liveMatch) {
              return sep + liveMatch[1];
            }
          }
          // Fallback: restore original ID
          return sep + origId;
        });
        // Handle any remaining {{zpId:*}} not preceded by a segment separator (e.g. at start of hash)
        s[k] = s[k].replace(/\{\{zpId:(\d+)\}\}/g, '$1');
      });
    }

    function sel(selector, step) {
      // Helper: evaluate XPath on a given root document
      function xpathFind(root, xpath) {
        try {
          const result = root.evaluate(xpath, root, null, XPathResult.FIRST_ORDERED_NODE_TYPE, null);
          return result.singleNodeValue;
        } catch(e) { return null; }
      }

      // Helper: querySelector with error handling
      function cssFind(root, css) {
        try { return root.querySelector(css); } catch(e) { return null; }
      }

      // Determine if selector is XPath (starts with / or //)
      const isXPath = selector.startsWith('/');

      // Pick the right finder based on selector type
      const find = isXPath ? xpathFind : cssFind;

      // Handle Playwright-style :has-text() pseudo-selector (not valid CSS)
      if (!isXPath) {
        const hasTextMatch = selector.match(/^(.+?):has-text\("(.+?)"\)$/);
        if (hasTextMatch) {
          const cssBase = hasTextMatch[1];
          const searchText = hasTextMatch[2];
          function findByText(root) {
            try {
              const candidates = root.querySelectorAll(cssBase);
              for (const c of candidates) {
                if ((c.textContent || '').trim().includes(searchText)) return c;
              }
            } catch(e) {}
            return null;
          }
          if (step && step.iframe && step.iframeSelector) {
            const iframe = cssFind(document, step.iframeSelector);
            if (iframe && iframe.contentDocument) {
              const r = findByText(iframe.contentDocument);
              if (r) return r;
            }
          }
          const topResult = findByText(document);
          if (topResult) return topResult;
          const iframes = document.querySelectorAll('iframe');
          for (const f of iframes) {
            try {
              if (f.contentDocument) { const r = findByText(f.contentDocument); if (r) return r; }
            } catch(e) {}
          }
          return null;
        }
      }

      // XPath contains(text(),...) is already handled natively by document.evaluate

      // If the step came from an iframe, search inside that iframe's document
      if (step && step.iframe && step.iframeSelector) {
        const iframe = cssFind(document, step.iframeSelector);
        if (iframe && iframe.contentDocument) {
          return find(iframe.contentDocument, selector);
        }
        const iframes = document.querySelectorAll('iframe');
        for (const f of iframes) {
          try {
            const found = f.contentDocument && find(f.contentDocument, selector);
            if (found) return found;
          } catch(e) {}
        }
      }
      // Try top-level first
      const topEl = find(document, selector);
      if (topEl) return topEl;
      // Fallback: search all iframes even if step doesn't have iframe flag
      const iframes = document.querySelectorAll('iframe');
      for (const f of iframes) {
        try {
          const found = f.contentDocument && find(f.contentDocument, selector);
          if (found) return found;
        } catch(e) {}
      }
      return null;
    }

    function wait(ms) {
      return new Promise(r => setTimeout(r, ms));
    }

    // Resolve {{random:type:len}} placeholders at execution time
    const _xssPayloads = [
      '<script>alert(1)</script>',
      '<img src=x onerror=alert(1)>',
      '<svg onload=alert(1)>',
      '\"><script>alert(1)</script>',
      "'-alert(1)-'",
      '<body onload=alert(1)>',
      '<iframe src=\"javascript:alert(1)\">',
      '<input onfocus=alert(1) autofocus>',
      '{{constructor.constructor(\"alert(1)\")()}}',
      '<details open ontoggle=alert(1)>',
      '<marquee onstart=alert(1)>',
      'javascript:alert(document.cookie)',
      '\"><img src=x onerror=alert(document.domain)>',
      '<math><mtext><table><mglyph><svg><mtext><textarea><path id=x style=d:expression(alert(1))>',
      'data:text/html,<script>alert(1)</script>'
    ];
    // ── Variable store: correlates random values across steps ──
    const _varStore = {};

    function _randStr(n) {
      const c = 'abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ';
      let r = ''; for (let i = 0; i < n; i++) r += c[Math.floor(Math.random()*c.length)];
      return r;
    }
    function _randNum(n) {
      let r = ''; for (let i = 0; i < n; i++) r += Math.floor(Math.random()*10);
      if (r[0]==='0' && n>1) r = (Math.floor(Math.random()*9)+1) + r.slice(1);
      return r;
    }

    // ── Zoho-aware random data generators ──
    const _ZP_TASK_PREFIXES = ['Task','Item','Work','Todo','Story','Ticket'];
    const _ZP_BUG_PREFIXES  = ['Bug','Defect','Issue','Error','Fault'];
    const _ZP_PROJECT_PREFIXES = ['Project','Sprint','Release','Module'];
    const _ZP_FIRST_NAMES = ['Alice','Bob','Carol','Dave','Eve','Frank','Grace','Henry','Ivy','Jack','Kara','Leo','Mia','Nora','Oscar','Paul','Quinn','Rita','Sam','Tina'];
    const _ZP_LAST_NAMES  = ['Smith','Jones','Brown','Wilson','Taylor','Clark','Hall','Adams','Young','King','Wright','Green','Baker','Hill','Scott','Lee','Mitchell'];

    function _randTaskName() {
      return _ZP_TASK_PREFIXES[Math.floor(Math.random()*_ZP_TASK_PREFIXES.length)] + '_Auto_' + _randStr(6) + '_' + _randNum(4);
    }
    function _randBugName() {
      return _ZP_BUG_PREFIXES[Math.floor(Math.random()*_ZP_BUG_PREFIXES.length)] + '_Auto_' + _randStr(6) + '_' + _randNum(4);
    }
    function _randProjectName() {
      return _ZP_PROJECT_PREFIXES[Math.floor(Math.random()*_ZP_PROJECT_PREFIXES.length)] + '_Auto_' + _randStr(5) + '_' + _randNum(3);
    }
    function _randUsername() {
      return _ZP_FIRST_NAMES[Math.floor(Math.random()*_ZP_FIRST_NAMES.length)] + ' ' + _ZP_LAST_NAMES[Math.floor(Math.random()*_ZP_LAST_NAMES.length)];
    }
    function _randPhone() {
      return (steps.__rdCfg?.phonePrefix || '+1-555-') + _randNum(3) + '-' + _randNum(4);
    }
    function _randDate(mode) {
      const now = Date.now();
      const day = 86400000;
      if (mode === 'past') { const d = new Date(now - Math.floor(Math.random()*90)*day); return d.toISOString().slice(0,10); }
      if (mode === 'future') { const d = new Date(now + Math.floor(Math.random()*90+1)*day); return d.toISOString().slice(0,10); }
      const d = new Date(now + Math.floor(Math.random()*180-90)*day); return d.toISOString().slice(0,10);
    }
    function _randUUID() {
      return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, c => {
        const r = Math.random()*16|0; return (c==='x' ? r : (r&0x3|0x8)).toString(16);
      });
    }
    function _randTimestamp() { return '' + Date.now(); }
    function _randComment() {
      const a = ['Verified','Reviewed','Updated','Checked','Tested','Approved','Confirmed','Noted'];
      const c = ['the changes','this item','the implementation','the fix','the feature','the update','the requirements'];
      return a[Math.floor(Math.random()*a.length)] + ' ' + c[Math.floor(Math.random()*c.length)] + ' — Auto_' + _randStr(6);
    }
    function _randTasklistName() {
      const p = ['Tasklist','Module','Phase','Feature','Component','Sprint'];
      return p[Math.floor(Math.random()*p.length)] + '_Auto_' + _randStr(5) + '_' + _randNum(3);
    }

    function resolveValue(v) {
      if (!v) return v;
      // Resolve {{var:step_N}} references from variable store
      if (v.startsWith('{{var:') && v.endsWith('}}')) {
        const varName = v.slice(6, -2);
        return _varStore[varName] !== undefined ? _varStore[varName] : v;
      }
      if (!v.startsWith('{{random:') || !v.endsWith('}}')) return v;
      const m = v.match(/^\{\{random:(\w+)(?::([\w]+))?\}\}$/);
      if (!m) return v;
      const type = m[1], param = m[2];
      const len = param ? parseInt(param) : NaN;
      if (type === 'string')      return _randStr(isNaN(len) ? 10 : len);
      if (type === 'number')      return _randNum(isNaN(len) ? 5 : len);
      if (type === 'email') {
        const c = 'abcdefghijklmnopqrstuvwxyz';
        let r = ''; for (let i = 0; i < 8; i++) r += c[Math.floor(Math.random()*c.length)];
        return r + (steps.__rdCfg?.emailDomain || '@test.com');
      }
      if (type === 'paragraph') {
        const words = ['the','quick','brown','fox','jumps','over','lazy','dog','lorem','ipsum','dolor','sit','amet','testing','automation','quality','software','web','browser','data','input','form','field','check','verify'];
        let r = '';
        const n = isNaN(len) ? 100 : len;
        while (r.length < n) { r += words[Math.floor(Math.random()*words.length)] + ' '; }
        return r.slice(0, n);
      }
      if (type === 'xss')         return _xssPayloads[isNaN(len) ? 0 : len] || _xssPayloads[0];
      // Zoho Projects aware types
      if (type === 'taskname')    return _randTaskName();
      if (type === 'bugname')     return _randBugName();
      if (type === 'projectname') return _randProjectName();
      if (type === 'username')    return _randUsername();
      if (type === 'phone')       return _randPhone();
      if (type === 'date')        return _randDate(param || 'any');
      if (type === 'uuid')        return _randUUID();
      if (type === 'timestamp')   return _randTimestamp();
      if (type === 'comment')     return _randComment();
      if (type === 'tasklistname') return _randTasklistName();
      return v;
    }

    async function waitForEl(selector, step, timeoutMs) {
      const deadline = Date.now() + (timeoutMs || 10000);
      let el = sel(selector, step);
      while (!el && Date.now() < deadline) {
        await wait(300);
        el = sel(selector, step);
      }
      return el;
    }

    async function tryStep(s) {
      const skipWait = ['NAVIGATE_TO','REFRESH','BACK','FORWARD','CLOSE','QUIT','DEFAULT_FRAME','GET_CURRENT_URL','GET_TITLE','GET_PAGE_SOURCE','CUSTOM_JS'];

      // Skip auto-navigations that were triggered by a preceding CLICK
      // The click already caused the SPA navigation; replaying the NAVIGATE_TO would try to go to a URL with stale entity IDs
      if (s.action === 'NAVIGATE_TO' && s.autoNav) {
        // Wait for the natural click-triggered navigation to settle
        await wait(800);
        return;
      }

      const el = !skipWait.includes(s.action) ? await waitForEl(s.target, s, 10000) : null;

      // Helper for keyboard replay
      function parseKeyCombo(combo) {
        const parts = (combo || '').split('+');
        const mainKey = parts[parts.length - 1];
        const mods = { ctrlKey: false, altKey: false, shiftKey: false, metaKey: false };
        for (let p = 0; p < parts.length - 1; p++) {
          const m = parts[p].toLowerCase();
          if (m === 'control') { mods.ctrlKey = true; mods.metaKey = true; }
          if (m === 'alt') mods.altKey = true;
          if (m === 'shift') mods.shiftKey = true;
        }
        return { mainKey, mods };
      }

      switch (s.action) {
        case 'NAVIGATE_TO':
          if (location.href !== s.target) {
            location.href = s.target;
            await wait(1200);
          }
          break;
        case 'REFRESH':
          location.reload();
          await wait(1200);
          break;
        case 'BACK':
          history.back();
          await wait(800);
          break;
        case 'FORWARD':
          history.forward();
          await wait(800);
          break;
        case 'CLICK':
          if (!el) throw new Error('Element not found: ' + s.target);
          // If element is hidden (inside a CSS :hover-revealed container), reveal it first
          {
            const _cs = getComputedStyle(el);
            if (el.offsetWidth === 0 || _cs.display === 'none' || _cs.visibility === 'hidden' || _cs.opacity === '0') {
              const _hc = [el]; let _p = el.parentElement;
              for (let _i = 0; _i < 5 && _p; _i++) { _hc.push(_p); _p = _p.parentElement; }
              _hc.forEach(h => h.classList.add('__webapi_hover'));
              if (!document.getElementById('__webapi_hover_style')) {
                const _hs = document.createElement('style'); _hs.id = '__webapi_hover_style';
                _hs.textContent = `
                  .twoway-wrapper.__webapi_hover .twoway-back, .__webapi_hover > .twoway-back,
                  .twoway-wrapper:hover .twoway-back { display:block!important; visibility:visible!important; opacity:1!important; pointer-events:auto!important; }
                  .__webapi_hover>[class*="dropdown"], .__webapi_hover>[class*="menu"],
                  .__webapi_hover [class*="hover-show"], .__webapi_hover [class*="on-hover"] { display:block!important; visibility:visible!important; opacity:1!important; }
                `;
                document.head.appendChild(_hs);
              }
              await wait(100);
              setTimeout(() => { _hc.forEach(h => h.classList.remove('__webapi_hover')); }, 3000);
            }
          }
          el.scrollIntoView({ behavior:'smooth', block:'center' });
          await wait(150);
          el.click();
          await wait(300);
          break;
        case 'DOUBLE_CLICK':
          if (!el) throw new Error('Element not found: ' + s.target);
          el.scrollIntoView({ behavior:'smooth', block:'center' });
          await wait(150);
          el.dispatchEvent(new MouseEvent('dblclick', { bubbles:true, cancelable:true }));
          await wait(300);
          break;
        case 'RIGHT_CLICK':
          if (!el) throw new Error('Element not found: ' + s.target);
          el.scrollIntoView({ behavior:'smooth', block:'center' });
          await wait(200);
          el.dispatchEvent(new MouseEvent('contextmenu', { bubbles:true, cancelable:true, button:2 }));
          await wait(200);
          break;
        case 'SEND_KEYS':
          if (!el) throw new Error('Element not found: ' + s.target);
          el.focus();
          const _tv = resolveValue(s.value || '');
          // Store resolved value in variable store for later ASSERT_CHECK correlation
          if (s.value && s.value.startsWith('{{random:') && s.id) {
            _varStore['step_' + s.id] = _tv;
          }
          if (s.contenteditable || (el.getAttribute && el.getAttribute('contenteditable') === 'true') || el.isContentEditable) {
            el.innerText = _tv;
            el.dispatchEvent(new Event('input', { bubbles:true }));
          } else {
            // Use native property setter to bypass framework value interception (React, Lyte, Angular, etc.)
            const _proto = el instanceof HTMLTextAreaElement ? HTMLTextAreaElement.prototype : HTMLInputElement.prototype;
            const nativeSetter = Object.getOwnPropertyDescriptor(_proto, 'value')?.set;
            if (nativeSetter) {
              nativeSetter.call(el, _tv);
            } else {
              el.value = _tv;
            }
            el.dispatchEvent(new Event('input', { bubbles:true }));
            el.dispatchEvent(new Event('change', { bubbles:true }));
          }
          await wait(150);
          break;
        case 'CLEAR':
          if (!el) throw new Error('Element not found: ' + s.target);
          el.focus();
          if (el.isContentEditable || (el.getAttribute && el.getAttribute('contenteditable') === 'true')) {
            el.innerText = '';
            el.dispatchEvent(new Event('input', { bubbles:true }));
          } else {
            const _clearProto = el instanceof HTMLTextAreaElement ? HTMLTextAreaElement.prototype : HTMLInputElement.prototype;
            const _clearSetter = Object.getOwnPropertyDescriptor(_clearProto, 'value')?.set;
            if (_clearSetter) {
              _clearSetter.call(el, '');
            } else {
              el.value = '';
            }
            el.dispatchEvent(new Event('input', { bubbles:true }));
            el.dispatchEvent(new Event('change', { bubbles:true }));
          }
          await wait(100);
          break;
        case 'ASSERT_CHECK': {
          if (!el) throw new Error('Assert target not found: ' + s.target);
          const _av = resolveValue(s.value || '');
          const _txt = (el.textContent || '').trim();
          if (!_txt.includes(_av)) {
            throw new Error('Assert failed: expected "' + _av + '" but found "' + _txt.slice(0,80) + '" in ' + s.target);
          }
          break;
        }
        case 'GET_TEXT':
          if (!el) throw new Error('Element not found: ' + s.target);
          // Store text for later use
          s._result = (el.innerText || el.textContent || '').trim();
          break;
        case 'GET_ATTRIBUTE':
          if (!el) throw new Error('Element not found: ' + s.target);
          s._result = el.getAttribute(s.value || '') || '';
          break;
        case 'GET_ELEMENT_SIZE':
          if (!el) throw new Error('Element not found: ' + s.target);
          const rect = el.getBoundingClientRect();
          s._result = { width: Math.round(rect.width), height: Math.round(rect.height) };
          break;
        case 'IS_DISPLAYED':
          if (!el) throw new Error('Element not found: ' + s.target);
          s._result = !!(el.offsetWidth || el.offsetHeight || el.getClientRects().length);
          break;
        case 'IS_ENABLED':
          if (!el) throw new Error('Element not found: ' + s.target);
          s._result = !el.disabled;
          break;
        case 'IS_SELECTED':
          if (!el) throw new Error('Element not found: ' + s.target);
          s._result = el.checked || el.selected || false;
          break;
        case 'GET_CLASS':
          if (!el) throw new Error('Element not found: ' + s.target);
          s._result = el.className || '';
          break;
        case 'GET_CURRENT_URL':
          s._result = location.href;
          break;
        case 'GET_TITLE':
          s._result = document.title;
          break;
        case 'GET_PAGE_SOURCE':
          s._result = document.documentElement.outerHTML;
          break;
        case 'SCROLL_TO_ELEMENT': {
          const maxAttempts = s.scrollAttempts || 20;
          const timeout = s.scrollTimeout || 10000;
          const interval = Math.max(200, Math.floor(timeout / maxAttempts));
          let found = el;
          if (!found) {
            for (let a = 0; a < maxAttempts; a++) {
              found = sel(s.target, s);
              if (found) break;
              if (s.iframe && s.iframeSelector) {
                const iframe = document.querySelector(s.iframeSelector);
                if (iframe && iframe.contentWindow) {
                  iframe.contentWindow.scrollBy(0, 300);
                } else {
                  window.scrollBy(0, 300);
                }
              } else {
                window.scrollBy(0, 300);
              }
              await wait(interval);
            }
          }
          if (!found) throw new Error('SCROLL_TO_ELEMENT: not found after ' + maxAttempts + ' attempts: ' + s.target);
          found.scrollIntoView({ behavior:'smooth', block:'center' });
          await wait(400);
          break;
        }
        case 'SCROLL_TO_ELEMENT_AND_CLICK': {
          const maxAttempts2 = s.scrollAttempts || 20;
          const timeout2 = s.scrollTimeout || 10000;
          const interval2 = Math.max(200, Math.floor(timeout2 / maxAttempts2));
          let found2 = el;
          if (!found2) {
            for (let a = 0; a < maxAttempts2; a++) {
              found2 = sel(s.target, s);
              if (found2) break;
              window.scrollBy(0, 300);
              await wait(interval2);
            }
          }
          if (!found2) throw new Error('SCROLL_TO_ELEMENT_AND_CLICK: not found: ' + s.target);
          found2.scrollIntoView({ behavior:'smooth', block:'center' });
          await wait(300);
          found2.click();
          await wait(300);
          break;
        }
        case 'MOVE_TO_ELEMENT':
        case 'MOVE_TO_ELEMENT_WITHOUT_CLICK': {
          if (!el) throw new Error('Element not found: ' + s.target);
          el.scrollIntoView({ behavior:'smooth', block:'center' });
          await wait(200);

          // Inject CSS :hover simulation — dispatched events don't trigger CSS :hover pseudo-class.
          // Walk up to the nearest interactive container and apply a temporary __hover class.
          // Also inject a style rule that mirrors :hover rules for .twoway-wrapper and similar patterns.
          const _hoverTargets = [el];
          let _hp = el.parentElement;
          for (let _hi = 0; _hi < 4 && _hp; _hi++) { _hoverTargets.push(_hp); _hp = _hp.parentElement; }
          _hoverTargets.forEach(ht => ht.classList.add('__webapi_hover'));

          // Inject mirror style: make __webapi_hover behave like :hover for common Zoho patterns
          let _hoverStyle = document.getElementById('__webapi_hover_style');
          if (!_hoverStyle) {
            _hoverStyle = document.createElement('style');
            _hoverStyle.id = '__webapi_hover_style';
            _hoverStyle.textContent = `
              .twoway-wrapper.__webapi_hover .twoway-back,
              .__webapi_hover > .twoway-back,
              .twoway-wrapper:hover .twoway-back { display: block !important; visibility: visible !important; opacity: 1 !important; pointer-events: auto !important; }
              .__webapi_hover > [class*="dropdown"], .__webapi_hover > [class*="menu"],
              .__webapi_hover [class*="hover-show"], .__webapi_hover [class*="on-hover"] { display: block !important; visibility: visible !important; opacity: 1 !important; }
            `;
            document.head.appendChild(_hoverStyle);
          }

          // Also dispatch mouse events for JS-based hover listeners
          el.dispatchEvent(new MouseEvent('mouseenter', { bubbles:true, cancelable:true }));
          el.dispatchEvent(new MouseEvent('mouseover', { bubbles:true, cancelable:true }));
          el.dispatchEvent(new MouseEvent('mousemove', { bubbles:true, cancelable:true }));
          await wait(600);

          if (s.action === 'MOVE_TO_ELEMENT') {
            el.click();
            await wait(300);
          }
          // Clean up hover class after a delay (keep it long enough for next step to click revealed element)
          setTimeout(() => { _hoverTargets.forEach(ht => ht.classList.remove('__webapi_hover')); }, 3000);
          break;
        }
        case 'MOVE_BY_OFFSET': {
          const ox = parseInt(s.value?.split(',')[0]) || 0;
          const oy = parseInt(s.value?.split(',')[1]) || 0;
          const target = el || document.elementFromPoint(ox, oy);
          if (target) {
            target.dispatchEvent(new MouseEvent('mousemove', { clientX:ox, clientY:oy, bubbles:true }));
          }
          await wait(200);
          break;
        }
        case 'ENTER_KEY': {
          const target_e = el || document.activeElement || document.body;
          target_e.dispatchEvent(new KeyboardEvent('keydown', { key:'Enter', code:'Enter', keyCode:13, bubbles:true, cancelable:true }));
          if (target_e.tagName === 'BUTTON' || target_e.tagName === 'A' || target_e.getAttribute('role') === 'button') {
            target_e.click();
          } else if (target_e.form) {
            target_e.form.requestSubmit ? target_e.form.requestSubmit() : target_e.form.submit();
          } else if (target_e.tagName === 'INPUT') {
            target_e.click();
          }
          target_e.dispatchEvent(new KeyboardEvent('keyup', { key:'Enter', code:'Enter', keyCode:13, bubbles:true }));
          await wait(150);
          break;
        }
        case 'ESCAPE_KEY': {
          const target_esc = el || document.activeElement || document.body;
          target_esc.dispatchEvent(new KeyboardEvent('keydown', { key:'Escape', code:'Escape', keyCode:27, bubbles:true, cancelable:true }));
          target_esc.blur();
          target_esc.dispatchEvent(new KeyboardEvent('keyup', { key:'Escape', code:'Escape', keyCode:27, bubbles:true }));
          await wait(150);
          break;
        }
        case 'BACK_SPACE_KEY': {
          const target_bs = el || document.activeElement || document.body;
          const mainK = (s.value || 'Backspace').includes('Delete') ? 'Delete' : 'Backspace';
          if (target_bs.tagName === 'INPUT' || target_bs.tagName === 'TEXTAREA') {
            target_bs.dispatchEvent(new KeyboardEvent('keydown', { key:mainK, bubbles:true, cancelable:true }));
            const start = target_bs.selectionStart || 0;
            const end = target_bs.selectionEnd || 0;
            const val = target_bs.value || '';
            if (start !== end) {
              target_bs.value = val.slice(0, start) + val.slice(end);
              target_bs.selectionStart = target_bs.selectionEnd = start;
            } else if (mainK === 'Backspace' && start > 0) {
              target_bs.value = val.slice(0, start - 1) + val.slice(start);
              target_bs.selectionStart = target_bs.selectionEnd = start - 1;
            } else if (mainK === 'Delete' && start < val.length) {
              target_bs.value = val.slice(0, start) + val.slice(start + 1);
              target_bs.selectionStart = target_bs.selectionEnd = start;
            }
            target_bs.dispatchEvent(new Event('input', { bubbles:true }));
            target_bs.dispatchEvent(new KeyboardEvent('keyup', { key:mainK, bubbles:true }));
          } else {
            target_bs.dispatchEvent(new KeyboardEvent('keydown', { key:mainK, bubbles:true, cancelable:true }));
            target_bs.dispatchEvent(new KeyboardEvent('keyup', { key:mainK, bubbles:true }));
          }
          await wait(150);
          break;
        }
        case 'CUT_COPY_PASTE_SELECTALL': {
          const { mainKey: ck, mods: cmods } = parseKeyCombo(s.value);
          const target_ccp = el || document.activeElement || document.body;
          target_ccp.dispatchEvent(new KeyboardEvent('keydown', { key:ck, bubbles:true, cancelable:true, ...cmods }));
          if (ck === 'a' && cmods.ctrlKey && target_ccp.select) target_ccp.select();
          target_ccp.dispatchEvent(new KeyboardEvent('keyup', { key:ck, bubbles:true, ...cmods }));
          await wait(150);
          break;
        }
        case 'SHORTCUT_KEY': {
          const { mainKey: sk, mods: smods } = parseKeyCombo(s.value);
          const target_sk = el || document.activeElement || document.body;
          if (sk === 'Tab') {
            target_sk.dispatchEvent(new KeyboardEvent('keydown', { key:'Tab', code:'Tab', keyCode:9, bubbles:true, cancelable:true, ...smods }));
            const focusable = Array.from(document.querySelectorAll('a[href],button:not([disabled]),input:not([disabled]),select:not([disabled]),textarea:not([disabled]),[tabindex]:not([tabindex="-1"])'));
            const idx = focusable.indexOf(target_sk);
            if (idx !== -1) {
              const next = smods.shiftKey ? focusable[idx - 1] || focusable[focusable.length - 1] : focusable[idx + 1] || focusable[0];
              if (next) next.focus();
            }
            target_sk.dispatchEvent(new KeyboardEvent('keyup', { key:'Tab', code:'Tab', keyCode:9, bubbles:true, ...smods }));
          } else {
            target_sk.dispatchEvent(new KeyboardEvent('keydown', { key:sk, bubbles:true, cancelable:true, ...smods }));
            target_sk.dispatchEvent(new KeyboardEvent('keyup', { key:sk, bubbles:true, ...smods }));
          }
          await wait(150);
          break;
        }
        case 'SWITCH_TO_FRAME': {
          // Frame switching is handled by sel() when step.iframe is true
          break;
        }
        case 'DEFAULT_FRAME': {
          // Return to top-level context — no-op in DOM replay (sel handles it)
          break;
        }
        case 'DRAG_AND_DROP': {
          if (!el) throw new Error('Element not found: ' + s.target);
          const dropEl = s.value ? sel(s.value, s) : null;
          if (!dropEl) throw new Error('Drop target not found: ' + s.value);
          el.dispatchEvent(new MouseEvent('mousedown', { bubbles:true }));
          el.dispatchEvent(new DragEvent('dragstart', { bubbles:true }));
          dropEl.dispatchEvent(new DragEvent('dragenter', { bubbles:true }));
          dropEl.dispatchEvent(new DragEvent('dragover', { bubbles:true }));
          dropEl.dispatchEvent(new DragEvent('drop', { bubbles:true }));
          el.dispatchEvent(new DragEvent('dragend', { bubbles:true }));
          await wait(300);
          break;
        }
        case 'CUSTOM_JS': {
          try { new Function(s.value)(); } catch(e) { throw new Error('CUSTOM_JS error: ' + e.message); }
          await wait(100);
          break;
        }
        case 'STORE_VALUES': {
          if (!el) throw new Error('Element not found: ' + s.target);
          s._result = el.value || el.innerText || el.textContent || '';
          break;
        }
        case 'GET_LAST_ID_FROM_URL': {
          const urlParts = location.href.split('/');
          s._result = urlParts[urlParts.length - 1] || '';
          break;
        }
      }
    }

    for (let i = 0; i < steps.length; i++) {
      const s = steps[i];
      // Resolve {{zpId:*}} lazily from the LIVE URL right before execution
      _resolveLiveIds(s);
      if (s.action === 'NAVIGATE_TO') {
        log.push({ i, action:s.action, ok:true });
        if (s.sleep > 0) await wait(s.sleep);
        continue;
      }
      try {
        await tryStep(s);
        if (s.sleep > 0) await wait(s.sleep);
        log.push({ i, action:s.action, target:s.target, ok:true });
      } catch(e) {
        errMsg = 'Step ' + (i+1) + ' (' + s.action + ' ' + s.target + '): ' + e.message;
        log.push({ i, action:s.action, target:s.target, ok:false, error:e.message });
        break;
      }
    }

    return {
      pass:  !errMsg,
      error: errMsg,
      note:  'Replayed ' + log.length + '/' + steps.length + ' steps',
      steps: log
    };
  })();
}

// ══════════════════════════════════════════════════
//  SMART REPLAY — Portal & Project Conditional Logic
// ══════════════════════════════════════════════════

// Extract portal name from a Zoho Projects URL
function zpExtractPortal(url) {
  if (!url) return null;
  const m = url.match(/\/portal\/([^\/\#\?]+)/);
  return m ? m[1] : null;
}

// Extract project ID from a Zoho Projects URL hash
function zpExtractProjectId(url) {
  if (!url) return null;
  // Hash formats: #project/12345, #allprojects/12345, #zp/projects/12345, #kanban/12345, #gantt/12345
  const m = url.match(/#(?:project|allprojects|zp\/projects|kanban|gantt)\/(\d+)/);
  return m ? m[1] : null;
}

// Extract project name from step text/context (best-effort from recorded steps)
function zpExtractProjectName(steps) {
  // Look for NAVIGATE_TO steps with project context or CLICK steps that contain project name
  for (const s of steps) {
    if (s._projectName) return s._projectName;
  }
  return null;
}

// Search for a project by name within a portal
async function zohoSearchProject(token, portal, dc, projectName) {
  try {
    const d = await zohoFetch(token, '/portal/' + portal + '/projects?page=1&per_page=100', {}, dc);
    const projects = Array.isArray(d) ? d : (d.projects || []);
    // Exact match first
    let found = projects.find(p => p.name === projectName);
    if (!found) {
      // Case-insensitive match
      const lower = projectName.toLowerCase();
      found = projects.find(p => p.name.toLowerCase() === lower);
    }
    if (!found) {
      // Partial match (contains)
      const lower = projectName.toLowerCase();
      found = projects.find(p => p.name.toLowerCase().includes(lower) || lower.includes(p.name.toLowerCase()));
    }
    return { ok: true, found: !!found, project: found || null, allProjects: projects };
  } catch(e) {
    return { ok: false, error: e.message };
  }
}

// Create a new project in a portal
async function zohoCreateProject(token, portal, dc, projectName, description) {
  try {
    const body = { name: projectName };
    if (description) body.description = description;
    const d = await zohoFetch(token,
      '/portal/' + portal + '/projects',
      { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) }, dc
    );
    // v3 may return array or object
    const project = Array.isArray(d) ? d[0] : (d.projects ? d.projects[0] : d);
    return { ok: true, project };
  } catch(e) {
    return { ok: false, error: e.message };
  }
}

// Rewrite all Zoho URLs in steps to point to a different portal and/or project
function zpRewriteSteps(steps, fromPortal, toPortal, fromProjectId, toProjectId) {
  return steps.map(s => {
    const ns = { ...s };
    // Rewrite portal in URLs (literal or placeholder)
    if (fromPortal && toPortal && fromPortal !== toPortal) {
      const portalPat = '/portal/' + fromPortal;
      const portalRep = '/portal/' + toPortal;
      if (ns.url) ns.url = ns.url.split(portalPat).join(portalRep);
      if (ns.target && ns.action === 'NAVIGATE_TO') ns.target = ns.target.split(portalPat).join(portalRep);
    }
    // Rewrite project ID in URL hashes (numeric IDs)
    if (fromProjectId && toProjectId && fromProjectId !== toProjectId) {
      const idPat = new RegExp('(#(?:project|allprojects|zp\\/projects|kanban|gantt)/)' + fromProjectId, 'g');
      const idRep = '$1' + toProjectId;
      if (ns.url) ns.url = ns.url.replace(idPat, idRep);
      if (ns.target && ns.action === 'NAVIGATE_TO') ns.target = ns.target.replace(idPat, idRep);
    }
    // Rewrite {{projectId}} placeholder to actual ID
    if (toProjectId) {
      ['url', 'target'].forEach(k => {
        if (ns[k]) ns[k] = ns[k].replace(/\{\{projectId\}\}/g, toProjectId);
      });
    }
    // Rewrite {{portal}} placeholder to actual portal
    if (toPortal) {
      ['url', 'target'].forEach(k => {
        if (ns[k]) ns[k] = ns[k].replace(/\{\{portal\}\}/g, toPortal);
      });
    }
    return ns;
  });
}

// Create a project via the saved UI recording template (instead of API)
async function createProjectViaTemplate(tab, targetPortal, cfg) {
  const templateId = cfg.zpProjectTemplate;
  if (!templateId) return { ok: false, error: 'No project creation template set' };

  const d = await chrome.storage.local.get('recordings');
  const template = (d.recordings || []).find(r => r.id === templateId);
  if (!template || !template.steps || template.steps.length === 0) {
    return { ok: false, error: 'Template recording not found or empty' };
  }

  // Clone template steps
  let tplSteps = template.steps.map(s => ({ ...s }));

  // Resolve {{baseUrl}}, {{portal}}, {{projectId}}, {{zpId:*}} placeholders
  let currentOrigin = '';
  try { currentOrigin = new URL(tab.url).origin; } catch {}
  let _tplPortalCur = '';
  const _tplPm = tab.url.match(/\/portal\/([^\/\#\?]+)/);
  if (_tplPm) _tplPortalCur = _tplPm[1];
  let _tplProjIdCur = '';
  const _tplPidm = tab.url.match(/#(?:allprojects|project|zp\/projects|kanban|gantt)\/(\d{10,})/);
  if (_tplPidm) _tplProjIdCur = _tplPidm[1];
  if (currentOrigin || _tplPortalCur || _tplProjIdCur) {
    tplSteps = tplSteps.map(s => {
      const ns = { ...s };
      ['url', 'target'].forEach(k => {
        if (!ns[k]) return;
        if (currentOrigin) ns[k] = ns[k].replace(/\{\{baseUrl\}\}/g, currentOrigin);
        if (_tplPortalCur) ns[k] = ns[k].replace(/\{\{portal\}\}/g, _tplPortalCur);
        if (_tplProjIdCur) ns[k] = ns[k].replace(/\{\{projectId\}\}/g, _tplProjIdCur);
        // {{zpId:*}} left unresolved — replaySteps resolves them lazily from the live URL
      });
      return ns;
    });
  }

  // Derive recorded origin for legacy recordings without {{baseUrl}}
  const recOrigin = (() => { try { return new URL(tplSteps[0]?.url || '').origin; } catch { return ''; } })();

  // Rewrite portal if template was recorded in a different portal
  const tplPortal = zpExtractPortal(tplSteps[0]?.url || '');
  if (tplPortal && targetPortal && tplPortal !== targetPortal) {
    tplSteps = zpRewriteSteps(tplSteps, tplPortal, targetPortal, null, null);
  }

  // Always rewrite origin to match current tab (handles projects17 → projects, localzoho variants, etc.)
  if (recOrigin && currentOrigin && recOrigin !== currentOrigin) {
    tplSteps = tplSteps.map(s => {
      const ns = { ...s };
      if (ns.url && ns.url.startsWith(recOrigin)) ns.url = currentOrigin + ns.url.slice(recOrigin.length);
      if (ns.target && ns.action === 'NAVIGATE_TO' && ns.target.startsWith(recOrigin)) ns.target = currentOrigin + ns.target.slice(recOrigin.length);
      return ns;
    });
  }

  // Environment URL substitution (overrides origin rewrite if active env is set)
  const envs = cfg.zpEnvironments || [];
  const activeEnv = envs.find(e => e.active) || null;
  if (activeEnv && activeEnv.url) {
    const stepOrigin = (() => { try { return new URL(tplSteps[0]?.url || '').origin; } catch { return ''; } })();
    if (stepOrigin && activeEnv.url !== stepOrigin) {
      tplSteps = tplSteps.map(s => {
        const ns = { ...s };
        if (ns.url && ns.url.startsWith(stepOrigin)) ns.url = activeEnv.url + ns.url.slice(stepOrigin.length);
        if (ns.target && ns.action === 'NAVIGATE_TO' && ns.target.startsWith(stepOrigin)) ns.target = activeEnv.url + ns.target.slice(stepOrigin.length);
        return ns;
      });
    }
  }

  // Ensure the NAVIGATE_TO step goes to #allprojects/ (project listing page)
  const navStep = tplSteps.find(s => s.action === 'NAVIGATE_TO');
  if (navStep) {
    const baseOrigin = (() => { try { return new URL(navStep.url || navStep.target).origin; } catch { return currentOrigin; } })();
    const portalInUrl = zpExtractPortal(navStep.url || navStep.target) || targetPortal;
    const allProjectsUrl = baseOrigin + '/portal/' + portalInUrl + '#allprojects/';
    navStep.url = allProjectsUrl;
    navStep.target = allProjectsUrl;
  }

  // Ensure project name step uses {{random:projectname}} for a meaningful name
  const projStep = tplSteps.find(s => s.action === 'SEND_KEYS' && s.target && /projectname/i.test(s.target));
  if (projStep) projStep.value = '{{random:projectname}}';

  // Navigate to template start URL
  let startUrl = tplSteps[0]?.url || '';
  // Clean any remaining {{zpId:*}} placeholders
  startUrl = startUrl.replace(/\{\{zpId:(\d+)\}\}/g, '$1');
  if (startUrl && startUrl !== tab.url) {
    await chrome.tabs.update(tab.id, { url: startUrl });
    await new Promise(r => setTimeout(r, 2500));
  }

  // Replay template steps
  const _rdCfgTpl = { emailDomain: cfg.randomEmailDomain || '@test.com', phonePrefix: cfg.randomPhonePrefix || '+1-555-' };
  const result = await chrome.scripting.executeScript({
    target: { tabId: tab.id },
    func: replaySteps,
    args: [tplSteps, _rdCfgTpl]
  });
  const replayResult = result?.[0]?.result || {};
  if (replayResult.error) {
    return { ok: false, error: 'Template replay failed: ' + replayResult.error };
  }

  // Wait for Zoho to finish creating and navigating to the new project
  await new Promise(r => setTimeout(r, 3000));

  // Extract new project ID from the URL the browser navigated to
  const [updatedTab] = await chrome.tabs.query({ active: true, currentWindow: true });
  const newProjectId = zpExtractProjectId(updatedTab?.url || '');
  if (newProjectId) {
    return { ok: true, projectId: newProjectId, url: updatedTab.url };
  }
  return { ok: false, error: 'Could not detect new project ID from URL after template replay' };
}

// ══════════════════════════════════════════════════
//  SEED SAMPLE FLOWS — pre-built recordings for
//  Flow 1 (Create Project) + Flow 2 (Add Tasklist → Task → Comment)
// ══════════════════════════════════════════════════
async function seedSampleFlows() {
  const now = Date.now();
  const baseUrl = '{{baseUrl}}';
  const portal = '{{portal}}';

  // ── Flow 1: Create Project (Template) ──
  const flow1Id = 'r_tpl_' + now;
  const flow1 = {
    id: flow1Id,
    name: '📐 Create Project (Template)',
    startUrl: baseUrl + '/portal/' + portal + '#allprojects/',
    ms: 0,
    at: new Date().toISOString(),
    _portal: portal,
    _isTemplate: true,
    network: [],
    steps: [
      { action: 'NAVIGATE_TO', target: baseUrl + '/portal/' + portal + '#allprojects/',
        url: baseUrl + '/portal/' + portal + '#allprojects/', t: now, id: 1 },
      { action: 'CLICK', target: "//button[@data-zpqa='newproject']", tagName: 'button',
        text: 'New Project', url: baseUrl + '/portal/' + portal + '#allprojects/', t: now+500, id: 2 },
      { action: 'CLICK', target: "//div[contains(@class,'template-card')]//span[contains(text(),'Blank')]",
        tagName: 'span', text: 'Blank project',
        url: baseUrl + '/portal/' + portal + '#allprojects/', t: now+2000, id: 3, sleep: 500 },
      { action: 'CLICK', target: "//button[@data-zpqa='createproject']", tagName: 'button',
        text: 'Create Project', url: baseUrl + '/portal/' + portal + '#allprojects/', t: now+3000, id: 4, sleep: 500 },
      { action: 'CLICK', target: "//input[@data-zpqa='projectname']", tagName: 'input',
        text: 'Project Title', url: baseUrl + '/portal/' + portal + '#allprojects/', t: now+4000, id: 5 },
      { action: 'SEND_KEYS', target: "//input[@data-zpqa='projectname']", tagName: 'input',
        text: 'Project Title', value: '{{random:projectname}}',
        url: baseUrl + '/portal/' + portal + '#allprojects/', t: now+5000, id: 6 },
      { action: 'CLICK', target: "//button[@data-zpqa='addproject']", tagName: 'button',
        text: 'Add', url: baseUrl + '/portal/' + portal + '#allprojects/', t: now+6000, id: 7, sleep: 2000 }
    ]
  };

  // ── Flow 2: Add Tasklist → Add Task → Add Comment ──
  const flow2Id = 'r_flow_' + now;
  const flow2 = {
    id: flow2Id,
    name: '📋 Tasklist → Task → Comment',
    startUrl: baseUrl + '/portal/' + portal + '#zp/projects/{{projectId}}/tasks',
    ms: 0,
    at: new Date().toISOString(),
    _portal: portal,
    network: [],
    steps: [
      { action: 'NAVIGATE_TO',
        target: baseUrl + '/portal/' + portal + '#zp/projects/{{projectId}}/tasks',
        url: baseUrl + '/portal/' + portal + '#zp/projects/{{projectId}}/tasks', t: now, id: 1 },
      // Step 2: Hover dropdown arrow next to "Add Task" button to reveal "Add Task List"
      { action: 'MOVE_TO_ELEMENT_WITHOUT_CLICK', target: "//div[contains(@class,'twoway-right')]",
        tagName: 'div', text: '▼',
        url: baseUrl + '/portal/' + portal + '#zp/projects/{{projectId}}/tasks', t: now+1000, id: 2, sleep: 500 },
      // Step 3: Click "Add Task List" option revealed by hover
      { action: 'CLICK', target: "//div[@data-zpqa='addtasklist']",
        tagName: 'div', text: 'Add Task List',
        url: baseUrl + '/portal/' + portal + '#zp/projects/{{projectId}}/tasks', t: now+2000, id: 3, sleep: 500 },
      // Step 4: Type tasklist name in the dialog input
      { action: 'SEND_KEYS', target: "//input[@name='todotitle']",
        tagName: 'input', text: 'Task List', value: '{{random:tasklistname}}',
        url: baseUrl + '/portal/' + portal + '#zp/projects/{{projectId}}/tasks', t: now+3000, id: 4 },
      // Step 5: Click Add button in New Task List dialog
      { action: 'CLICK', target: "//button[contains(text(),'Add')]",
        tagName: 'button', text: 'Add',
        url: baseUrl + '/portal/' + portal + '#zp/projects/{{projectId}}/tasks', t: now+4000, id: 5, sleep: 1500 },
      // Step 6: Click "Add Task" button (the main left button, not dropdown)
      { action: 'CLICK', target: "//div[@data-zpqa='addtask']",
        tagName: 'div', text: 'Add Task',
        url: baseUrl + '/portal/' + portal + '#zp/projects/{{projectId}}/tasks', t: now+5500, id: 6 },
      // Step 7: Type task name in the New Task dialog
      { action: 'SEND_KEYS', target: "//input[@data-zpqa='taskname']",
        tagName: 'input', text: 'Task Name', value: '{{random:taskname}}',
        url: baseUrl + '/portal/' + portal + '#zp/projects/{{projectId}}/tasks', t: now+6500, id: 7 },
      // Step 8: Click Add button to create task
      { action: 'CLICK', target: "//button[@data-zpqa='addtaskbtn']",
        tagName: 'button', text: 'Add',
        url: baseUrl + '/portal/' + portal + '#zp/projects/{{projectId}}/tasks', t: now+7500, id: 8, sleep: 1500 },
      // Step 9: Click on the task name cell to open task detail (via right-click context)
      { action: 'CLICK', target: "//span[@data-zpqa='modifytask']",
        tagName: 'span', text: 'Modify the Task',
        url: baseUrl + '/portal/' + portal + '#zp/projects/{{projectId}}/tasks', t: now+9000, id: 9 },
      // Step 10: Click "View Details" in context menu
      { action: 'CLICK', target: "//div[contains(text(),'View Details')]",
        tagName: 'div', text: 'View Details',
        url: baseUrl + '/portal/' + portal + '#zp/projects/{{projectId}}/tasks', t: now+9500, id: 10, sleep: 1500 },
      // Step 11: Click Comments tab
      { action: 'CLICK', target: "//span[@data-zpqa='tablist']",
        tagName: 'span', text: 'Comments',
        url: baseUrl + '/portal/' + portal + '#zp/projects/{{projectId}}/tasks', t: now+11000, id: 11, sleep: 500 },
      // Step 12: Type comment in the contenteditable iframe editor
      { action: 'SEND_KEYS', target: "//body[@contenteditable='true']",
        tagName: 'body', text: 'contenteditable', value: '{{random:comment}}',
        url: baseUrl + '/portal/' + portal + '#zp/projects/{{projectId}}/tasks',
        t: now+12000, id: 12, contenteditable: true, iframe: true,
        iframeSelector: 'iframe' },
      // Step 13: Click "Add Comment" button
      { action: 'CLICK', target: "//button[contains(text(),'Add Comment')]",
        tagName: 'button', text: 'Add Comment',
        url: baseUrl + '/portal/' + portal + '#zp/projects/{{projectId}}/tasks', t: now+13000, id: 13, sleep: 1000 }
    ]
  };

  // Save both recordings
  const d = await chrome.storage.local.get(['recordings', 'settings']);
  let recs = d.recordings || [];
  // Remove any existing seeded flows
  recs = recs.filter(r => !r.id.startsWith('r_tpl_') && !r.id.startsWith('r_flow_'));
  recs.unshift(flow2);
  recs.unshift(flow1);
  // Set Flow 1 as the project creation template
  const cfg = d.settings || {};
  cfg.zpProjectTemplate = flow1Id;
  await chrome.storage.local.set({ recordings: recs, settings: cfg });

  return { ok: true, flow1Id, flow2Id, message: 'Seeded 2 flows. Flow 1 set as template.' };
}

// Main smart replay function — handles portal/project conditional logic
async function smartReplay(c) {
  const t0 = Date.now();
  const res = { id:'run'+Date.now(), caseId:c.id, name:c.name, t0:new Date().toISOString(), steps:[], smartActions:[] };

  let rawSteps = c._recordingSteps;
  if (!rawSteps || rawSteps.length === 0) {
    res.pass = false; res.ms = Date.now()-t0;
    res.error = 'No recorded steps to replay.';
    return res;
  }

  // Get settings & Zoho creds
  const d = await chrome.storage.local.get('settings');
  const cfg = d.settings || {};
  const token = cfg.zohoToken;
  const dc = cfg.zohoDC || '.com';
  const portals = cfg.zpPortals || [];
  const currentPortalCfg = portals[0] || {};
  const currentPortalId = currentPortalCfg.id || cfg.zpPortalId || '';
  const currentPortalName = currentPortalCfg.name || cfg.zohoPortal || '';

  // 1. Extract portal & project from recorded steps
  const recordedUrl = rawSteps[0]?.url || c.webUrl || '';
  let recordedPortal = zpExtractPortal(recordedUrl);
  let recordedProjectId = zpExtractProjectId(recordedUrl);
  const recordedProjectName = zpExtractProjectName(rawSteps) || c._projectName || '';

  // Handle placeholder-based recordings (e.g. seeded flows with {{portal}}, {{projectId}})
  // Treat {{portal}} as same-portal, {{projectId}} as needs-project-creation
  const _hasPlaceholderPortal = !recordedPortal || /\{\{/.test(recordedPortal);
  const _hasPlaceholderProjectId = recordedUrl.includes('{{projectId}}');
  if (_hasPlaceholderPortal) recordedPortal = null; // will be treated as same-portal
  if (_hasPlaceholderProjectId) recordedProjectId = null; // force project creation

  // 2. Get current tab URL to determine actual browser portal
  const tabs = await chrome.tabs.query({ active:true, currentWindow:true });
  const tab = tabs[0];
  if (!tab) {
    res.pass = false; res.ms = Date.now()-t0;
    res.error = 'No active tab — open the target page and try again';
    return res;
  }
  const currentBrowserPortal = zpExtractPortal(tab.url) || currentPortalName || recordedPortal;
  const portalForApi = currentPortalId || currentBrowserPortal;

  res.smartActions.push({ action: 'DETECT', recorded: { portal: recordedPortal, projectId: recordedProjectId, projectName: recordedProjectName }, current: { portal: currentBrowserPortal, portalId: portalForApi } });

  let targetProjectId = null;
  let targetPortal = currentBrowserPortal;

  const isSamePortal = !recordedPortal || (recordedPortal === currentBrowserPortal);

  if (isSamePortal) {
    // ── SAME PORTAL: search for the previously used project ──
    res.smartActions.push({ action: 'SAME_PORTAL', portal: currentBrowserPortal });

    if (token && recordedProjectName) {
      const search = await zohoSearchProject(token, portalForApi, dc, recordedProjectName);
      if (search.ok && search.found) {
        // Project found → use it
        targetProjectId = search.project.id_string || search.project.id || '';
        res.smartActions.push({ action: 'PROJECT_FOUND', project: search.project.name, id: targetProjectId });
      } else {
        // Project NOT found → create via UI template first, API fallback
        const tplResult = await createProjectViaTemplate(tab, currentBrowserPortal, cfg);
        if (tplResult.ok) {
          targetProjectId = tplResult.projectId;
          res.smartActions.push({ action: 'PROJECT_CREATED_VIA_UI', id: targetProjectId });
        } else if (token) {
          const newName = 'Auto_' + (recordedProjectName || 'Project') + '_' + Date.now().toString(36);
          const create = await zohoCreateProject(token, portalForApi, dc, newName, 'Auto-created by UI Auto Kit smart replay');
          if (create.ok && create.project) {
            targetProjectId = create.project.id_string || create.project.id || '';
            res.smartActions.push({ action: 'PROJECT_CREATED', name: newName, id: targetProjectId });
          } else {
            res.smartActions.push({ action: 'PROJECT_CREATE_FAILED', error: create.error });
          }
        } else {
          res.smartActions.push({ action: 'PROJECT_CREATE_FAILED', error: tplResult.error || 'No template and no token' });
        }
      }
    } else if (token && recordedProjectId) {
      // No project name but have ID — try to use it directly, otherwise create
      try {
        const detail = await zohoFetch(token, '/portal/' + portalForApi + '/projects/' + recordedProjectId, {}, dc);
        const proj = detail.projects ? detail.projects[0] : detail;
        if (proj && (proj.id || proj.id_string)) {
          targetProjectId = proj.id_string || proj.id;
          res.smartActions.push({ action: 'PROJECT_ID_VALID', name: proj.name, id: targetProjectId });
        }
      } catch(e) {
        // Project ID doesn't exist in this portal — create via UI template, API fallback
        const tplResult = await createProjectViaTemplate(tab, currentBrowserPortal, cfg);
        if (tplResult.ok) {
          targetProjectId = tplResult.projectId;
          res.smartActions.push({ action: 'PROJECT_CREATED_VIA_UI', id: targetProjectId });
        } else if (token) {
          const newName = 'Auto_Project_' + Date.now().toString(36);
          const create = await zohoCreateProject(token, portalForApi, dc, newName, 'Auto-created by UI Auto Kit smart replay');
          if (create.ok && create.project) {
            targetProjectId = create.project.id_string || create.project.id || '';
            res.smartActions.push({ action: 'PROJECT_CREATED', name: newName, id: targetProjectId });
          }
        }
      }
    } else if (_hasPlaceholderProjectId) {
      // Recording uses {{projectId}} placeholder but no specific project name/ID —
      // Always create a fresh project via template for clean execution
      res.smartActions.push({ action: 'PLACEHOLDER_PROJECT', note: 'Recording needs a project — creating fresh' });
      const tplResult = await createProjectViaTemplate(tab, currentBrowserPortal, cfg);
      if (tplResult.ok) {
        targetProjectId = tplResult.projectId;
        res.smartActions.push({ action: 'PROJECT_CREATED_VIA_UI', id: targetProjectId });
      } else if (token) {
        const newName = 'Auto_Project_' + Date.now().toString(36);
        const create = await zohoCreateProject(token, portalForApi, dc, newName, 'Auto-created by UI Auto Kit smart replay');
        if (create.ok && create.project) {
          targetProjectId = create.project.id_string || create.project.id || '';
          res.smartActions.push({ action: 'PROJECT_CREATED', name: newName, id: targetProjectId });
        } else {
          res.smartActions.push({ action: 'PROJECT_CREATE_FAILED', error: create.error || 'No template and no token' });
        }
      }
    }
  } else {
    // ── DIFFERENT PORTAL: always create a new project ──
    res.smartActions.push({ action: 'DIFFERENT_PORTAL', recorded: recordedPortal, current: currentBrowserPortal });

    // Try UI template first, then API fallback
    const tplResult = await createProjectViaTemplate(tab, currentBrowserPortal, cfg);
    if (tplResult.ok) {
      targetProjectId = tplResult.projectId;
      targetPortal = currentBrowserPortal;
      res.smartActions.push({ action: 'PROJECT_CREATED_VIA_UI', id: targetProjectId, forPortal: currentBrowserPortal });
    } else if (token) {
      const newName = 'Auto_' + (recordedProjectName || 'Project') + '_' + Date.now().toString(36);
      const create = await zohoCreateProject(token, portalForApi, dc, newName, 'Auto-created by UI Auto Kit — ported from portal: ' + recordedPortal);
      if (create.ok && create.project) {
        targetProjectId = create.project.id_string || create.project.id || '';
        targetPortal = currentBrowserPortal;
        res.smartActions.push({ action: 'PROJECT_CREATED', name: newName, id: targetProjectId, forPortal: currentBrowserPortal });
      } else {
        res.smartActions.push({ action: 'PROJECT_CREATE_FAILED', error: create.error });
      }
    } else {
      res.smartActions.push({ action: 'NO_TOKEN', note: 'No Zoho token and no template — replaying with URL rewrite only' });
    }
  }

  // 3. Rewrite steps if portal or project changed
  if (targetProjectId || (!isSamePortal && targetPortal)) {
    rawSteps = zpRewriteSteps(rawSteps, recordedPortal, targetPortal, recordedProjectId, targetProjectId);
    res.smartActions.push({ action: 'STEPS_REWRITTEN', fromPortal: recordedPortal, toPortal: targetPortal, fromProject: recordedProjectId, toProject: targetProjectId });
  }

  // 4. Re-query active tab (URL may have changed after template/project creation)
  const _freshTabs = await chrome.tabs.query({ active:true, currentWindow:true });
  const _freshTab = _freshTabs[0] || tab;
  const _freshUrl = _freshTab.url || tab.url;

  // 4a. Resolve {{baseUrl}}, {{portal}}, {{projectId}}, {{zpId:*}} placeholders
  let _curOrigin = '';
  try { _curOrigin = new URL(_freshUrl).origin; } catch {}
  let _curPortal = '';
  const _pm = _freshUrl.match(/\/portal\/([^\/\#\?]+)/);
  if (_pm) _curPortal = _pm[1];
  // Prefer targetProjectId (from template/API creation) over URL-extracted ID
  let _curProjId = targetProjectId || '';
  if (!_curProjId) {
    const _pidm = _freshUrl.match(/#(?:allprojects|project|zp\/projects|kanban|gantt)\/(\d{10,})/);
    if (_pidm) _curProjId = _pidm[1];
  }
  if (_curOrigin || _curPortal || _curProjId) {
    rawSteps = rawSteps.map(s => {
      const ns = { ...s };
      ['url', 'target'].forEach(k => {
        if (!ns[k]) return;
        if (_curOrigin) ns[k] = ns[k].replace(/\{\{baseUrl\}\}/g, _curOrigin);
        if (_curPortal) ns[k] = ns[k].replace(/\{\{portal\}\}/g, _curPortal);
        if (_curProjId) ns[k] = ns[k].replace(/\{\{projectId\}\}/g, _curProjId);
        // {{zpId:*}} left unresolved — replaySteps resolves them lazily from the live URL
      });
      return ns;
    });
  }

  // 4b. Rewrite origin for legacy recordings without {{baseUrl}}
  let _recOrigin = '';
  try { _recOrigin = new URL(rawSteps[0]?.url || '').origin; } catch {}
  if (_recOrigin && _curOrigin && _recOrigin !== _curOrigin) {
    rawSteps = rawSteps.map(s => {
      const ns = { ...s };
      if (ns.url && ns.url.startsWith(_recOrigin)) ns.url = _curOrigin + ns.url.slice(_recOrigin.length);
      if (ns.target && ns.action === 'NAVIGATE_TO' && ns.target.startsWith(_recOrigin)) ns.target = _curOrigin + ns.target.slice(_recOrigin.length);
      return ns;
    });
    res.smartActions.push({ action: 'ORIGIN_REWRITE', from: _recOrigin, to: _curOrigin });
  }

  // 5. Environment URL substitution (overrides origin rewrite if active env is set)
  const envs = cfg.zpEnvironments || [];
  const activeEnv = envs.find(e => e.active) || null;
  if (activeEnv && activeEnv.url) {
    const recUrl = rawSteps[0]?.url || '';
    let recBase = '';
    try { const u = new URL(recUrl); recBase = u.origin; } catch {}
    if (recBase && activeEnv.url !== recBase) {
      rawSteps = rawSteps.map(s => {
        const ns = { ...s };
        if (ns.url && ns.url.startsWith(recBase)) ns.url = activeEnv.url + ns.url.slice(recBase.length);
        if (ns.target && ns.action === 'NAVIGATE_TO' && ns.target.startsWith(recBase)) ns.target = activeEnv.url + ns.target.slice(recBase.length);
        return ns;
      });
      res.smartActions.push({ action: 'ENV_REWRITE', from: recBase, to: activeEnv.url });
    }
  }

  // 6. Navigate & replay
  try {
    // Stop inspect mode
    try { await chrome.tabs.sendMessage(tab.id, {type:'STOP_INSPECT'}); } catch {}
    await chrome.scripting.executeScript({
      target: { tabId: tab.id },
      func: () => {
        if (window.__WEBAPI_API) {
          if (window.__WEBAPI_API.stopInspect) window.__WEBAPI_API.stopInspect();
          window.__WEBAPI_API.hideHighlight();
          window.__WEBAPI_API.hideLocatorPanel();
        }
        document.body.style.cursor = '';
      }
    }).catch(()=>{});

    // Show test pill
    const safeName = (c.name || 'Smart Test').replace(/[`$\\"]/g, '');
    await chrome.scripting.executeScript({
      target: { tabId: tab.id },
      func: injectTestPill,
      args: [safeName, rawSteps.length]
    }).catch(()=>{});

    // Navigate to start URL
    let startUrl = rawSteps[0]?.url || '';
    // Always resolve {{zpId:*}} in start URL. For Zoho module URLs, simplify to module-level
    // (custom-view IDs, task-detail IDs etc. are project-specific and won't exist in a new project)
    if (startUrl.includes('{{zpId:')) {
      // Strip everything after the module name: tasks, issues, bugs, milestones, forums
      const moduleMatch = startUrl.match(/(.*?\/(?:tasks|issues|bugs|milestones|forums))\b/);
      if (moduleMatch) {
        startUrl = moduleMatch[1];
      } else {
        // No module found — just restore original IDs
        startUrl = startUrl.replace(/\{\{zpId:(\d+)\}\}/g, '$1');
      }
    }
    // Also strip any leftover {{zpId:*}} that slipped through
    startUrl = startUrl.replace(/\{\{zpId:(\d+)\}\}/g, '$1');
    if (startUrl && startUrl !== _freshUrl) {
      await chrome.tabs.update(tab.id, { url: startUrl });
      await new Promise(r => setTimeout(r, 2000));
    }

    // Replay
    const _rdCfgSR = { emailDomain: cfg.randomEmailDomain || '@test.com', phonePrefix: cfg.randomPhonePrefix || '+1-555-' };
    const result = await chrome.scripting.executeScript({
      target: { tabId: tab.id },
      func: replaySteps,
      args: [rawSteps, _rdCfgSR]
    });

    const replayResult = result?.[0]?.result || {};
    res.pass = replayResult.pass !== false;
    res.ms = Date.now() - t0;
    res.note = (res.smartActions.map(a => a.action).join(' → ')) + ' | ' + (replayResult.note || '');
    res.error = replayResult.error || null;
    res.steps = replayResult.steps || [];

    // Remove test pill
    await chrome.scripting.executeScript({
      target: { tabId: tab.id },
      func: removeTestPill
    }).catch(()=>{});

  } catch(e) {
    res.pass = false; res.ms = Date.now()-t0; res.error = e.message;
  }

  res.tf = new Date().toISOString();
  await saveResult(res);
  await chrome.storage.local.set({ lastTestResult: { res, caseName: c.name, caseId: c.id } });
  try { await chrome.action.openPopup(); } catch {}
  return res;
}

// ══════════════════════════════════════════════════
//  PLATFORM PUSH
// ══════════════════════════════════════════════════
async function pushPlatform(data) {
  try {
    const d = await chrome.storage.local.get('settings');
    const cfg = d.settings||{};
    const payload = data.type === 'RECORDING'
      ? { id: data.id || Date.now().toString(36), name: data.name, steps: data.steps, network: data.network || [], at: new Date().toISOString() }
      : data;
    const endpoint = data.type === 'RECORDING' ? '/recordings'
                   : data.type === 'TEST_CASE' ? '/test-cases'
                   : '/recordings';
    const r = await fetch(cfg.url + endpoint, {
      method:'POST',
      headers:{ 'Content-Type':'application/json', 'x-api-key':cfg.key },
      body: JSON.stringify(payload),
      signal: AbortSignal.timeout(8000)
    });
    const json = await r.json().catch(()=>({}));
    return { ok:r.ok, status:r.status, data:json };
  } catch(e) {
    return { ok:false, error:e.message };
  }
}

async function healthCheck(url, key) {
  try {
    if (!url) return { ok: false, error: 'No URL provided' };
    const r = await fetch(url+'/health', {
      headers:{ 'x-api-key': key||'' },
      signal: AbortSignal.timeout(4000)
    });
    const d = await r.json();
    return { ok:true, data:d };
  } catch(e) {
    return { ok:false, error:e.message };
  }
}

/* ══════════════════════════════════════════════════
   ZOHO PROJECTS INTEGRATION
   ══════════════════════════════════════════════════ */

function zohoBase(dc) {
  return 'https://projectsapi.zoho' + (dc || '.com') + '/api/v3';
}

// OAuth token exchange — uses Client ID + Secret + Refresh Token to get access token
let _zohoAccessToken = null;
let _zohoTokenExpiry = 0;

async function zohoGetAccessToken(refreshToken, dc) {
  // Return cached token if still valid (with 60s buffer)
  if (_zohoAccessToken && Date.now() < _zohoTokenExpiry - 60000) {
    return _zohoAccessToken;
  }
  const d = await chrome.storage.local.get('settings');
  const cfg = d.settings || {};
  if (!cfg.zpClientId || !cfg.zpClientSecret) {
    return refreshToken; // no client creds configured, use token as-is
  }
  const base = 'https://accounts.zoho' + (dc || '.com');
  const params = new URLSearchParams({
    refresh_token: refreshToken,
    client_id: cfg.zpClientId,
    client_secret: cfg.zpClientSecret,
    grant_type: 'refresh_token'
  });
  const r = await fetch(base + '/oauth/v2/token', {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: params.toString(),
    signal: AbortSignal.timeout(15000)
  });
  const data = await r.json();
  if (data.error) {
    throw new Error('OAuth token exchange failed: ' + data.error);
  }
  _zohoAccessToken = data.access_token;
  _zohoTokenExpiry = Date.now() + (data.expires_in || 3600) * 1000;
  return _zohoAccessToken;
}

async function zohoFetch(token, path, opts = {}, dc) {
  const accessToken = await zohoGetAccessToken(token, dc);
  const url = zohoBase(dc) + path;
  const headers = { 'Authorization': 'Zoho-oauthtoken ' + accessToken, ...opts.headers };
  const r = await fetch(url, { ...opts, headers, signal: AbortSignal.timeout(15000) });
  if (!r.ok) {
    const text = await r.text().catch(() => '');
    throw new Error('Zoho API ' + r.status + ': ' + text.slice(0, 200));
  }
  return r.json();
}

async function zohoTest(token, portal, dc) {
  try {
    const d = await zohoFetch(token, '/portal/' + portal + '/projects', { method: 'GET' }, dc);
    const projects = Array.isArray(d) ? d : (d.projects || []);
    return { ok: true, count: projects.length };
  } catch(e) {
    return { ok: false, error: e.message };
  }
}

async function zohoGetProjects(token, portal, dc) {
  try {
    const d = await zohoFetch(token, '/portal/' + portal + '/projects?page=1&per_page=100', {}, dc);
    const projects = Array.isArray(d) ? d : (d.projects || []);
    return { ok: true, projects };
  } catch(e) {
    return { ok: false, error: e.message };
  }
}

async function zohoGetTasklists(token, portal, projectId, dc) {
  try {
    const d = await zohoFetch(token, '/portal/' + portal + '/projects/' + projectId + '/tasklists?page=1&per_page=100', {}, dc);
    const tasklists = Array.isArray(d) ? d : (d.tasklists || []);
    return { ok: true, tasklists };
  } catch(e) {
    return { ok: false, error: e.message };
  }
}

async function zohoGetTasks(token, portal, projectId, dc) {
  try {
    const d = await zohoFetch(token, '/portal/' + portal + '/projects/' + projectId + '/tasks?page=1&per_page=100', {}, dc);
    const tasks = Array.isArray(d) ? d : (d.tasks || []);
    return { ok: true, tasks };
  } catch(e) {
    return { ok: false, error: e.message };
  }
}

async function zohoGetAllTasks(token, portal, dc) {
  try {
    const projData = await zohoFetch(token, '/portal/' + portal + '/projects?page=1&per_page=100', {}, dc);
    const projects = Array.isArray(projData) ? projData : (projData.projects || []);
    const allTasks = [];
    for (const p of projects.slice(0, 10)) {
      try {
        const td = await zohoFetch(token, '/portal/' + portal + '/projects/' + (p.id || p.id_string) + '/tasks?page=1&per_page=50', {}, dc);
        const tasks = Array.isArray(td) ? td : (td.tasks || []);
        tasks.forEach(t => {
          t._projectName = p.name;
          t._projectId = p.id || p.id_string;
          allTasks.push(t);
        });
      } catch(e) { /* skip errored projects */ }
    }
    return { ok: true, tasks: allTasks };
  } catch(e) {
    return { ok: false, error: e.message };
  }
}

async function zohoGetTaskDetail(token, portal, projectId, taskId, dc) {
  try {
    const d = await zohoFetch(token, '/portal/' + portal + '/projects/' + projectId + '/tasks/' + taskId, {}, dc);
    return { ok: true, task: d.tasks ? d.tasks[0] : d };
  } catch(e) {
    return { ok: false, error: e.message };
  }
}

async function zohoExportTask(msg) {
  const { token, portal, dc, projectId, tasklistId, taskName, taskDesc, stepsJson, codeText, codeFilename, _existingTaskId } = msg;
  try {
    const accessToken = await zohoGetAccessToken(token, dc);
    const base = zohoBase(dc);
    let taskId = _existingTaskId;
    let task = {};

    if (!taskId) {
      const taskBody = { name: taskName };
      if (taskDesc) taskBody.description = taskDesc;
      if (tasklistId) taskBody.tasklist = { id: tasklistId };
      const taskResp = await zohoFetch(token,
        '/portal/' + portal + '/projects/' + projectId + '/tasks',
        { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(taskBody) }, dc
      );
      // v3 may return array directly, or wrapped in {tasks:[...]}, or a single object
      let parsed = taskResp;
      if (Array.isArray(parsed)) parsed = parsed[0];
      else if (parsed?.tasks) parsed = Array.isArray(parsed.tasks) ? parsed.tasks[0] : parsed.tasks;
      task = parsed || {};
      taskId = task.id_string || task.id;
    }

    // Try multiple strategies to upload and attach a file to the task
    async function uploadAndAttach(blob, filename) {
      const authHdr = { 'Authorization': 'Zoho-oauthtoken ' + accessToken };
      const errors = [];

      // ── Strategy 1: Direct task-level attachment upload ──
      try {
        const fd1 = new FormData();
        fd1.append('uploaddoc', blob, filename);
        const url1 = base + '/portal/' + portal + '/projects/' + projectId + '/tasks/' + taskId + '/attachments';
        console.log('[ZOHO] Strategy 1 - Task-level upload:', url1);
        const r1 = await fetch(url1, { method: 'POST', headers: authHdr, body: fd1, signal: AbortSignal.timeout(30000) });
        const d1 = await r1.text().catch(() => '');
        console.log('[ZOHO] Strategy 1 response:', r1.status, d1.slice(0, 500));
        if (r1.ok) return { name: filename, ok: true };
        errors.push('S1(' + r1.status + ')');

        // Retry with upload_file field name
        const fd1b = new FormData();
        fd1b.append('upload_file', blob, filename);
        const r1b = await fetch(url1, { method: 'POST', headers: authHdr, body: fd1b, signal: AbortSignal.timeout(30000) });
        const d1b = await r1b.text().catch(() => '');
        console.log('[ZOHO] Strategy 1b response:', r1b.status, d1b.slice(0, 500));
        if (r1b.ok) return { name: filename, ok: true };
        errors.push('S1b(' + r1b.status + ')');
      } catch(e) { errors.push('S1err:' + e.message); console.log('[ZOHO] Strategy 1 error:', e.message); }

      // ── Strategy 2: Portal-level upload + associate ──
      try {
        const fd2 = new FormData();
        fd2.append('upload_file', blob, filename);
        const uploadUrl = base + '/portal/' + portal + '/attachments';
        console.log('[ZOHO] Strategy 2 - Portal upload:', uploadUrl);
        const r2 = await fetch(uploadUrl, { method: 'POST', headers: authHdr, body: fd2, signal: AbortSignal.timeout(30000) });
        const d2 = await r2.json().catch(() => ({}));
        console.log('[ZOHO] Strategy 2 upload response:', r2.status, JSON.stringify(d2).slice(0, 500));
        if (r2.ok) {
          // Extract attachment ID from any possible response shape
          const attachId = extractAttachId(d2);
          if (attachId) {
            // Associate with task
            const assocUrl = base + '/portal/' + portal + '/projects/' + projectId + '/attachments/' + attachId;
            console.log('[ZOHO] Strategy 2 - Associate:', assocUrl, 'taskId:', taskId);
            const afd = new FormData();
            afd.append('entity_type', 'task');
            afd.append('entity_id', String(taskId));
            const ra = await fetch(assocUrl, { method: 'POST', headers: authHdr, body: afd, signal: AbortSignal.timeout(15000) });
            const da = await ra.text().catch(() => '');
            console.log('[ZOHO] Strategy 2 associate response:', ra.status, da.slice(0, 300));
            if (ra.ok) return { name: filename, ok: true };
            errors.push('S2assoc(' + ra.status + ')');
          } else {
            errors.push('S2noId');
            console.log('[ZOHO] Strategy 2 - Could not extract attachment ID from:', JSON.stringify(d2).slice(0, 500));
          }
        } else {
          errors.push('S2upload(' + r2.status + ')');
        }
      } catch(e) { errors.push('S2err:' + e.message); console.log('[ZOHO] Strategy 2 error:', e.message); }

      // ── Strategy 3: REST API v1 style upload ──
      try {
        const restBase = 'https://projectsapi.zoho' + (dc || '.com') + '/restapi';
        const fd3 = new FormData();
        fd3.append('uploaddoc', blob, filename);
        const url3 = restBase + '/portal/' + portal + '/projects/' + projectId + '/tasks/' + taskId + '/attachments/';
        console.log('[ZOHO] Strategy 3 - REST v1 upload:', url3);
        const r3 = await fetch(url3, { method: 'POST', headers: authHdr, body: fd3, signal: AbortSignal.timeout(30000) });
        const d3 = await r3.text().catch(() => '');
        console.log('[ZOHO] Strategy 3 response:', r3.status, d3.slice(0, 500));
        if (r3.ok) return { name: filename, ok: true };
        errors.push('S3(' + r3.status + ')');
      } catch(e) { errors.push('S3err:' + e.message); console.log('[ZOHO] Strategy 3 error:', e.message); }

      return { name: filename, ok: false, err: errors.join(', ') };
    }

    function extractAttachId(data) {
      // Try every known response shape
      const list = data.attachment || data.attachments || data.docs || data.documents || [];
      const first = Array.isArray(list) ? list[0] : list;
      if (first) {
        const id = first.attachment_id || first.id_string || first.id || first.doc_id;
        if (id) return String(id);
      }
      // Top-level ID
      if (data.attachment_id || data.id_string || data.id) return String(data.attachment_id || data.id_string || data.id);
      // Array response
      if (Array.isArray(data) && data[0]) return String(data[0].attachment_id || data[0].id_string || data[0].id || '');
      return null;
    }

    const attachResults = [];
    if (stepsJson) {
      try {
        const blob = new Blob([stepsJson], { type: 'application/json' });
        const jsonFilename = (taskName || 'steps').replace(/[^a-zA-Z0-9_\- ]/g, '_').trim() + '.json';
        const result = await uploadAndAttach(blob, jsonFilename);
        attachResults.push(result);
      } catch(e) { attachResults.push({ name: taskName + '.json', ok: false, err: e.message }); }
    }

    if (codeText) {
      try {
        const fname = codeFilename || 'test.js';
        const blob = new Blob([codeText], { type: 'text/plain' });
        const result = await uploadAndAttach(blob, fname);
        attachResults.push(result);
      } catch(e) { attachResults.push({ name: codeFilename, ok: false, err: e.message }); }
    }

    // Also store steps JSON as a task comment (reliable retrieval on import)
    if (stepsJson) {
      try {
        const b64 = btoa(unescape(encodeURIComponent(stepsJson)));
        const commentPayload = JSON.stringify({ comment: '⚙️ WebAPI Automation Steps (auto-generated — do not edit)\n\n[WEBAPI_STEPS_B64]' + b64 + '[WEBAPI_STEPS_B64_END]' });
        const cr = await fetch(base + '/portal/' + portal + '/projects/' + projectId + '/tasks/' + taskId + '/comments', {
          method: 'POST',
          headers: { 'Authorization': 'Zoho-oauthtoken ' + accessToken, 'Content-Type': 'application/json' },
          body: commentPayload,
          signal: AbortSignal.timeout(15000)
        });
        const crd = await cr.json().catch(() => ({}));
        console.log('[ZOHO] Steps comment response:', cr.status, JSON.stringify(crd).slice(0, 200));
      } catch(e) { console.log('[ZOHO] Failed to add steps comment:', e.message); }
    }

    return { ok: true, taskId, taskName: task.name, attachments: attachResults };
  } catch(e) {
    return { ok: false, error: e.message };
  }
}

async function zohoGetAttachments(token, portal, projectId, taskId, dc) {
  const accessToken = await zohoGetAccessToken(token, dc);
  const hosts = [
    'https://projectsapi.zoho' + (dc || '.com')
  ];
  for (const base of hosts) {
    try {
      const url = base + '/api/v3/portal/' + portal + '/projects/' + projectId + '/attachments?entity_type=task&entity_id=' + taskId;
      console.log('[ZOHO] Trying attachments URL:', url);
      const r = await fetch(url, {
        headers: { 'Authorization': 'Zoho-oauthtoken ' + accessToken },
        signal: AbortSignal.timeout(15000)
      });
      console.log('[ZOHO] Attachments response status:', r.status);
      if (!r.ok) continue;
      const d = await r.json().catch(() => ({}));
      console.log('[ZOHO] Attachments response keys:', Object.keys(d));
      const list = d.attachment || d.attachments || [];
      console.log('[ZOHO] Attachment list:', JSON.stringify(list.map(a => ({ name: a.name, filename: a.filename, file_name: a.file_name, id: a.id, attachment_id: a.attachment_id, id_string: a.id_string, download_url: a.download_url, content_url: a.content_url }))));
      if (list.length || d.attachment) return { ok: true, attachments: list };
    } catch(e) { console.log('[ZOHO] Attachments error:', e.message); }
  }
  return { ok: false, error: 'No attachments found', attachments: [] };
}

async function zohoDownloadAttachment(token, portal, projectId, taskId, attachId, dc, downloadUrl, fileId) {
  const accessToken = await zohoGetAccessToken(token, dc);
  console.log('[ZOHO] Download attachment - attachId:', attachId, 'taskId:', taskId, 'projectId:', projectId, 'fileId:', fileId);
  const h1 = 'https://projectsapi.zoho' + (dc || '.com');
  const urls = [];
  // WorkDrive API v1 — direct file download using third_party_file_id
  if (fileId) {
    urls.push('https://workdrive.zoho' + (dc || '.com') + '/api/v1/download/' + fileId);
    urls.push('https://workdrive.zoho' + (dc || '.com') + '/api/v1/files/' + fileId + '/download');
  }
  // Documents API v3
  if (fileId) {
    urls.push(h1 + '/api/v3/portal/' + portal + '/projects/' + projectId + '/documents/' + fileId + '?action=download');
  }
  if (downloadUrl) urls.push(downloadUrl);
  urls.push(
    h1 + '/api/v3/portal/' + portal + '/projects/' + projectId + '/attachments/' + attachId + '?action=download&entity_type=task&entity_id=' + taskId,
  );
  for (const url of urls) {
    try {
      console.log('[ZOHO] Trying download URL:', url);
      const r = await fetch(url, {
        headers: { 'Authorization': 'Zoho-oauthtoken ' + accessToken },
        signal: AbortSignal.timeout(15000)
      });
      console.log('[ZOHO] Download response:', r.status, r.headers.get('content-type'));
      if (!r.ok) { console.log('[ZOHO] Download not ok, trying next'); continue; }
      const ct = (r.headers.get('content-type') || '').toLowerCase();
      const text = await r.text();
      console.log('[ZOHO] Download body preview:', text.slice(0, 200));
      try {
        const json = JSON.parse(text);
        // Check if this is a JSON error response
        if (json.error) { console.log('[ZOHO] Download returned error JSON:', json.error); continue; }
        // Skip if this is attachment metadata, not the actual file content
        if (json.attachment && Array.isArray(json.attachment)) { console.log('[ZOHO] Got attachment metadata instead of file, trying next'); continue; }
        if (json.attachments && Array.isArray(json.attachments)) { console.log('[ZOHO] Got attachments metadata instead of file, trying next'); continue; }
        // Could be a response with download_url
        if (json.download_url) {
          console.log('[ZOHO] Following download_url:', json.download_url);
          const r2 = await fetch(json.download_url, { headers: { 'Authorization': 'Zoho-oauthtoken ' + accessToken }, signal: AbortSignal.timeout(15000) });
          if (r2.ok) { const t2 = await r2.text(); try { return { ok:true, data: JSON.parse(t2), raw: t2 }; } catch(e2) { return { ok:true, data:null, raw:t2 }; } }
        }
        return { ok: true, data: json, raw: text };
      } catch(e) {
        // Non-JSON response — could be raw file content
        return { ok: true, data: null, raw: text };
      }
    } catch(e) { console.log('[ZOHO] Download error:', e.message); }
  }
  return { ok: false, error: 'Could not download attachment from any endpoint' };
}

async function zohoGetTaskComments(token, portal, projectId, taskId, dc) {
  try {
    const accessToken = await zohoGetAccessToken(token, dc);
    const url = zohoBase(dc) + '/portal/' + portal + '/projects/' + projectId + '/tasks/' + taskId + '/comments?page=1&per_page=100';
    console.log('[ZOHO] Getting task comments:', url);
    const r = await fetch(url, {
      headers: { 'Authorization': 'Zoho-oauthtoken ' + accessToken },
      signal: AbortSignal.timeout(15000)
    });
    if (!r.ok) return { ok: false, error: 'HTTP ' + r.status };
    const d = await r.json().catch(() => ({}));
    const comments = d.comments || (Array.isArray(d) ? d : []);
    console.log('[ZOHO] Comments count:', comments.length);
    // Find the comment with WEBAPI_STEPS marker — prefer base64 over plain JSON
    let b64Result = null, plainResult = null;
    for (const c of comments) {
      let content = c.content || '';
      console.log('[ZOHO] Comment preview:', content.slice(0, 100));
      // Zoho may wrap content in HTML tags or encode entities
      content = content.replace(/<[^>]+>/g, '').replace(/&lt;/g,'<').replace(/&gt;/g,'>').replace(/&amp;/g,'&').replace(/&quot;/g,'"').replace(/&#39;/g,"'").replace(/&nbsp;/g,' ');
      // Try base64 format (preserves {{random:...}} tokens)
      if (!b64Result) {
        const mb = content.match(/\[WEBAPI_STEPS_B64\]([\s\S]*?)\[WEBAPI_STEPS_B64_END\]/);
        if (mb) {
          try {
            const steps = JSON.parse(decodeURIComponent(escape(atob(mb[1].trim()))));
            console.log('[ZOHO] Found base64 steps in comment, steps count:', steps.steps?.length);
            b64Result = { ok: true, stepsData: steps };
          } catch(e) { console.log('[ZOHO] Failed to parse base64 steps:', e.message); }
        }
      }
      // Try plain JSON format (legacy fallback)
      if (!plainResult) {
        const m = content.match(/\[WEBAPI_STEPS_START\]([\s\S]*?)\[WEBAPI_STEPS_END\]/);
        if (m) {
          try {
            const steps = JSON.parse(m[1]);
            console.log('[ZOHO] Found plain steps in comment, steps count:', steps.steps?.length);
            plainResult = { ok: true, stepsData: steps };
          } catch(e) { console.log('[ZOHO] Failed to parse steps from comment:', e.message); }
        }
      }
      if (b64Result) break; // base64 is preferred, stop early if found
    }
    if (b64Result) return b64Result;
    if (plainResult) return plainResult;
    return { ok: true, stepsData: null, commentCount: comments.length };
  } catch(e) {
    return { ok: false, error: e.message };
  }
}
