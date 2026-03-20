// ── Keep service worker alive ──────────────────────
// MV3 service workers sleep after 30s of inactivity; this prevents it
const _keepAlive = () => chrome.runtime.getPlatformInfo(() => {});
setInterval(_keepAlive, 20000);

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
  if (!d.settings)   await chrome.storage.local.set({ settings:{ url:'http://localhost:4000', key:'godmode-dev-key', fw:'playwright', lang:'javascript', theme:'light' } });
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
    name: 'Recording '+new Date().toLocaleTimeString('en',{hour:'2-digit',minute:'2-digit'}),
    steps: [...REC.steps],
    network: [...REC.network],
    startUrl: REC.steps[0]?.url || '',
    ms: Date.now() - REC.t0,
    at: new Date().toISOString()
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

  // ── ZPQA-first XPath selector builder ────────────────────────────────────────
  function sel(el) {
    if (!el) return '//body';
    const tag = el.tagName ? el.tagName.toLowerCase() : '*';
    if (el === document.body) {
      // Detect contenteditable body (rich text editors)
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
    // Priority 1: ZPQA locator
    const zpqa = el.getAttribute('data-zpqa');
    if (zpqa) return `//${tag}[@data-zpqa='${zpqa}']`;
    // Priority 2: test IDs
    const tid = el.dataset?.testid || el.getAttribute('data-testid') || el.getAttribute('data-test') || el.getAttribute('data-cy') || el.getAttribute('data-qa');
    if (tid) return `//${tag}[@data-testid='${tid}']`;
    // Priority 3: aria-label (skip trivial "true"/"false" values)
    const aria = el.getAttribute('aria-label');
    if (aria && aria !== 'true' && aria !== 'false') return `//${tag}[@aria-label='${aria}']`;
    // Priority 3b: data-tooltip
    const tooltip = el.getAttribute('data-tooltip');
    if (tooltip && tooltip !== 'true' && tooltip !== 'false') return `//${tag}[@data-tooltip='${tooltip}']`;
    // Priority 4: role + aria-label or role + data-tooltip
    const role = el.getAttribute('role');
    if (role && aria && aria !== 'true') return `//${tag}[@role='${role}' and @aria-label='${aria}']`;
    if (role && tooltip && tooltip !== 'true') return `//${tag}[@role='${role}' and @data-tooltip='${tooltip}']`;
    // Priority 4b: role + text
    const txt  = (el.innerText || '').trim().slice(0, 30);
    if (role && txt) return `//${tag}[@role='${role}' and contains(text(),'${txt.replace(/'/g, "\\'")}')]`;
    // Priority 5: id
    if (el.id) return `//${tag}[@id='${el.id}']`;
    // Priority 6: name attr
    const name = el.getAttribute('name');
    if (name) return `//${tag}[@name='${name}']`;
    // Priority 7: stable classes
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
    // Dedup: skip if same action+target+value as the very last step
    const key = step.action + '|' + step.target + '|' + (step.value || '');
    if (key === lastActionKey && step.action !== 'NAVIGATE_TO') return;
    lastActionKey = key;
    step.id = ++seq;
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

  // After a click is recorded, if scroll was detected, show confirmation with the locator
  function maybeShowScrollConfirm(target, tagName, text, bounds) {
    if (!scrollDetected) return;
    scrollDetected = false;
    removeScrollPopup();

    scrollPopup = document.createElement('div');
    scrollPopup.id = '__webapi_scroll_popup';
    scrollPopup.style.cssText = 'position:fixed;bottom:60px;right:12px;z-index:2147483647;background:linear-gradient(135deg,#0f172a,#1e3a5f);border:1px solid rgba(255,255,255,.18);border-radius:12px;padding:12px 16px;font:500 12px/1.5 -apple-system,system-ui,sans-serif;color:#fff;box-shadow:0 8px 30px rgba(0,0,0,.4);max-width:340px;';
    const shortTarget = target.length > 50 ? target.slice(0, 47) + '...' : target;
    scrollPopup.innerHTML =
      '<div style="margin-bottom:8px;font-weight:700;font-size:13px">📜 Scroll Detected</div>'
      + '<div style="color:#94a3b8;font-size:11px;margin-bottom:6px">Add a <b>scroll_to</b> step before clicking this element?</div>'
      + '<div style="background:rgba(255,255,255,.08);border:1px solid rgba(255,255,255,.12);border-radius:6px;padding:6px 10px;font:500 11px/1.4 \'DM Mono\',monospace;color:#93c5fd;word-break:break-all;margin-bottom:10px">' + shortTarget.replace(/</g,'&lt;').replace(/>/g,'&gt;') + '</div>'
      + '<div style="display:flex;gap:8px;justify-content:flex-end">'
      + '<button id="__wb_scroll_no" style="border:1px solid rgba(255,255,255,.2);background:none;color:#94a3b8;padding:4px 14px;border-radius:6px;font:600 11px -apple-system,sans-serif;cursor:pointer">No</button>'
      + '<button id="__wb_scroll_yes" style="border:none;background:#2563eb;color:#fff;padding:4px 14px;border-radius:6px;font:600 11px -apple-system,sans-serif;cursor:pointer">Yes</button>'
      + '</div>';
    document.documentElement.appendChild(scrollPopup);

    document.getElementById('__wb_scroll_no').addEventListener('click', ev => {
      ev.stopPropagation();
      removeScrollPopup();
    });
    document.getElementById('__wb_scroll_yes').addEventListener('click', ev => {
      ev.stopPropagation();
      // Insert scroll_to BEFORE the click step (which was already recorded)
      chrome.runtime.sendMessage({ type:'REC_INSERT_BEFORE_LAST', step:{ action:'SCROLL_TO_ELEMENT', target:target, tagName:tagName, text:text, value:'', url:location.href, t:Date.now(), bounds:bounds, scrollTimeout:10000, scrollAttempts:20 } }).catch(() => {});
      removeScrollPopup();
    });

    // Auto-dismiss after 10s
    setTimeout(() => { if (scrollPopup) removeScrollPopup(); }, 10000);
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
        const tgt = sel(el);
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
  document.addEventListener('mousemove', e => {
    if (!window.__WEBAPI_REC__) return;
    if (window.__WEBAPI_INSPECTING__) return;
    const el = e.target;
    if (!el || el === document.documentElement) { if (window.__WEBAPI_API) window.__WEBAPI_API.hideHighlight(); return; }
    if (el === document.body && el.getAttribute('contenteditable') !== 'true') { if (window.__WEBAPI_API) window.__WEBAPI_API.hideHighlight(); return; }
    if (el.closest('#' + PILL_ID)) return;
    if (el.closest('#__webapi_scroll_popup')) return;
    if (el.closest('#' + RANDOM_POPUP_ID)) return;
    if (el.closest('#__webapi_lpanel') || el.closest('#__webapi_highlight') || el.closest('#__webapi_hlabel') || el.closest('#__webapi_sleep_pill')) return;
    if (window.__WEBAPI_API) window.__WEBAPI_API.updateHighlight(el);
  }, true);

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

    if (api) {
      const info = { tagName:el.tagName.toLowerCase(), text:(el.innerText||el.value||el.placeholder||'').trim().slice(0,60), url:location.href, bounds:snap(el), t:Date.now() };
      const locators = api.getAllLocators(el);
      if (locators.length <= 1) {
        recordClick(sel(el), info.tagName, info.text, info.bounds);
      } else {
        api.showLocatorPanel(el, function(loc) {
          recordClick(sel(el), info.tagName, info.text, info.bounds, loc.sleep);
        });
      }
    } else {
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

    if (api) {
      const info = { tagName:el.tagName.toLowerCase(), text:(el.innerText||el.value||el.placeholder||'').trim().slice(0,60), url:location.href, bounds:snap(el), t:Date.now() };
      const locators = api.getAllLocators(el);
      if (locators.length <= 1) {
        recordRightClick(sel(el), info.tagName, info.text, info.bounds);
      } else {
        api.showLocatorPanel(el, function(loc) {
          recordRightClick(sel(el), info.tagName, info.text, info.bounds, loc.sleep);
        });
      }
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
    // Try below the element first
    let top = r.bottom + gap;
    let left = r.left;
    // If it would go off-screen bottom, place above
    if (top + 260 > window.innerHeight) top = Math.max(gap, r.top - 260 - gap);
    // Keep within horizontal bounds
    if (left + 320 > window.innerWidth) left = Math.max(gap, window.innerWidth - 330);
    if (left < gap) left = gap;
    popup.style.position = 'fixed';
    popup.style.top = top + 'px';
    popup.style.left = left + 'px';
    popup.style.bottom = 'auto';
    popup.style.right = 'auto';
  }
  function showRandomPrompt(step, el) {
    removeRandomPopup();
    randomPopup = document.createElement('div');
    randomPopup.id = RANDOM_POPUP_ID;
    const fieldLabel = step.text || step.target;
    const shortLabel = fieldLabel.length > 40 ? fieldLabel.slice(0, 37) + '...' : fieldLabel;
    const btnStyle = 'border:1px solid rgba(255,255,255,.15);background:rgba(255,255,255,.06);color:#fff;padding:6px 8px;border-radius:8px;font:600 11px -apple-system,sans-serif;cursor:pointer;text-align:center;transition:background .12s';
    randomPopup.style.cssText = 'z-index:2147483647;background:linear-gradient(135deg,#0f172a,#1e3a5f);border:1px solid rgba(255,255,255,.18);border-radius:12px;padding:14px 18px;font:500 12px/1.5 -apple-system,system-ui,sans-serif;color:#fff;box-shadow:0 8px 30px rgba(0,0,0,.4);max-width:320px;min-width:240px;';
    randomPopup.innerHTML =
      '<div id="__wb_rd_step1">'
      + '<div style="margin-bottom:8px;font-weight:700;font-size:13px">🎲 Use random data?</div>'
      + '<div style="color:#94a3b8;font-size:11px;margin-bottom:10px">Field: <b>' + shortLabel.replace(/</g,'&lt;').replace(/>/g,'&gt;') + '</b></div>'
      + '<div style="display:grid;grid-template-columns:1fr 1fr;gap:6px;margin-bottom:10px">'
      + '<button class="__wb_rd_btn" data-type="string" style="' + btnStyle + '">🔤 String</button>'
      + '<button class="__wb_rd_btn" data-type="number" style="' + btnStyle + '">🔢 Number</button>'
      + '<button class="__wb_rd_btn" data-type="email" style="' + btnStyle + '">📧 Email</button>'
      + '<button class="__wb_rd_btn" data-type="paragraph" style="' + btnStyle + '">📝 Paragraph</button>'
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

    // Hover effects on type buttons
    randomPopup.querySelectorAll('.__wb_rd_btn').forEach(btn => {
      btn.addEventListener('mouseenter', () => { btn.style.background = 'rgba(37,99,235,.5)'; btn.style.borderColor = '#2563eb'; });
      btn.addEventListener('mouseleave', () => { btn.style.background = 'rgba(255,255,255,.06)'; btn.style.borderColor = 'rgba(255,255,255,.15)'; });
      btn.addEventListener('click', ev => {
        ev.stopPropagation(); ev.preventDefault();
        chosenType = btn.dataset.type;
        if (chosenType === 'email') {
          // Email has no length — apply directly
          step.value = '{{random:email}}';
          send(step);
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
        randomAutoTimer = setTimeout(() => { if (randomPopup) { send(step); removeRandomPopup(); } }, 15000);
      });
    });

    // "No, use typed value"
    randomPopup.querySelector('#__wb_rd_no').addEventListener('click', ev => {
      ev.stopPropagation(); ev.preventDefault();
      send(step);
      removeRandomPopup();
    });

    // Back button
    randomPopup.querySelector('#__wb_rd_back').addEventListener('click', ev => {
      ev.stopPropagation(); ev.preventDefault();
      randomPopup.querySelector('#__wb_rd_step1').style.display = 'block';
      randomPopup.querySelector('#__wb_rd_step2').style.display = 'none';
      clearTimeout(randomAutoTimer);
      randomAutoTimer = setTimeout(() => { if (randomPopup) { send(step); removeRandomPopup(); } }, 8000);
    });

    // Apply button
    randomPopup.querySelector('#__wb_rd_apply').addEventListener('click', ev => {
      ev.stopPropagation(); ev.preventDefault();
      const len = parseInt(randomPopup.querySelector('#__wb_rd_len').value, 10) || defaults[chosenType] || 10;
      step.value = '{{random:' + chosenType + ':' + len + '}}';
      send(step);
      removeRandomPopup();
    });

    // Auto-dismiss after 8s — use typed value
    randomAutoTimer = setTimeout(() => {
      if (randomPopup) {
        send(step);
        removeRandomPopup();
      }
    }, 8000);
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
      clearTimeout(inputMap.get(editableRoot));
      inputMap.set(editableRoot, setTimeout(() => {
        lastActionKey = '';
        const tgt = sel(editableRoot);
        const content = editableRoot.innerText || editableRoot.textContent || '';
        const step = { action:'SEND_KEYS', target:tgt, tagName:editableRoot.tagName.toLowerCase(),
          text:editableRoot.getAttribute('aria-label') || editableRoot.className || 'contenteditable',
          value:content.trim().slice(0, 500), url:location.href, t:Date.now(),
          contenteditable:true };
        showRandomPrompt(step, editableRoot);
      }, 800));
      return;
    }

    if (!['INPUT','TEXTAREA','SELECT'].includes(el.tagName)) return;
    clearTimeout(inputMap.get(el));
    inputMap.set(el, setTimeout(() => {
      lastActionKey = '';
      const tgt = sel(el);
      if (el.tagName === 'SELECT') {
        send({ action:'SEND_KEYS', target:tgt, tagName:el.tagName.toLowerCase(),
          text:el.placeholder||el.name||el.ariaLabel||'',
          value:el.value, url:location.href, t:Date.now() });
      } else {
        const step = { action:'SEND_KEYS', target:tgt, tagName:el.tagName.toLowerCase(),
          text:el.placeholder||el.name||el.ariaLabel||'',
          value:el.value, url:location.href, t:Date.now() };
        showRandomPrompt(step, el);
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
    lastActionKey = '';
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
  history.pushState = (...a) => { pPush(...a); setTimeout(() => { lastActionKey=''; send({ action:'NAVIGATE_TO', target:location.href, value:'', url:location.href, t:Date.now() }); }, 50); };
  history.replaceState = (...a) => { pRepl(...a); setTimeout(() => { lastActionKey=''; send({ action:'NAVIGATE_TO', target:location.href, value:'', url:location.href, t:Date.now() }); }, 50); };
  window.addEventListener('popstate', () => { lastActionKey=''; send({ action:'NAVIGATE_TO', target:location.href, value:'', url:location.href, t:Date.now() }); });

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
}


// ══════════════════════════════════════════════════
//  WEBAPI SYNC  — mirror every write to the WEBAPI backend
// ══════════════════════════════════════════════════

// Fetch settings then POST/DELETE to WEBAPI. Never throws — errors are silent.
async function gmSync(method, path, body) {
  try {
    const d   = await chrome.storage.local.get('settings');
    const cfg = d.settings || {};
    const url = (cfg.url || 'http://localhost:4000') + path;
    const key = cfg.key || 'godmode-dev-key';
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

  // Parse a {{random:type:len}} token
  function parseRd(v) {
    const m = v.match(/^\{\{random:(\w+)(?::(\d+))?\}\}$/);
    if (!m) return null;
    return { type: m[1], len: m[2] ? parseInt(m[2]) : 10 };
  }

  // JS helper functions for random data generation
  const rdHelpersJS = `// Random data helpers
function _randStr(n){const c='abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ';let r='';for(let i=0;i<n;i++)r+=c[Math.floor(Math.random()*c.length)];return r;}
function _randNum(n){let r='';for(let i=0;i<n;i++)r+=Math.floor(Math.random()*10);if(r[0]==='0'&&n>1)r=(Math.floor(Math.random()*9)+1)+r.slice(1);return r;}
function _randEmail(){return _randStr(8).toLowerCase()+'@zohotest.com';}
function _randPara(n){const w=['the','quick','brown','fox','jumps','over','lazy','dog','lorem','ipsum','dolor','sit','amet'];let r='';while(r.length<n)r+=w[Math.floor(Math.random()*w.length)]+' ';return r.slice(0,n);}
`;

  const rdHelpersPy = `import random, string\n\ndef _rand_str(n):\n    return ''.join(random.choices(string.ascii_letters, k=n))\n\ndef _rand_num(n):\n    return str(random.randint(10**(n-1), 10**n-1)) if n > 1 else str(random.randint(0, 9))\n\ndef _rand_email():\n    return _rand_str(8).lower() + '@zohotest.com'\n\ndef _rand_para(n):\n    words = ['the','quick','brown','fox','jumps','over','lazy','dog','lorem','ipsum']\n    r = ''\n    while len(r) < n: r += random.choice(words) + ' '\n    return r[:n]\n`;

  // Return JS expression for a random token
  function rdExprJS(v) {
    const rd = parseRd(v);
    if (!rd) return "'" + v.replace(/'/g,"\\'") + "'";
    if (rd.type==='string')    return `_randStr(${rd.len})`;
    if (rd.type==='number')    return `_randNum(${rd.len})`;
    if (rd.type==='email')     return `_randEmail()`;
    if (rd.type==='paragraph') return `_randPara(${rd.len})`;
    if (rd.type==='xss')       return "'" + (XSS_PAYLOADS[rd.len]||XSS_PAYLOADS[0]).replace(/'/g,"\\'") + "'";
    return "'" + v.replace(/'/g,"\\'") + "'";
  }

  // Return Python expression for a random token
  function rdExprPy(v) {
    const rd = parseRd(v);
    if (!rd) return '"' + v.replace(/"/g,'\\"') + '"';
    if (rd.type==='string')    return `_rand_str(${rd.len})`;
    if (rd.type==='number')    return `_rand_num(${rd.len})`;
    if (rd.type==='email')     return `_rand_email()`;
    if (rd.type==='paragraph') return `_rand_para(${rd.len})`;
    if (rd.type==='xss')       return '"' + (XSS_PAYLOADS[rd.len]||XSS_PAYLOADS[0]).replace(/"/g,'\\"') + '"';
    return '"' + v.replace(/"/g,'\\"') + '"';
  }

  // Return Java expression for a random token
  function rdExprJava(v) {
    const rd = parseRd(v);
    if (!rd) return '"' + v.replace(/"/g,'\\"') + '"';
    if (rd.type==='string')    return `_randStr(${rd.len})`;
    if (rd.type==='number')    return `_randNum(${rd.len})`;
    if (rd.type==='email')     return `_randEmail()`;
    if (rd.type==='paragraph') return `_randPara(${rd.len})`;
    if (rd.type==='xss')       return '"' + (XSS_PAYLOADS[rd.len]||XSS_PAYLOADS[0]).replace(/"/g,'\\"') + '"';
    return '"' + v.replace(/"/g,'\\"') + '"';
  }

  function isRd(v) { return v && v.startsWith('{{random:') && v.endsWith('}}'); }

  // Step converters per framework
  const S = (step) => {
    const t=step.target, v=(step.value||'').replace(/'/g,"\\'");
    switch(step.action) {
      case 'NAVIGATE_TO':
        if(fw==='playwright') return `  await page.goto('${t}');`;
        if(fw==='cypress')    return `    cy.visit('${t}');`;
        if(fw==='selenium')   return `    driver.get("${t}");`;
        if(fw==='puppeteer')  return `  await page.goto('${t}');`;
        if(fw==='testcafe')   return `  await t.navigateTo('${t}');`;
        return `// NAVIGATE_TO ${t}`;
      case 'CLICK':
        if(fw==='playwright') return `  await page.click('${t}'); // ${step.text||''}`;
        if(fw==='cypress')    return `    cy.get('${t}').click(); // ${step.text||''}`;
        if(fw==='selenium')   return `    driver.findElement(By.css("${t}")).click();`;
        if(fw==='puppeteer')  return `  await page.click('${t}');`;
        if(fw==='testcafe')   return `  await t.click(Selector('${t}'));`;
        return `// CLICK ${t}`;
      case 'DOUBLE_CLICK':
        if(fw==='playwright') return `  await page.dblclick('${t}'); // ${step.text||''}`;
        if(fw==='cypress')    return `    cy.get('${t}').dblclick(); // ${step.text||''}`;
        if(fw==='selenium')   return `    new Actions(driver).doubleClick(driver.findElement(By.css("${t}"))).perform();`;
        if(fw==='puppeteer')  return `  await page.click('${t}', { clickCount: 2 });`;
        if(fw==='testcafe')   return `  await t.doubleClick(Selector('${t}'));`;
        return `// DOUBLE_CLICK ${t}`;
      case 'SEND_KEYS':
        if (isRd(step.value)) {
          const re = rdExprJS(step.value);
          if(fw==='playwright') return `  await page.fill('${t}', ${re});`;
          if(fw==='cypress')    return `    cy.get('${t}').clear().type(${re});`;
          if(fw==='selenium')   return `    driver.findElement(By.css("${t}")).clear();\n    driver.findElement(By.css("${t}")).sendKeys(${re});`;
          if(fw==='puppeteer')  return `  await page.type('${t}', ${re});`;
          if(fw==='testcafe')   return `  await t.typeText(Selector('${t}'), ${re}, { replace: true });`;
        }
        if(fw==='playwright') return `  await page.fill('${t}', '${v}');`;
        if(fw==='cypress')    return `    cy.get('${t}').clear().type('${v}');`;
        if(fw==='selenium')   return `    driver.findElement(By.css("${t}")).clear();\n    driver.findElement(By.css("${t}")).sendKeys("${v}");`;
        if(fw==='puppeteer')  return `  await page.type('${t}', '${v}');`;
        if(fw==='testcafe')   return `  await t.typeText(Selector('${t}'), '${v}', { replace: true });`;
        return `// SEND_KEYS ${t}`;
      case 'CLEAR':
        if(fw==='playwright') return `  await page.fill('${t}', '');`;
        if(fw==='cypress')    return `    cy.get('${t}').clear();`;
        if(fw==='selenium')   return `    driver.findElement(By.css("${t}")).clear();`;
        if(fw==='puppeteer')  return `  await page.$eval('${t}', el => el.value = '');`;
        if(fw==='testcafe')   return `  await t.selectText(Selector('${t}')).pressKey('delete');`;
        return `// CLEAR ${t}`;
      case 'ASSERT_CHECK':
        if(fw==='playwright') return `  await expect(page.locator('${t}')).toContainText('${v}');`;
        if(fw==='cypress')    return `    cy.get('${t}').should('contain.text', '${v}');`;
        if(fw==='selenium')   return `    assertThat(driver.findElement(By.css("${t}")).getText(), containsString("${v}"));`;
        if(fw==='testcafe')   return `  await t.expect(Selector('${t}').textContent).contains('${v}');`;
        return `// ASSERT_CHECK ${t} contains "${v}"`;
      case 'SCROLL_TO_ELEMENT':
        if(fw==='playwright') return `  await page.locator('${t}').scrollIntoViewIfNeeded({ timeout: ${step.scrollTimeout||10000} }); // scroll to element`;
        if(fw==='cypress')    return `    cy.get('${t}', { timeout: ${step.scrollTimeout||10000} }).scrollIntoView();`;
        if(fw==='selenium')   return `    driver.executeScript("arguments[0].scrollIntoView(true)", driver.findElement(By.css("${t}")));`;
        if(fw==='puppeteer')  return `  await page.waitForSelector('${t}', { timeout: ${step.scrollTimeout||10000} });\n  await page.$eval('${t}', el => el.scrollIntoView({ behavior: 'smooth', block: 'center' }));`;
        if(fw==='testcafe')   return `  await t.scrollIntoView(Selector('${t}'));`;
        return `// SCROLL_TO_ELEMENT ${t}`;
      case 'SCROLL_TO_ELEMENT_AND_CLICK':
        if(fw==='playwright') return `  await page.locator('${t}').scrollIntoViewIfNeeded();\n  await page.click('${t}');`;
        if(fw==='cypress')    return `    cy.get('${t}').scrollIntoView().click();`;
        if(fw==='selenium')   return `    {\n      WebElement el = driver.findElement(By.css("${t}"));\n      driver.executeScript("arguments[0].scrollIntoView(true)", el);\n      el.click();\n    }`;
        return `// SCROLL_TO_ELEMENT_AND_CLICK ${t}`;
      case 'MOVE_TO_ELEMENT':
      case 'MOVE_TO_ELEMENT_WITHOUT_CLICK':
        if(fw==='playwright') return `  await page.hover('${t}'); // ${step.text||''}`;
        if(fw==='cypress')    return `    cy.get('${t}').trigger('mouseover'); // ${step.text||''}`;
        if(fw==='selenium')   return `    new Actions(driver).moveToElement(driver.findElement(By.css("${t}"))).perform();`;
        if(fw==='puppeteer')  return `  await page.hover('${t}');`;
        if(fw==='testcafe')   return `  await t.hover(Selector('${t}'));`;
        return `// ${step.action} ${t}`;
      case 'ENTER_KEY':
        if(fw==='playwright') return `  await page.keyboard.press('Enter');`;
        if(fw==='cypress')    return `    cy.get('${t}').type('{enter}');`;
        if(fw==='selenium')   return `    new Actions(driver).sendKeys(Keys.ENTER).perform();`;
        if(fw==='puppeteer')  return `  await page.keyboard.press('Enter');`;
        if(fw==='testcafe')   return `  await t.pressKey('enter');`;
        return `// ENTER_KEY`;
      case 'ESCAPE_KEY':
        if(fw==='playwright') return `  await page.keyboard.press('Escape');`;
        if(fw==='cypress')    return `    cy.get('body').type('{esc}');`;
        if(fw==='selenium')   return `    new Actions(driver).sendKeys(Keys.ESCAPE).perform();`;
        if(fw==='puppeteer')  return `  await page.keyboard.press('Escape');`;
        if(fw==='testcafe')   return `  await t.pressKey('escape');`;
        return `// ESCAPE_KEY`;
      case 'BACK_SPACE_KEY':
        if(fw==='playwright') return `  await page.keyboard.press('Backspace');`;
        if(fw==='cypress')    return `    cy.get('${t}').type('{backspace}');`;
        if(fw==='selenium')   return `    new Actions(driver).sendKeys(Keys.BACK_SPACE).perform();`;
        if(fw==='puppeteer')  return `  await page.keyboard.press('Backspace');`;
        if(fw==='testcafe')   return `  await t.pressKey('backspace');`;
        return `// BACK_SPACE_KEY`;
      case 'CUT_COPY_PASTE_SELECTALL':
      case 'SHORTCUT_KEY':
        if(fw==='playwright') return `  await page.keyboard.press('${v}');`;
        if(fw==='cypress')    return `    cy.get('body').type('${'{'+v.replace(/\+/g,'}{').replace(/{([a-z])}/g,'$1')+'}'}', { release: false });`;
        if(fw==='selenium')   return `    new Actions(driver).sendKeys(${v.includes('+') ? v.split('+').map(k=>'Keys.'+k.toUpperCase()).join(', ') : 'Keys.'+v.toUpperCase()}).perform();`;
        if(fw==='puppeteer')  return `  await page.keyboard.press('${v}');`;
        if(fw==='testcafe')   return `  await t.pressKey('${v.toLowerCase().replace(/\+/g,' ')}');`;
        return `// ${step.action} ${v}`;
      case 'RIGHT_CLICK':
        if(fw==='playwright') return `  await page.click('${t}', { button: 'right' }); // ${step.text||''}`;
        if(fw==='cypress')    return `    cy.get('${t}').rightclick(); // ${step.text||''}`;
        if(fw==='selenium')   return `    new Actions(driver).contextClick(driver.findElement(By.css("${t}"))).perform();`;
        if(fw==='puppeteer')  return `  await page.click('${t}', { button: 'right' });`;
        if(fw==='testcafe')   return `  await t.rightClick(Selector('${t}'));`;
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
          case 'SEND_KEYS': return isRd(s.value) ? `    page.fill("${t}", ${rdExprPy(s.value)})` : `    page.fill("${t}", "${v}")`;
          case 'CLEAR': return `    page.fill("${t}", "")`;
          case 'ASSERT_CHECK': return `    expect(page.locator("${t}")).to_contain_text("${v}")`;
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
          case 'SEND_KEYS': return isRd(s.value) ? `        page.fill("${s.target}", ${rdExprJava(s.value)});` : `        page.fill("${s.target}", "${s.value||''}");`;
          case 'CLEAR': return `        page.fill("${s.target}", "");`;
          case 'ASSERT_CHECK': return `        assertThat(page.locator("${s.target}")).containsText("${s.value||''}");`;
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
          case 'SEND_KEYS': return isRd(s.value) ? `        await Page.FillAsync("${s.target}", ${rdExprJS(s.value)});` : `        await Page.FillAsync("${s.target}", "${s.value||''}");`;
          case 'CLEAR': return `        await Page.FillAsync("${s.target}", "");`;
          case 'ASSERT_CHECK': return `        await Expect(Page.Locator("${s.target}")).ToContainTextAsync("${s.value||''}");`;
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
    if(lang==='python') {
      const py = steps.map(s=>{
        const t=s.target, v=s.value||'';
        switch(s.action){
          case 'NAVIGATE_TO': return `        self.driver.get("${t}")`;
          case 'CLICK': return `        self.driver.find_element(By.CSS_SELECTOR, "${t}").click()`;
          case 'DOUBLE_CLICK': return `        from selenium.webdriver.common.action_chains import ActionChains\n        ActionChains(self.driver).double_click(self.driver.find_element(By.CSS_SELECTOR, "${t}")).perform()`;
          case 'SEND_KEYS': return isRd(s.value) ? `        el = self.driver.find_element(By.CSS_SELECTOR, "${t}")\n        el.clear(); el.send_keys(${rdExprPy(s.value)})` : `        el = self.driver.find_element(By.CSS_SELECTOR, "${t}")\n        el.clear(); el.send_keys("${v}")`;
          case 'CLEAR': return `        self.driver.find_element(By.CSS_SELECTOR, "${t}").clear()`;
          case 'ASSERT_CHECK': return `        assert "${v}" in self.driver.find_element(By.CSS_SELECTOR, "${t}").text`;
          case 'MOVE_TO_ELEMENT': case 'MOVE_TO_ELEMENT_WITHOUT_CLICK': return `        from selenium.webdriver.common.action_chains import ActionChains\n        ActionChains(self.driver).move_to_element(self.driver.find_element(By.CSS_SELECTOR, "${t}")).perform()`;
          case 'ENTER_KEY': return `        from selenium.webdriver.common.keys import Keys\n        ActionChains(self.driver).send_keys(Keys.ENTER).perform()`;
          case 'ESCAPE_KEY': return `        from selenium.webdriver.common.keys import Keys\n        ActionChains(self.driver).send_keys(Keys.ESCAPE).perform()`;
          case 'BACK_SPACE_KEY': return `        from selenium.webdriver.common.keys import Keys\n        ActionChains(self.driver).send_keys(Keys.BACK_SPACE).perform()`;
          case 'CUT_COPY_PASTE_SELECTALL': case 'SHORTCUT_KEY': return `        from selenium.webdriver.common.keys import Keys\n        ActionChains(self.driver).send_keys(${v.includes('+') ? v.split('+').map(k=>'Keys.'+k.toUpperCase()).join(', ') : 'Keys.'+v.toUpperCase()}).perform()`;
          case 'RIGHT_CLICK': return `        from selenium.webdriver.common.action_chains import ActionChains\n        ActionChains(self.driver).context_click(self.driver.find_element(By.CSS_SELECTOR, "${t}")).perform()`;
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
          case 'CLICK': return `        driver.findElement(By.cssSelector("${s.target}")).click();`;
          case 'DOUBLE_CLICK': return `        new org.openqa.selenium.interactions.Actions(driver).doubleClick(driver.findElement(By.cssSelector("${s.target}"))).perform();`;
          case 'SEND_KEYS': return isRd(s.value) ? `        driver.findElement(By.cssSelector("${s.target}")).sendKeys(${rdExprJava(s.value)});` : `        driver.findElement(By.cssSelector("${s.target}")).sendKeys("${s.value||''}");`;
          case 'CLEAR': return `        driver.findElement(By.cssSelector("${s.target}")).clear();`;
          case 'MOVE_TO_ELEMENT': case 'MOVE_TO_ELEMENT_WITHOUT_CLICK': return `        new org.openqa.selenium.interactions.Actions(driver).moveToElement(driver.findElement(By.cssSelector("${s.target}"))).perform();`;
          case 'ENTER_KEY': return `        new org.openqa.selenium.interactions.Actions(driver).sendKeys(Keys.ENTER).perform();`;
          case 'ESCAPE_KEY': return `        new org.openqa.selenium.interactions.Actions(driver).sendKeys(Keys.ESCAPE).perform();`;
          case 'BACK_SPACE_KEY': return `        new org.openqa.selenium.interactions.Actions(driver).sendKeys(Keys.BACK_SPACE).perform();`;
          case 'CUT_COPY_PASTE_SELECTALL': case 'SHORTCUT_KEY': return `        new org.openqa.selenium.interactions.Actions(driver).sendKeys(${(s.value||'').includes('+') ? (s.value||'').split('+').map(k=>'Keys.'+k.toUpperCase()).join(', ') : 'Keys.'+(s.value||'').toUpperCase()}).perform();`;
          case 'RIGHT_CLICK': return `        new org.openqa.selenium.interactions.Actions(driver).contextClick(driver.findElement(By.cssSelector("${s.target}"))).perform();`;
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

  if(fw==='puppeteer') {
    const ppJs = steps.map(S).join('\n');
    if(lang==='typescript') return `import puppeteer from 'puppeteer';\n${hasRandom ? '\n'+rdHelpersJS : ''}\ndescribe('${name}', () => {\n  let browser: puppeteer.Browser, page: puppeteer.Page;\n  beforeAll(async () => { browser = await puppeteer.launch(); page = await browser.newPage(); });\n  afterAll(async  () => await browser.close());\n\n  test('flow', async () => {\n${ppJs}\n  });\n});`;
    return `const puppeteer = require('puppeteer');\n${hasRandom ? '\n'+rdHelpersJS : ''}\ndescribe('${name}', () => {\n  let browser, page;\n  beforeAll(async () => { browser = await puppeteer.launch({headless:'new'}); page = await browser.newPage(); });\n  afterAll(async  () => await browser.close());\n\n  test('flow', async () => {\n${ppJs}\n  });\n});`;
  }

  if(fw==='testcafe') {
    const tcCode = steps.map(S).join('\n');
    return `import { Selector } from 'testcafe';\n${hasRandom ? '\n'+rdHelpersJS : ''}\nfixture('${name}').page('${steps[0]?.target||'http://localhost'}');\n\ntest('recorded flow', async t => {\n${tcCode}\n});`;
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
      const rawSteps = c._recordingSteps;

      if (rawSteps && rawSteps.length > 0) {
        // Replay steps in the active tab using chrome.scripting
        const startUrl = c.webUrl || rawSteps[0]?.url || '';
        const tabs     = await chrome.tabs.query({ active:true, currentWindow:true });
        const tab      = tabs[0];

        if (!tab) {
          res.pass  = false; res.ms = Date.now()-t0;
          res.error = 'No active tab — open the target page and try again';
        } else {
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
          const result = await chrome.scripting.executeScript({
            target: { tabId: tab.id },
            func: replaySteps,
            args: [rawSteps]
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
function replaySteps(steps) {
  return new Promise(async (resolve) => {
    const log = [];
    let errMsg = null;

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
    function resolveValue(v) {
      if (!v || !v.startsWith('{{random:') || !v.endsWith('}}')) return v;
      const m = v.match(/^\{\{random:(\w+)(?::(\d+))?\}\}$/);
      if (!m) return v;
      const type = m[1], len = m[2] ? parseInt(m[2]) : 10;
      if (type === 'string') {
        const c = 'abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ';
        let r = ''; for (let i = 0; i < len; i++) r += c[Math.floor(Math.random()*c.length)];
        return r;
      }
      if (type === 'number') {
        let r = ''; for (let i = 0; i < len; i++) r += Math.floor(Math.random()*10);
        if (r[0]==='0' && len>1) r = (Math.floor(Math.random()*9)+1) + r.slice(1);
        return r;
      }
      if (type === 'email') {
        const c = 'abcdefghijklmnopqrstuvwxyz';
        let r = ''; for (let i = 0; i < 8; i++) r += c[Math.floor(Math.random()*c.length)];
        return r + '@zohotest.com';
      }
      if (type === 'paragraph') {
        const words = ['the','quick','brown','fox','jumps','over','lazy','dog','lorem','ipsum','dolor','sit','amet','testing','automation','quality','software','web','browser','data','input','form','field','check','verify'];
        let r = '';
        while (r.length < len) { r += words[Math.floor(Math.random()*words.length)] + ' '; }
        return r.slice(0, len);
      }
      if (type === 'xss') {
        return _xssPayloads[len] || _xssPayloads[0];
      }
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
          if (s.contenteditable || (el.getAttribute && el.getAttribute('contenteditable') === 'true') || el.isContentEditable) {
            el.innerText = _tv;
            el.dispatchEvent(new Event('input', { bubbles:true }));
          } else {
            el.value = _tv;
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
            el.value = '';
            el.dispatchEvent(new Event('input', { bubbles:true }));
            el.dispatchEvent(new Event('change', { bubbles:true }));
          }
          await wait(100);
          break;
        case 'ASSERT_CHECK':
          if (!el) throw new Error('Assert target not found: ' + s.target);
          if (!el.textContent.includes(s.value)) {
            throw new Error('Assert failed: expected "' + s.value + '" in ' + s.target);
          }
          break;
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
          el.dispatchEvent(new MouseEvent('mouseenter', { bubbles:true, cancelable:true }));
          el.dispatchEvent(new MouseEvent('mouseover', { bubbles:true, cancelable:true }));
          el.dispatchEvent(new MouseEvent('mousemove', { bubbles:true, cancelable:true }));
          await wait(600);
          if (s.action === 'MOVE_TO_ELEMENT') {
            el.click();
            await wait(300);
          }
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
          try { eval(s.value); } catch(e) { throw new Error('CUSTOM_JS error: ' + e.message); }
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
      if (s.action === 'NAVIGATE_TO') { log.push({ i, action:s.action, ok:true }); continue; }
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

    resolve({
      pass:  !errMsg,
      error: errMsg,
      note:  'Replayed ' + log.length + '/' + steps.length + ' steps',
      steps: log
    });
  });
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
    const r = await fetch((url||'http://localhost:4000')+'/health', {
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
      task = taskResp.tasks ? taskResp.tasks[0] || taskResp.tasks : taskResp;
      taskId = task.id || task.id_string;
    }

    // Step 1: Upload file to portal, Step 2: Associate with task
    async function uploadAndAttach(blob, filename) {
      // Step 1: Upload to portal-level attachments
      const fd = new FormData();
      fd.append('upload_file', blob, filename);
      const uploadUrl = base + '/portal/' + portal + '/attachments';
      console.log('[ZOHO] Step 1 - Uploading to portal:', uploadUrl);
      const ar = await fetch(uploadUrl, {
        method: 'POST',
        headers: { 'Authorization': 'Zoho-oauthtoken ' + accessToken },
        body: fd,
        signal: AbortSignal.timeout(15000)
      });
      const arData = await ar.json().catch(() => ({}));
      console.log('[ZOHO] Upload response:', ar.status, JSON.stringify(arData).slice(0, 500));
      if (!ar.ok) return { name: filename, ok: false, err: 'Upload failed (' + ar.status + ')' };

      // Extract attachment ID — v3 returns { attachment: [{ attachment_id: "..." }] }
      const attachList = arData.attachment || arData.attachments || [];
      const firstAttach = Array.isArray(attachList) ? attachList[0] : attachList;
      const attachId = (firstAttach && (firstAttach.attachment_id || firstAttach.id))
        || arData.attachment_id || arData.id
        || (Array.isArray(arData) && arData[0]?.attachment_id);
      if (!attachId) {
        console.log('[ZOHO] Could not extract attachment ID from:', JSON.stringify(arData).slice(0, 500));
        return { name: filename, ok: false, err: 'No attachment ID in response' };
      }
      console.log('[ZOHO] Extracted attachment ID:', attachId);

      // Step 2: Associate attachment with the task
      const assocUrl = base + '/portal/' + portal + '/projects/' + projectId + '/attachments/' + attachId;
      console.log('[ZOHO] Step 2 - Associating attachment', attachId, 'with task', taskId, ':', assocUrl);
      const assocFd = new FormData();
      assocFd.append('entity_type', 'task');
      assocFd.append('entity_id', String(taskId));
      const assocR = await fetch(assocUrl, {
        method: 'POST',
        headers: { 'Authorization': 'Zoho-oauthtoken ' + accessToken },
        body: assocFd,
        signal: AbortSignal.timeout(15000)
      });
      const assocData = await assocR.json().catch(() => ({}));
      console.log('[ZOHO] Associate response:', assocR.status, JSON.stringify(assocData).slice(0, 500));
      if (!assocR.ok) return { name: filename, ok: false, err: 'Associate failed (' + assocR.status + ')' };
      return { name: filename, ok: true };
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
