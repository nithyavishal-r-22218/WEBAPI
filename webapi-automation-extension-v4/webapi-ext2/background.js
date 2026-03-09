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
        broadcast({type:'LOCATOR_SELECTED', locator: msg.locator});
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
        // Re-broadcast to all frames in the recording tab so iframes get notified
        if (REC.active && REC.tabId) {
          chrome.tabs.sendMessage(REC.tabId, {type:'SCROLL_DETECTED'}).catch(()=>{});
        }
        reply({ok:true});
        break;
      }
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

  // ── ZPQA-first selector builder ────────────────────────────────────────────
  function sel(el) {
    if (!el) return 'body';
    if (el === document.body) {
      // Detect contenteditable body (rich text editors)
      if (el.getAttribute('contenteditable') === 'true') {
        const aria = el.getAttribute('aria-label');
        if (aria) return `body[aria-label="${aria}"]`;
        const cls = Array.from(el.classList || []).filter(c => !/^(hover|focus|active|is-|ng-|v-|css-)/.test(c)).slice(0, 2);
        if (cls.length) return 'body.' + cls.join('.');
        return 'body[contenteditable="true"]';
      }
      return 'body';
    }
    // Handle contenteditable elements
    if (el.getAttribute && el.getAttribute('contenteditable') === 'true') {
      const aria = el.getAttribute('aria-label');
      if (aria) return `[aria-label="${aria}"]`;
      const role = el.getAttribute('role');
      if (role) return `[role="${role}"][contenteditable="true"]`;
    }
    // Priority 1: ZPQA locator
    const zpqa = el.getAttribute('data-zpqa');
    if (zpqa) return `[data-zpqa="${zpqa}"]`;
    // Priority 2: test IDs
    const tid = el.dataset?.testid || el.getAttribute('data-testid') || el.getAttribute('data-test') || el.getAttribute('data-cy') || el.getAttribute('data-qa');
    if (tid) return `[data-testid="${tid}"]`;
    // Priority 3: aria-label (skip trivial "true"/"false" values)
    const aria = el.getAttribute('aria-label');
    if (aria && aria !== 'true' && aria !== 'false') return `[aria-label="${aria}"]`;
    // Priority 3b: data-tooltip
    const tooltip = el.getAttribute('data-tooltip');
    if (tooltip && tooltip !== 'true' && tooltip !== 'false') return `[data-tooltip="${tooltip}"]`;
    // Priority 4: role + aria-label or role + data-tooltip (valid CSS)
    const role = el.getAttribute('role');
    if (role && aria && aria !== 'true') return `[role="${role}"][aria-label="${aria}"]`;
    if (role && tooltip && tooltip !== 'true') return `[role="${role}"][data-tooltip="${tooltip}"]`;
    // Priority 4b: role + text (Playwright-only :has-text, handled by replay sel())
    const txt  = (el.innerText || '').trim().slice(0, 30);
    if (role && txt) return `[role="${role}"]:has-text("${txt}")`;
    // Priority 5: id
    if (el.id) return '#' + CSS.escape(el.id);
    // Priority 6: name attr
    const name = el.getAttribute('name');
    if (name) return `${el.tagName.toLowerCase()}[name="${name}"]`;
    // Priority 7: stable classes
    const cls = Array.from(el.classList || [])
      .filter(c => !/^(hover|focus|active|is-|ng-|v-|css-)/.test(c))
      .slice(0, 2);
    if (cls.length) return el.tagName.toLowerCase() + '.' + cls.join('.');
    return el.tagName.toLowerCase();
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
    if (key === lastActionKey && step.action !== 'navigate') return;
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
  if (isTopFrame) send({ action:'navigate', target:location.href, value:'', url:location.href, t:Date.now() });

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
      chrome.runtime.sendMessage({ type:'REC_INSERT_BEFORE_LAST', step:{ action:'scroll_to', target:target, tagName:tagName, text:text, value:'', url:location.href, t:Date.now(), bounds:bounds, scrollTimeout:10000, scrollAttempts:20 } }).catch(() => {});
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
    if (el.closest('#__webapi_lpanel') || el.closest('#__webapi_highlight') || el.closest('#__webapi_hlabel')) return;
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
        const api = window.__WEBAPI_API;
        const tgt = api ? (api.getAllLocators(el)[0]?.value || sel(el)) : sel(el);
        const tagName = el.tagName.toLowerCase();
        const text = (el.innerText||el.getAttribute('aria-label')||el.title||'').trim().slice(0,60);
        send({ action:'hover', target:tgt, tagName:tagName, text:text, value:'', url:location.href, t:Date.now(), bounds:snap(el) });
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
    if (el.closest('#__webapi_lpanel') || el.closest('#__webapi_highlight') || el.closest('#__webapi_hlabel')) return;
    if (window.__WEBAPI_API) window.__WEBAPI_API.updateHighlight(el);
  }, true);

  // ── Click → show locator picker → record step on selection ──────────────────
  document.addEventListener('click', e => {    if (!window.__WEBAPI_REC__) return;    if (window.__WEBAPI_INSPECTING__) return;
    const el = e.target;
    if (el.closest('#' + PILL_ID)) return;
    if (el.closest('#__webapi_scroll_popup')) return;
    if (el.closest('#__webapi_lpanel') || el.closest('#__webapi_highlight') || el.closest('#__webapi_hlabel')) return;

    const api = window.__WEBAPI_API;

    function recordClick(target, tagName, text, bounds) {
      send({ action:'click', target:target, tagName:tagName, text:text, value:'', url:location.href, t:Date.now(), bounds:bounds });
      // After recording click, check if scroll was detected and offer scroll_to
      maybeShowScrollConfirm(target, tagName, text, bounds);
    }

    if (api) {
      const locators = api.getAllLocators(el);
      const info = { tagName:el.tagName.toLowerCase(), text:(el.innerText||el.value||el.placeholder||'').trim().slice(0,60), url:location.href, bounds:snap(el), t:Date.now() };
      if (locators.length <= 1) {
        recordClick(locators[0]?.value || sel(el), info.tagName, info.text, info.bounds);
      } else {
        api.showLocatorPanel(el, function(loc) {
          recordClick(loc.value, info.tagName, info.text, info.bounds);
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
    if (el.closest('#__webapi_lpanel') || el.closest('#__webapi_highlight') || el.closest('#__webapi_hlabel')) return;

    const api = window.__WEBAPI_API;

    function recordRightClick(target, tagName, text, bounds) {
      send({ action:'rightclick', target:target, tagName:tagName, text:text, value:'', url:location.href, t:Date.now(), bounds:bounds });
    }

    if (api) {
      const locators = api.getAllLocators(el);
      const info = { tagName:el.tagName.toLowerCase(), text:(el.innerText||el.value||el.placeholder||'').trim().slice(0,60), url:location.href, bounds:snap(el), t:Date.now() };
      if (locators.length <= 1) {
        recordRightClick(locators[0]?.value || sel(el), info.tagName, info.text, info.bounds);
      } else {
        api.showLocatorPanel(el, function(loc) {
          recordRightClick(loc.value, info.tagName, info.text, info.bounds);
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

  // ── Type (debounced, captures final value only) ──────────────────────────────
  const inputMap = new WeakMap();
  document.addEventListener('input', e => {
    if (!window.__WEBAPI_REC__) return;
    if (window.__WEBAPI_INSPECTING__) return;
    const el = e.target;

    // Handle contenteditable elements (rich text editors like <body contenteditable>)
    const editableRoot = getEditableRoot(el);
    if (editableRoot) {
      clearTimeout(inputMap.get(editableRoot));
      inputMap.set(editableRoot, setTimeout(() => {
        lastActionKey = '';
        const api = window.__WEBAPI_API;
        const tgt = api ? (api.getAllLocators(editableRoot)[0]?.value || sel(editableRoot)) : sel(editableRoot);
        const content = editableRoot.innerText || editableRoot.textContent || '';
        send({ action:'type', target:tgt, tagName:editableRoot.tagName.toLowerCase(),
          text:editableRoot.getAttribute('aria-label') || editableRoot.className || 'contenteditable',
          value:content.trim().slice(0, 500), url:location.href, t:Date.now(),
          contenteditable:true });
      }, 800));
      return;
    }

    if (!['INPUT','TEXTAREA','SELECT'].includes(el.tagName)) return;
    clearTimeout(inputMap.get(el));
    inputMap.set(el, setTimeout(() => {
      lastActionKey = '';
      const api = window.__WEBAPI_API;
      const tgt = api ? (api.getAllLocators(el)[0]?.value || sel(el)) : sel(el);
      send({ action: el.tagName==='SELECT' ? 'select' : 'type',
        target:tgt, tagName:el.tagName.toLowerCase(),
        text:el.placeholder||el.name||el.ariaLabel||'',
        value:el.value, url:location.href, t:Date.now() });
    }, 600));
  }, true);

  // ── Double-click → assert ───────────────────────────────────────────────────
  document.addEventListener('dblclick', e => {
    if (!window.__WEBAPI_REC__) return;
    if (window.__WEBAPI_INSPECTING__) return;
    const el = e.target;
    if (el.closest('#' + PILL_ID)) return;
    const text = (el.innerText || '').trim().slice(0, 80);
    if (!text) return;
    lastActionKey = '';
    const api = window.__WEBAPI_API;
    const tgt = api ? (api.getAllLocators(el)[0]?.value || sel(el)) : sel(el);
    send({ action:'assert_text', target:tgt, value:text, text, url:location.href, t:Date.now() });
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

    const api = window.__WEBAPI_API;
    const tgt = api ? (api.getAllLocators(e.target)[0]?.value || sel(e.target)) : sel(e.target);
    send({ action:'key', target:tgt, value:combo, text:combo, url:location.href, t:Date.now(),
           modifiers:{ ctrlKey:e.ctrlKey||e.metaKey, altKey:e.altKey, shiftKey:e.shiftKey } });
  }, true);

  // ── Page refresh / navigation capture ───────────────────────────────────────
  window.addEventListener('beforeunload', () => {
    chrome.runtime.sendMessage({ type:'REC_STEP', step:{
      action:'navigate', target:location.href, value:'', url:location.href,
      note:'page-refresh', t:Date.now(), id:++seq
    }}).catch(() => {});
  });

  // ── SPA navigation ───────────────────────────────────────────────────────────
  const pPush = history.pushState.bind(history);
  const pRepl = history.replaceState.bind(history);
  history.pushState = (...a) => { pPush(...a); setTimeout(() => { lastActionKey=''; send({ action:'navigate', target:location.href, value:'', url:location.href, t:Date.now() }); }, 50); };
  history.replaceState = (...a) => { pRepl(...a); setTimeout(() => { lastActionKey=''; send({ action:'navigate', target:location.href, value:'', url:location.href, t:Date.now() }); }, 50); };
  window.addEventListener('popstate', () => { lastActionKey=''; send({ action:'navigate', target:location.href, value:'', url:location.href, t:Date.now() }); });

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
//  CODE GENERATION
// ══════════════════════════════════════════════════
function genCode(rec, fw, lang) {
  const steps = rec.steps||[];
  const nets  = rec.network||[];
  const name  = rec.name||'RecordedTest';
  const safe  = name.replace(/[^a-zA-Z0-9]/g,'_');

  // Step converters per framework
  const S = (step) => {
    const t=step.target, v=(step.value||'').replace(/'/g,"\\'");
    switch(step.action) {
      case 'navigate':
        if(fw==='playwright') return `  await page.goto('${t}');`;
        if(fw==='cypress')    return `    cy.visit('${t}');`;
        if(fw==='selenium')   return `    driver.get("${t}");`;
        if(fw==='puppeteer')  return `  await page.goto('${t}');`;
        if(fw==='testcafe')   return `  await t.navigateTo('${t}');`;
        return `// navigate ${t}`;
      case 'click':
        if(fw==='playwright') return `  await page.click('${t}'); // ${step.text||''}`;
        if(fw==='cypress')    return `    cy.get('${t}').click(); // ${step.text||''}`;
        if(fw==='selenium')   return `    driver.findElement(By.css("${t}")).click();`;
        if(fw==='puppeteer')  return `  await page.click('${t}');`;
        if(fw==='testcafe')   return `  await t.click(Selector('${t}'));`;
        return `// click ${t}`;
      case 'type':
        if(fw==='playwright') return `  await page.fill('${t}', '${v}');`;
        if(fw==='cypress')    return `    cy.get('${t}').clear().type('${v}');`;
        if(fw==='selenium')   return `    driver.findElement(By.css("${t}")).clear();\n    driver.findElement(By.css("${t}")).sendKeys("${v}");`;
        if(fw==='puppeteer')  return `  await page.type('${t}', '${v}');`;
        if(fw==='testcafe')   return `  await t.typeText(Selector('${t}'), '${v}', { replace: true });`;
        return `// type ${t}`;
      case 'select':
        if(fw==='playwright') return `  await page.selectOption('${t}', '${v}');`;
        if(fw==='cypress')    return `    cy.get('${t}').select('${v}');`;
        if(fw==='selenium')   return `    new Select(driver.findElement(By.css("${t}"))).selectByValue("${v}");`;
        if(fw==='puppeteer')  return `  await page.select('${t}', '${v}');`;
        return `// select ${t}`;
      case 'assert_text':
        if(fw==='playwright') return `  await expect(page.locator('${t}')).toContainText('${v}');`;
        if(fw==='cypress')    return `    cy.get('${t}').should('contain.text', '${v}');`;
        if(fw==='selenium')   return `    assertThat(driver.findElement(By.css("${t}")).getText(), containsString("${v}"));`;
        if(fw==='testcafe')   return `  await t.expect(Selector('${t}').textContent).contains('${v}');`;
        return `// assert ${t} contains "${v}"`;
      case 'scroll_to':
        if(fw==='playwright') return `  await page.locator('${t}').scrollIntoViewIfNeeded({ timeout: ${step.scrollTimeout||10000} }); // scroll to element`;
        if(fw==='cypress')    return `    cy.get('${t}', { timeout: ${step.scrollTimeout||10000} }).scrollIntoView();`;
        if(fw==='selenium')   return `    driver.executeScript("arguments[0].scrollIntoView(true)", driver.findElement(By.css("${t}")));`;
        if(fw==='puppeteer')  return `  await page.waitForSelector('${t}', { timeout: ${step.scrollTimeout||10000} });\n  await page.$eval('${t}', el => el.scrollIntoView({ behavior: 'smooth', block: 'center' }));`;
        if(fw==='testcafe')   return `  await t.scrollIntoView(Selector('${t}'));`;
        return `// scroll_to ${t}`;
      case 'hover':
        if(fw==='playwright') return `  await page.hover('${t}'); // ${step.text||''}`;
        if(fw==='cypress')    return `    cy.get('${t}').trigger('mouseover'); // ${step.text||''}`;
        if(fw==='selenium')   return `    new Actions(driver).moveToElement(driver.findElement(By.css("${t}"))).perform();`;
        if(fw==='puppeteer')  return `  await page.hover('${t}');`;
        if(fw==='testcafe')   return `  await t.hover(Selector('${t}'));`;
        return `// hover ${t}`;
      case 'key':
        if(fw==='playwright') return `  await page.keyboard.press('${v}');`;
        if(fw==='cypress')    return `    cy.get('body').type('${'{'+v.replace(/\+/g,'}{').replace(/{([a-z])}/g,'$1')+'}'}', { release: false });`;
        if(fw==='selenium')   return `    new Actions(driver).sendKeys(${v.includes('+') ? v.split('+').map(k=>'Keys.'+k.toUpperCase()).join(', ') : 'Keys.'+v.toUpperCase()}).perform();`;
        if(fw==='puppeteer')  return `  await page.keyboard.press('${v}');`;
        if(fw==='testcafe')   return `  await t.pressKey('${v.toLowerCase().replace(/\+/g,' ')}');`;
        return `// key ${v}`;
      case 'rightclick':
        if(fw==='playwright') return `  await page.click('${t}', { button: 'right' }); // ${step.text||''}`;
        if(fw==='cypress')    return `    cy.get('${t}').rightclick(); // ${step.text||''}`;
        if(fw==='selenium')   return `    new Actions(driver).contextClick(driver.findElement(By.css("${t}"))).perform();`;
        if(fw==='puppeteer')  return `  await page.click('${t}', { button: 'right' });`;
        if(fw==='testcafe')   return `  await t.rightClick(Selector('${t}'));`;
        return `// rightclick ${t}`;
      default: return `  // ${step.action}: ${t}`;
    }
  };

  const stepsCode = steps.map(S).join('\n');
  const apiCode = nets.slice(0,5).map(n=>`  // 🌐 ${n.method} ${n.url} → ${n.status}`).join('\n');

  // Language templates
  if(fw==='playwright') {
    if(lang==='javascript') return `const { test, expect } = require('@playwright/test');

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

test('${name}', async ({ page }: { page: Page }) => {
${stepsCode}
});`;
    if(lang==='python') {
      const py = steps.map(s=>{
        const t=s.target, v=(s.value||'').replace(/"/g,'\\"');
        switch(s.action){
          case 'navigate': return `    page.goto("${t}")`;
          case 'click': return `    page.click("${t}")  # ${s.text||''}`;
          case 'type': return `    page.fill("${t}", "${v}")`;
          case 'select': return `    page.select_option("${t}", "${v}")`;
          case 'assert_text': return `    expect(page.locator("${t}")).to_contain_text("${v}")`;
          case 'hover': return `    page.hover("${t}")  # ${s.text||''}`;
          case 'key': return `    page.keyboard.press("${v}")`;
          case 'rightclick': return `    page.click("${t}", button="right")  # ${s.text||''}`;
          default: return `    # ${s.action}: ${t}`;
        }
      }).join('\n');
      return `import pytest\nfrom playwright.sync_api import Page, expect\n\ndef test_${safe.toLowerCase()}(page: Page):\n    """${name} — ${new Date().toLocaleString()}"""\n\n${py}\n`;
    }
    if(lang==='java') {
      const jv = steps.map(s=>{
        switch(s.action){
          case 'navigate': return `        page.navigate("${s.target}");`;
          case 'click': return `        page.click("${s.target}");`;
          case 'type': return `        page.fill("${s.target}", "${s.value||''}");`;
          case 'assert_text': return `        assertThat(page.locator("${s.target}")).containsText("${s.value||''}");`;
          case 'hover': return `        page.hover("${s.target}");`;
          case 'key': return `        page.keyboard().press("${s.value||''}");`;
          case 'rightclick': return `        page.click("${s.target}", new Page.ClickOptions().setButton(MouseButton.RIGHT));`;
          default: return `        // ${s.action}`;
        }
      }).join('\n');
      return `import com.microsoft.playwright.*;\nimport static com.microsoft.playwright.assertions.PlaywrightAssertions.assertThat;\nimport org.junit.jupiter.api.Test;\n\nclass ${safe}Test {\n    @Test\n    void test${safe}() {\n        try (Playwright pw = Playwright.create()) {\n            Page page = pw.chromium().launch().newPage();\n${jv}\n        }\n    }\n}`;
    }
    if(lang==='csharp') {
      const cs = steps.map(s=>{
        switch(s.action){
          case 'navigate': return `        await Page.GotoAsync("${s.target}");`;
          case 'click': return `        await Page.ClickAsync("${s.target}");`;
          case 'type': return `        await Page.FillAsync("${s.target}", "${s.value||''}");`;
          case 'assert_text': return `        await Expect(Page.Locator("${s.target}")).ToContainTextAsync("${s.value||''}");`;
          case 'hover': return `        await Page.HoverAsync("${s.target}");`;
          case 'key': return `        await Page.Keyboard.PressAsync("${s.value||''}");`;
          case 'rightclick': return `        await Page.ClickAsync("${s.target}", new() { Button = MouseButton.Right });`;
          default: return `        // ${s.action}`;
        }
      }).join('\n');
      return `using Microsoft.Playwright.NUnit;\nusing NUnit.Framework;\n\n[TestFixture]\npublic class ${safe}Tests : PageTest {\n    [Test]\n    public async Task Test${safe}() {\n${cs}\n    }\n}`;
    }
  }

  if(fw==='cypress') {
    const body = steps.map(S).join('\n');
    if(lang==='typescript') return `describe('${name}', () => {\n  it('recorded flow', () => {\n${body}\n  });\n});`;
    return `describe('${name}', () => {\n  it('recorded flow', () => {\n${body}\n  });\n});`;
  }

  if(fw==='selenium') {
    if(lang==='python') {
      const py = steps.map(s=>{
        const t=s.target, v=s.value||'';
        switch(s.action){
          case 'navigate': return `        self.driver.get("${t}")`;
          case 'click': return `        self.driver.find_element(By.CSS_SELECTOR, "${t}").click()`;
          case 'type': return `        el = self.driver.find_element(By.CSS_SELECTOR, "${t}")\n        el.clear(); el.send_keys("${v}")`;
          case 'assert_text': return `        assert "${v}" in self.driver.find_element(By.CSS_SELECTOR, "${t}").text`;
          case 'hover': return `        from selenium.webdriver.common.action_chains import ActionChains\n        ActionChains(self.driver).move_to_element(self.driver.find_element(By.CSS_SELECTOR, "${t}")).perform()`;
          case 'key': return `        from selenium.webdriver.common.keys import Keys\n        ActionChains(self.driver).send_keys(${v.includes('+') ? v.split('+').map(k=>'Keys.'+k.toUpperCase()).join(', ') : 'Keys.'+v.toUpperCase()}).perform()`;
          case 'rightclick': return `        from selenium.webdriver.common.action_chains import ActionChains\n        ActionChains(self.driver).context_click(self.driver.find_element(By.CSS_SELECTOR, "${t}")).perform()`;
          default: return `        # ${s.action}`;
        }
      }).join('\n');
      return `import unittest\nfrom selenium import webdriver\nfrom selenium.webdriver.common.by import By\n\nclass ${safe}Test(unittest.TestCase):\n    def setUp(self):\n        self.driver = webdriver.Chrome()\n        self.driver.implicitly_wait(10)\n    def tearDown(self): self.driver.quit()\n\n    def test_flow(self):\n${py}\n\nif __name__ == '__main__': unittest.main()`;
    }
    if(lang==='java') {
      const jv = steps.map(s=>{
        switch(s.action){
          case 'navigate': return `        driver.get("${s.target}");`;
          case 'click': return `        driver.findElement(By.cssSelector("${s.target}")).click();`;
          case 'type': return `        driver.findElement(By.cssSelector("${s.target}")).sendKeys("${s.value||''}");`;
          case 'hover': return `        new org.openqa.selenium.interactions.Actions(driver).moveToElement(driver.findElement(By.cssSelector("${s.target}"))).perform();`;
          case 'key': return `        new org.openqa.selenium.interactions.Actions(driver).sendKeys(${(s.value||'').includes('+') ? (s.value||'').split('+').map(k=>'Keys.'+k.toUpperCase()).join(', ') : 'Keys.'+(s.value||'').toUpperCase()}).perform();`;
          case 'rightclick': return `        new org.openqa.selenium.interactions.Actions(driver).contextClick(driver.findElement(By.cssSelector("${s.target}"))).perform();`;
          default: return `        // ${s.action}`;
        }
      }).join('\n');
      return `import org.junit.jupiter.api.*;\nimport org.openqa.selenium.*;\nimport org.openqa.selenium.chrome.ChromeDriver;\n\nclass ${safe}Test {\n    WebDriver driver;\n    @BeforeEach void setUp(){ driver = new ChromeDriver(); }\n    @AfterEach  void tearDown(){ driver.quit(); }\n\n    @Test void testFlow() {\n${jv}\n    }\n}`;
    }
    const seJs = steps.map(S).join('\n');
    return `const { Builder, By } = require('selenium-webdriver');\n\ndescribe('${name}', function() {\n  let driver;\n  before(async () => { driver = await new Builder().forBrowser('chrome').build(); });\n  after(async  () => { await driver.quit(); });\n\n  it('flow', async function() {\n${seJs}\n  });\n});`;
  }

  if(fw==='puppeteer') {
    const ppJs = steps.map(S).join('\n');
    if(lang==='typescript') return `import puppeteer from 'puppeteer';\n\ndescribe('${name}', () => {\n  let browser: puppeteer.Browser, page: puppeteer.Page;\n  beforeAll(async () => { browser = await puppeteer.launch(); page = await browser.newPage(); });\n  afterAll(async  () => await browser.close());\n\n  test('flow', async () => {\n${ppJs}\n  });\n});`;
    return `const puppeteer = require('puppeteer');\n\ndescribe('${name}', () => {\n  let browser, page;\n  beforeAll(async () => { browser = await puppeteer.launch({headless:'new'}); page = await browser.newPage(); });\n  afterAll(async  () => await browser.close());\n\n  test('flow', async () => {\n${ppJs}\n  });\n});`;
  }

  if(fw==='testcafe') {
    const tcCode = steps.map(S).join('\n');
    return `import { Selector } from 'testcafe';\n\nfixture('${name}').page('${steps[0]?.target||'http://localhost'}');\n\ntest('recorded flow', async t => {\n${tcCode}\n});`;
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
      // Handle Playwright-style :has-text() pseudo-selector (not valid CSS)
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
        // Check iframe context if needed
        if (step && step.iframe && step.iframeSelector) {
          const iframe = document.querySelector(step.iframeSelector);
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

      // If the step came from an iframe, search inside that iframe's document
      if (step && step.iframe && step.iframeSelector) {
        const iframe = document.querySelector(step.iframeSelector);
        if (iframe && iframe.contentDocument) {
          return iframe.contentDocument.querySelector(selector);
        }
        // Fallback: try all iframes
        const iframes = document.querySelectorAll('iframe');
        for (const f of iframes) {
          try {
            const found = f.contentDocument && f.contentDocument.querySelector(selector);
            if (found) return found;
          } catch(e) { /* cross-origin */ }
        }
      }
      // Try top-level first
      const topEl = document.querySelector(selector);
      if (topEl) return topEl;
      // Fallback: search all iframes even if step doesn't have iframe flag
      const iframes = document.querySelectorAll('iframe');
      for (const f of iframes) {
        try {
          const found = f.contentDocument && f.contentDocument.querySelector(selector);
          if (found) return found;
        } catch(e) { /* cross-origin */ }
      }
      return null;
    }

    function wait(ms) {
      return new Promise(r => setTimeout(r, ms));
    }

    async function tryStep(s) {
      const el = sel(s.target, s);
      switch (s.action) {
        case 'navigate':
          if (location.href !== s.target) {
            location.href = s.target;
            await wait(1200);
          }
          break;
        case 'click':
          if (!el) throw new Error('Element not found: ' + s.target);
          el.click();
          await wait(300);
          break;
        case 'type':
          if (!el) throw new Error('Element not found: ' + s.target);
          el.focus();
          if (s.contenteditable || (el.getAttribute && el.getAttribute('contenteditable') === 'true') || el.isContentEditable) {
            // Contenteditable element (rich text editor body)
            el.innerText = s.value || '';
            el.dispatchEvent(new Event('input', { bubbles:true }));
          } else {
            el.value = s.value || '';
            el.dispatchEvent(new Event('input', { bubbles:true }));
            el.dispatchEvent(new Event('change', { bubbles:true }));
          }
          await wait(150);
          break;
        case 'select':
          if (!el) throw new Error('Element not found: ' + s.target);
          el.value = s.value || '';
          el.dispatchEvent(new Event('change', { bubbles:true }));
          await wait(150);
          break;
        case 'assert_text':
          if (!el) throw new Error('Assert target not found: ' + s.target);
          if (!el.textContent.includes(s.value)) {
            throw new Error('Assert failed: expected "' + s.value + '" in ' + s.target);
          }
          break;
        case 'scroll_to': {
          const maxAttempts = s.scrollAttempts || 20;
          const timeout = s.scrollTimeout || 10000;
          const interval = Math.max(200, Math.floor(timeout / maxAttempts));
          let found = null;
          for (let a = 0; a < maxAttempts; a++) {
            found = sel(s.target, s);
            if (found) break;
            // Scroll in the appropriate context
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
          if (!found) throw new Error('scroll_to: Element not found after ' + maxAttempts + ' attempts: ' + s.target);
          found.scrollIntoView({ behavior:'smooth', block:'center' });
          await wait(400);
          break;
        }
        case 'hover': {
          let hEl = el;
          if (!hEl) {
            // Retry up to 5s waiting for hover target to appear in the DOM
            for (let attempt = 0; attempt < 10; attempt++) {
              await wait(500);
              hEl = sel(s.target, s);
              if (hEl) break;
            }
          }
          if (!hEl) throw new Error('Hover target not found: ' + s.target);
          hEl.scrollIntoView({ behavior:'smooth', block:'center' });
          await wait(200);
          hEl.dispatchEvent(new MouseEvent('mouseenter', { bubbles:true, cancelable:true }));
          hEl.dispatchEvent(new MouseEvent('mouseover', { bubbles:true, cancelable:true }));
          hEl.dispatchEvent(new MouseEvent('mousemove', { bubbles:true, cancelable:true }));
          await wait(600);
          break;
        }
        case 'key': {
          const combo = s.value || '';
          const parts = combo.split('+');
          const mainKey = parts[parts.length - 1];
          const mods = { ctrlKey: false, altKey: false, shiftKey: false, metaKey: false };
          for (let p = 0; p < parts.length - 1; p++) {
            const m = parts[p].toLowerCase();
            if (m === 'control') { mods.ctrlKey = true; mods.metaKey = true; }
            if (m === 'alt') mods.altKey = true;
            if (m === 'shift') mods.shiftKey = true;
          }
          const target = el || document.activeElement || document.body;

          // For Enter: trigger click or form submit for native behavior
          if (mainKey === 'Enter') {
            target.dispatchEvent(new KeyboardEvent('keydown', { key:'Enter', code:'Enter', keyCode:13, bubbles:true, cancelable:true, ...mods }));
            if (target.tagName === 'BUTTON' || target.tagName === 'A' || target.getAttribute('role') === 'button') {
              target.click();
            } else if (target.form) {
              target.form.requestSubmit ? target.form.requestSubmit() : target.form.submit();
            } else if (target.tagName === 'INPUT') {
              target.click();
            }
            target.dispatchEvent(new KeyboardEvent('keyup', { key:'Enter', code:'Enter', keyCode:13, bubbles:true, ...mods }));
          }
          // For Tab: move focus to next/previous focusable element
          else if (mainKey === 'Tab') {
            target.dispatchEvent(new KeyboardEvent('keydown', { key:'Tab', code:'Tab', keyCode:9, bubbles:true, cancelable:true, ...mods }));
            const focusable = Array.from(document.querySelectorAll('a[href],button:not([disabled]),input:not([disabled]),select:not([disabled]),textarea:not([disabled]),[tabindex]:not([tabindex="-1"])'));
            const idx = focusable.indexOf(target);
            if (idx !== -1) {
              const next = mods.shiftKey ? focusable[idx - 1] || focusable[focusable.length - 1] : focusable[idx + 1] || focusable[0];
              if (next) next.focus();
            }
            target.dispatchEvent(new KeyboardEvent('keyup', { key:'Tab', code:'Tab', keyCode:9, bubbles:true, ...mods }));
          }
          // For Escape: blur the focused element and dispatch
          else if (mainKey === 'Escape') {
            target.dispatchEvent(new KeyboardEvent('keydown', { key:'Escape', code:'Escape', keyCode:27, bubbles:true, cancelable:true, ...mods }));
            target.blur();
            target.dispatchEvent(new KeyboardEvent('keyup', { key:'Escape', code:'Escape', keyCode:27, bubbles:true, ...mods }));
          }
          // For Backspace/Delete in input fields
          else if (mainKey === 'Backspace' || mainKey === 'Delete') {
            if (target.tagName === 'INPUT' || target.tagName === 'TEXTAREA') {
              target.dispatchEvent(new KeyboardEvent('keydown', { key:mainKey, bubbles:true, cancelable:true, ...mods }));
              const start = target.selectionStart || 0;
              const end = target.selectionEnd || 0;
              const val = target.value || '';
              if (start !== end) {
                target.value = val.slice(0, start) + val.slice(end);
                target.selectionStart = target.selectionEnd = start;
              } else if (mainKey === 'Backspace' && start > 0) {
                target.value = val.slice(0, start - 1) + val.slice(start);
                target.selectionStart = target.selectionEnd = start - 1;
              } else if (mainKey === 'Delete' && start < val.length) {
                target.value = val.slice(0, start) + val.slice(start + 1);
                target.selectionStart = target.selectionEnd = start;
              }
              target.dispatchEvent(new Event('input', { bubbles:true }));
              target.dispatchEvent(new KeyboardEvent('keyup', { key:mainKey, bubbles:true, ...mods }));
            } else {
              target.dispatchEvent(new KeyboardEvent('keydown', { key:mainKey, bubbles:true, cancelable:true, ...mods }));
              target.dispatchEvent(new KeyboardEvent('keyup', { key:mainKey, bubbles:true, ...mods }));
            }
          }
          // For Ctrl+A: select all text in input
          else if (mainKey === 'a' && mods.ctrlKey) {
            target.dispatchEvent(new KeyboardEvent('keydown', { key:'a', bubbles:true, cancelable:true, ...mods }));
            if (target.select) target.select();
            target.dispatchEvent(new KeyboardEvent('keyup', { key:'a', bubbles:true, ...mods }));
          }
          // All other keys: dispatch events
          else {
            target.dispatchEvent(new KeyboardEvent('keydown', { key: mainKey, bubbles:true, cancelable:true, ...mods }));
            target.dispatchEvent(new KeyboardEvent('keyup',   { key: mainKey, bubbles:true, ...mods }));
          }
          await wait(150);
          break;
        }
        case 'rightclick': {
          const rEl = el || document.querySelector(s.target);
          if (rEl) {
            rEl.scrollIntoView({ behavior:'smooth', block:'center' });
            await wait(200);
            rEl.dispatchEvent(new MouseEvent('contextmenu', { bubbles:true, cancelable:true, button:2 }));
          }
          await wait(200);
          break;
        }
      }
    }

    for (let i = 0; i < steps.length; i++) {
      const s = steps[i];
      if (s.action === 'navigate') { log.push({ i, action:s.action, ok:true }); continue; }
      try {
        await tryStep(s);
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
