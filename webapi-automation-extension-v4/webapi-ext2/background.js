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
      case 'REC_NET':   addNet(msg.net); reply({ok:true}); break;
      case 'REC_DEL_STEP': delStep(msg.idx); reply({ok:true}); break;

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
      default: reply({ok:false,err:'unknown:'+msg.type});
    }
  })();
  return true; // keep channel open
});

// ── Tab close cleanup ────────────────────────────
chrome.tabs.onRemoved.addListener(id => { if(REC.active && REC.tabId===id) stopRec(); });

// ══════════════════════════════════════════════════
//  RECORDING
// ══════════════════════════════════════════════════
async function startRec(tabId) {
  REC = { active:true, tabId, steps:[], network:[], t0:Date.now() };
  await chrome.scripting.executeScript({ target:{tabId}, func:injectRecorder });
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
    chrome.tabs.sendMessage(REC.tabId, {type:'REC_STOPPED'}).catch(()=>{});
  }
  REC = { active:false, tabId:null, steps:[], network:[], t0:null };
  broadcast({ type:'REC_STOPPED', rec });
  return rec;
}

function addStep(step) {
  step.idx = REC.steps.length;
  REC.steps.push(step);
  broadcast({ type:'STEP', step, total:REC.steps.length });
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
    if (!el || el === document.body) return 'body';
    // Priority 1: ZPQA locator
    const zpqa = el.getAttribute('data-zpqa');
    if (zpqa) return `[data-zpqa="${zpqa}"]`;
    // Priority 2: test IDs
    const tid = el.dataset?.testid || el.getAttribute('data-testid') || el.getAttribute('data-test') || el.getAttribute('data-cy') || el.getAttribute('data-qa');
    if (tid) return `[data-testid="${tid}"]`;
    // Priority 3: aria-label
    const aria = el.getAttribute('aria-label');
    if (aria) return `[aria-label="${aria}"]`;
    // Priority 4: role + text
    const role = el.getAttribute('role');
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

  function send(step) {
    // Dedup: skip if same action+target+value as the very last step
    const key = step.action + '|' + step.target + '|' + (step.value || '');
    if (key === lastActionKey && step.action !== 'navigate') return;
    lastActionKey = key;
    step.id = ++seq;
    chrome.runtime.sendMessage({ type:'REC_STEP', step }).catch(() => {});
    updCnt(seq);
  }

  // ── Floating recording banner ───────────────────────────────────────────────
  const BANNER_ID = '__webapi_banner';
  if (document.getElementById(BANNER_ID)) return;

  const banner = document.createElement('div');
  banner.id = BANNER_ID;
  banner.innerHTML = `
    <div id="__wb_wrap" style="
      position:fixed;top:12px;right:12px;z-index:2147483647;
      background:linear-gradient(135deg,#0f172a,#1e3a5f);
      color:#fff;border-radius:12px;padding:10px 14px;
      display:flex;align-items:center;gap:10px;
      font:600 12px/1 -apple-system,sans-serif;
      border:1px solid rgba(255,255,255,.12);
      box-shadow:0 8px 32px rgba(0,0,0,.5);
      cursor:move;user-select:none;min-width:220px">
      <span style="color:#00d4aa;letter-spacing:.5px;font-size:11px;flex-shrink:0">⬡ WEBAPI</span>
      <span style="display:flex;align-items:center;gap:5px;flex-shrink:0">
        <span id="__wb_dot" style="width:7px;height:7px;border-radius:50%;background:#dc2626;display:inline-block;animation:wb_blink 1s infinite"></span>
        <span style="color:#fca5a5;font-size:11px">REC</span>
      </span>
      <span id="__wb_cnt" style="color:#9ca3af;font-weight:400;font-size:11px">0 steps</span>
      <button id="__wb_stop" style="
        margin-left:auto;background:#dc2626;color:#fff;border:none;
        border-radius:6px;padding:4px 10px;font:700 11px -apple-system,sans-serif;
        cursor:pointer;flex-shrink:0">■ Stop</button>
      <button id="__wb_min" title="Minimize" style="
        background:rgba(255,255,255,.1);color:#fff;border:none;
        border-radius:4px;width:20px;height:20px;font-size:14px;
        cursor:pointer;display:flex;align-items:center;justify-content:center;padding:0;flex-shrink:0">_</button>
    </div>
    <style>@keyframes wb_blink{0%,100%{opacity:1}50%{opacity:.2}}</style>`;
  document.body.appendChild(banner);

  // ── Minimized pill ──────────────────────────────────────────────────────────
  const pill = document.createElement('div');
  pill.id = '__wb_pill';
  pill.innerHTML = `<div style="
    position:fixed;bottom:16px;right:16px;z-index:2147483647;
    background:#dc2626;color:#fff;border-radius:20px;padding:6px 14px;
    font:700 12px/1 -apple-system,sans-serif;cursor:pointer;
    box-shadow:0 4px 16px rgba(220,38,38,.4);display:none;
    animation:wb_blink 2s infinite">⏺ <span id="__wb_pill_cnt">0</span></div>`;
  document.body.appendChild(pill);

  const wrap = document.getElementById('__wb_wrap');
  const pillEl = pill.querySelector('div');
  const pillCnt = document.getElementById('__wb_pill_cnt');

  document.getElementById('__wb_min').addEventListener('click', e => {
    e.stopPropagation();
    wrap.style.display = 'none';
    pillEl.style.display = 'flex';
  });
  pillEl.addEventListener('click', () => {
    pillEl.style.display = 'none';
    wrap.style.display = 'flex';
  });

  function updCnt(n) {
    const e = document.getElementById('__wb_cnt');
    if (e) e.textContent = n + ' step' + (n !== 1 ? 's' : '');
    if (pillCnt) pillCnt.textContent = n;
  }

  // ── Drag ───────────────────────────────────────────────────────────────────
  let dragX=0, dragY=0, dragging=false;
  wrap.addEventListener('mousedown', e => {
    if (e.target.tagName === 'BUTTON') return;
    dragging = true; dragX = e.clientX - wrap.getBoundingClientRect().left;
    dragY = e.clientY - wrap.getBoundingClientRect().top;
    wrap.style.cursor = 'grabbing';
  });
  document.addEventListener('mousemove', e => {
    if (!dragging) return;
    const p = document.getElementById('__wb_wrap');
    p.style.right = 'auto';
    p.style.top   = 'auto';
    p.style.left  = (e.clientX - dragX) + 'px';
    p.style.top   = (e.clientY - dragY) + 'px';
  });
  document.addEventListener('mouseup', () => { dragging = false; if(wrap) wrap.style.cursor = 'move'; });

  document.getElementById('__wb_stop').addEventListener('click', () =>
    chrome.runtime.sendMessage({ type:'REC_STOP' })
  );

  // ── Initial navigate ────────────────────────────────────────────────────────
  send({ action:'navigate', target:location.href, value:'', url:location.href, t:Date.now() });

  // ── Click ───────────────────────────────────────────────────────────────────
  document.addEventListener('click', e => {
    const el = e.target;
    if (el.closest('#' + BANNER_ID) || el.closest('#__wb_pill')) return;
    send({ action:'click', target:sel(el), tagName:el.tagName.toLowerCase(),
      text:(el.innerText||el.value||el.placeholder||'').trim().slice(0,60),
      value:'', url:location.href, t:Date.now(), bounds:snap(el) });
  }, true);

  // ── Type (debounced, captures final value only) ──────────────────────────────
  const inputMap = new WeakMap();
  document.addEventListener('input', e => {
    const el = e.target;
    if (!['INPUT','TEXTAREA','SELECT'].includes(el.tagName)) return;
    clearTimeout(inputMap.get(el));
    inputMap.set(el, setTimeout(() => {
      lastActionKey = ''; // allow re-capture after debounce
      send({ action: el.tagName==='SELECT' ? 'select' : 'type',
        target:sel(el), tagName:el.tagName.toLowerCase(),
        text:el.placeholder||el.name||el.ariaLabel||'',
        value:el.value, url:location.href, t:Date.now() });
    }, 600));
  }, true);

  // ── Double-click → assert ───────────────────────────────────────────────────
  document.addEventListener('dblclick', e => {
    const el = e.target;
    if (el.closest('#' + BANNER_ID) || el.closest('#__wb_pill')) return;
    const text = (el.innerText || '').trim().slice(0, 80);
    if (!text) return;
    lastActionKey = '';
    send({ action:'assert_text', target:sel(el), value:text, text, url:location.href, t:Date.now() });
    el.style.outline = '2px solid #00d4aa';
    setTimeout(() => el.style.outline = '', 1500);
  }, true);

  // ── Keyboard shortcuts ───────────────────────────────────────────────────────
  document.addEventListener('keydown', e => {
    if (e.target.closest('#' + BANNER_ID)) return;
    if (['Enter','Tab','Escape'].includes(e.key) && ['INPUT','TEXTAREA'].includes(e.target.tagName)) {
      send({ action:'key', target:sel(e.target), value:e.key, text:e.key, url:location.href, t:Date.now() });
    }
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
      document.getElementById(BANNER_ID)?.remove();
      document.getElementById('__wb_pill')?.remove();
      window.__WEBAPI_REC__ = false;
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
      case 'key':
        if(fw==='playwright') return `  await page.keyboard.press('${v}');`;
        if(fw==='cypress')    return `    cy.get('${t}').type('{${v.toLowerCase()}}');`;
        return `// key ${v}`;
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
          case 'key': return `    page.keyboard.press("${v}")`;
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
  return res;
}

// Injected into the tab to replay recorded steps
function replaySteps(steps) {
  return new Promise(async (resolve) => {
    const log = [];
    let errMsg = null;

    function sel(selector) {
      return document.querySelector(selector);
    }

    function wait(ms) {
      return new Promise(r => setTimeout(r, ms));
    }

    async function tryStep(s) {
      const el = sel(s.target);
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
          el.value = s.value || '';
          el.dispatchEvent(new Event('input', { bubbles:true }));
          el.dispatchEvent(new Event('change', { bubbles:true }));
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
        case 'key':
          if (el) {
            el.dispatchEvent(new KeyboardEvent('keydown', { key: s.value, bubbles:true }));
            el.dispatchEvent(new KeyboardEvent('keyup',   { key: s.value, bubbles:true }));
          }
          await wait(100);
          break;
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
    const r = await fetch(cfg.url+'/run', {
      method:'POST',
      headers:{ 'Content-Type':'application/json', 'x-api-key':cfg.key },
      body: JSON.stringify({ type:'AUTOMATE', payload:data }),
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
