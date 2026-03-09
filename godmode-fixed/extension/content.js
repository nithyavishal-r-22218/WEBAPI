// WEBAPI Content Script — records clicks, inputs, navigation + element inspector
(function () {
  let active = false;
  let inspecting = false;
  let hoveredEl = null;
  let highlightBox = null;
  let locatorPanel = null;
  let selectedLocator = null;

  chrome.storage.local.get(['recording', 'inspecting'], (d) => {
    active = !!d.recording;
    if (d.inspecting) startInspect();
  });
  chrome.storage.onChanged.addListener(changes => {
    if (changes.recording) active = changes.recording.newValue;
    if (changes.inspecting) {
      if (changes.inspecting.newValue) startInspect();
      else stopInspect();
    }
  });

  // ── Listen for messages from popup/background ──
  chrome.runtime.onMessage.addListener((msg, sender, sendResponse) => {
    if (msg.type === 'START_INSPECT') { startInspect(); sendResponse({ ok: true }); }
    if (msg.type === 'STOP_INSPECT') { stopInspect(); sendResponse({ ok: true }); }
    if (msg.type === 'PING') { sendResponse({ ok: true }); }
    return false;
  });

  // ── Locator generators ──
  function getAllLocators(el) {
    const locators = [];
    const tag = el.tagName.toLowerCase();

    // 1. ID
    if (el.id) locators.push({ type: 'ID', value: `#${CSS.escape(el.id)}`, strategy: 'css' });

    // 2. data-testid
    if (el.dataset?.testid) locators.push({ type: 'data-testid', value: `[data-testid="${CSS.escape(el.dataset.testid)}"]`, strategy: 'css' });

    // 3. Name attribute
    if (el.name) locators.push({ type: 'Name', value: `[name="${CSS.escape(el.name)}"]`, strategy: 'css' });

    // 4. CSS with classes
    if (typeof el.className === 'string' && el.className.trim()) {
      const classes = [...el.classList].map(c => `.${CSS.escape(c)}`).join('');
      locators.push({ type: 'CSS (class)', value: `${tag}${classes}`, strategy: 'css' });
    }

    // 5. Text-based (links, buttons)
    const text = (el.textContent || '').trim();
    if (text && text.length < 60 && ['A', 'BUTTON', 'LABEL', 'SPAN'].includes(el.tagName)) {
      const safeText = text.replace(/"/g, '\\"');
      locators.push({ type: 'Text', value: `//${tag}[normalize-space()="${safeText}"]`, strategy: 'xpath' });
    }

    // 6. XPath — full path
    locators.push({ type: 'XPath (abs)', value: getXPath(el), strategy: 'xpath' });

    // 7. XPath — relative with tag
    const relXPath = getRelativeXPath(el);
    if (relXPath) locators.push({ type: 'XPath (rel)', value: relXPath, strategy: 'xpath' });

    // 8. CSS — nth-of-type
    const nthSel = getNthSelector(el);
    locators.push({ type: 'CSS (nth)', value: nthSel, strategy: 'css' });

    // 9. Aria label
    const ariaLabel = el.getAttribute('aria-label');
    if (ariaLabel) locators.push({ type: 'ARIA', value: `[aria-label="${CSS.escape(ariaLabel)}"]`, strategy: 'css' });

    // 10. Placeholder
    const placeholder = el.getAttribute('placeholder');
    if (placeholder) locators.push({ type: 'Placeholder', value: `[placeholder="${CSS.escape(placeholder)}"]`, strategy: 'css' });

    return locators;
  }

  function getXPath(el) {
    const parts = [];
    let node = el;
    while (node && node.nodeType === 1) {
      const tag = node.tagName.toLowerCase();
      const siblings = node.parentElement ? [...node.parentElement.children].filter(c => c.tagName === node.tagName) : [];
      const idx = siblings.indexOf(node) + 1;
      parts.unshift(siblings.length > 1 ? `${tag}[${idx}]` : tag);
      node = node.parentElement;
    }
    return '/' + parts.join('/');
  }

  function getRelativeXPath(el) {
    const tag = el.tagName.toLowerCase();
    if (el.id) return `//${tag}[@id="${el.id}"]`;
    if (el.name) return `//${tag}[@name="${el.name}"]`;
    if (typeof el.className === 'string' && el.className.trim()) {
      const cls = el.className.trim().split(/\s+/)[0];
      return `//${tag}[contains(@class,"${cls}")]`;
    }
    return null;
  }

  function getNthSelector(el) {
    const path = [];
    let node = el;
    for (let depth = 0; depth < 4 && node && node !== document.body; depth++) {
      const tag = node.tagName.toLowerCase();
      if (node.id) { path.unshift(`#${CSS.escape(node.id)}`); break; }
      const siblings = node.parentElement ? [...node.parentElement.children].filter(c => c.tagName === node.tagName) : [];
      const idx = siblings.indexOf(node);
      path.unshift(siblings.length > 1 ? `${tag}:nth-of-type(${idx + 1})` : tag);
      node = node.parentElement;
    }
    return path.join(' > ');
  }

  function getPrimarySelector(el) {
    if (el.dataset?.testid) return `[data-testid="${CSS.escape(el.dataset.testid)}"]`;
    if (el.id) return `#${CSS.escape(el.id)}`;
    if (el.name) return `[name="${CSS.escape(el.name)}"]`;
    return getNthSelector(el);
  }

  // ── Highlight overlay ──
  function createHighlight() {
    if (highlightBox) return;
    highlightBox = document.createElement('div');
    highlightBox.id = '__webapi_highlight';
    const s = highlightBox.style;
    s.position = 'fixed'; s.pointerEvents = 'none'; s.zIndex = '2147483646';
    s.border = '2px solid #3b8fd4'; s.borderRadius = '3px';
    s.background = 'rgba(59,143,212,0.08)';
    s.transition = 'all 0.07s ease'; s.display = 'none';
    // Tag label
    const label = document.createElement('div');
    label.id = '__webapi_highlight_tag';
    label.style.cssText = 'position:absolute;top:-22px;left:-1px;background:#3b8fd4;color:#fff;font:600 11px/1 "Inter",system-ui,sans-serif;padding:3px 8px;border-radius:4px 4px 0 0;white-space:nowrap;pointer-events:none;z-index:2147483647;';
    highlightBox.appendChild(label);
    document.documentElement.appendChild(highlightBox);
  }

  function updateHighlight(el) {
    if (!highlightBox || !el) return;
    const rect = el.getBoundingClientRect();
    const s = highlightBox.style;
    s.display = 'block';
    s.top = rect.top + 'px'; s.left = rect.left + 'px';
    s.width = rect.width + 'px'; s.height = rect.height + 'px';
    const label = highlightBox.querySelector('#__webapi_highlight_tag');
    if (label) {
      const tag = el.tagName.toLowerCase();
      const id = el.id ? `#${el.id}` : '';
      const cls = typeof el.className === 'string' && el.className.trim() ? '.' + el.className.trim().split(/\s+/).slice(0, 2).join('.') : '';
      label.textContent = `${tag}${id || cls}`;
    }
  }

  function hideHighlight() {
    if (highlightBox) highlightBox.style.display = 'none';
  }

  // ── Locator picker panel ──
  function createLocatorPanel() {
    if (locatorPanel) locatorPanel.remove();
    locatorPanel = document.createElement('div');
    locatorPanel.id = '__webapi_locator_panel';
    locatorPanel.style.cssText = `
      position:fixed; z-index:2147483647; background:#fff; border:1px solid #e2e8f0;
      border-radius:12px; box-shadow:0 12px 40px rgba(0,0,0,0.12),0 2px 8px rgba(0,0,0,0.06);
      font-family:'Inter',system-ui,sans-serif; width:420px; max-height:380px;
      overflow:hidden; display:none; animation:__webapi_fadeIn 0.15s ease;
    `;
    // Inject animation
    if (!document.getElementById('__webapi_styles')) {
      const styleEl = document.createElement('style');
      styleEl.id = '__webapi_styles';
      styleEl.textContent = `
        @keyframes __webapi_fadeIn { from { opacity:0; transform:translateY(4px); } to { opacity:1; transform:translateY(0); } }
        #__webapi_locator_panel .lp-row { display:flex; align-items:center; gap:8px; padding:8px 14px; cursor:pointer; transition:background 0.1s; border-bottom:1px solid #f1f5f9; }
        #__webapi_locator_panel .lp-row:hover { background:#f0f9ff; }
        #__webapi_locator_panel .lp-row.selected { background:#e0f2fe; }
        #__webapi_locator_panel .lp-type { font-size:10px; font-weight:700; color:#64748b; text-transform:uppercase; letter-spacing:0.5px; width:80px; flex-shrink:0; }
        #__webapi_locator_panel .lp-value { font-size:12px; font-family:'JetBrains Mono',monospace; color:#1e293b; flex:1; overflow:hidden; text-overflow:ellipsis; white-space:nowrap; }
        #__webapi_locator_panel .lp-strategy { font-size:9px; font-weight:600; color:#fff; padding:2px 6px; border-radius:4px; flex-shrink:0; }
        #__webapi_locator_panel .lp-strategy.css { background:#3b8fd4; }
        #__webapi_locator_panel .lp-strategy.xpath { background:#8b5cf6; }
        #__webapi_locator_panel .lp-copy { font-size:11px; padding:3px 8px; border:1px solid #e2e8f0; border-radius:6px; background:#fff; cursor:pointer; color:#64748b; flex-shrink:0; transition:all 0.15s; }
        #__webapi_locator_panel .lp-copy:hover { border-color:#3b8fd4; color:#3b8fd4; }
        #__webapi_locator_panel .lp-header { display:flex; align-items:center; justify-content:space-between; padding:12px 16px; border-bottom:1px solid #e2e8f0; background:#f8fafc; border-radius:12px 12px 0 0; }
        #__webapi_locator_panel .lp-title { font-size:13px; font-weight:700; color:#1e293b; }
        #__webapi_locator_panel .lp-close { width:24px; height:24px; border-radius:6px; border:1px solid #e2e8f0; background:#fff; color:#94a3b8; cursor:pointer; display:flex; align-items:center; justify-content:center; font-size:12px; transition:all 0.15s; }
        #__webapi_locator_panel .lp-close:hover { border-color:#ef4444; color:#ef4444; background:#fef2f2; }
        #__webapi_locator_panel .lp-actions { display:flex; align-items:center; gap:6px; padding:10px 14px; border-top:1px solid #e2e8f0; background:#f8fafc; border-radius:0 0 12px 12px; }
        #__webapi_locator_panel .lp-use-btn { flex:1; padding:8px 12px; background:#3b8fd4; color:#fff; border:none; border-radius:8px; font-size:12px; font-weight:600; cursor:pointer; transition:background 0.15s; }
        #__webapi_locator_panel .lp-use-btn:hover { background:#2d7ab8; }
        #__webapi_locator_panel .lp-use-btn:disabled { opacity:0.4; cursor:not-allowed; }
        #__webapi_locator_panel .lp-cancel-btn { padding:8px 12px; background:#fff; color:#64748b; border:1px solid #e2e8f0; border-radius:8px; font-size:12px; font-weight:600; cursor:pointer; transition:all 0.15s; }
        #__webapi_locator_panel .lp-cancel-btn:hover { border-color:#ef4444; color:#ef4444; }
        #__webapi_locator_panel .lp-body { max-height:250px; overflow-y:auto; }
      `;
      document.documentElement.appendChild(styleEl);
    }
    document.documentElement.appendChild(locatorPanel);
  }

  function showLocatorPanel(el) {
    if (!locatorPanel) createLocatorPanel();
    const locators = getAllLocators(el);
    selectedLocator = locators[0] || null;

    const rect = el.getBoundingClientRect();
    let top = rect.bottom + 8;
    let left = rect.left;
    if (top + 380 > window.innerHeight) top = Math.max(8, rect.top - 380 - 8);
    if (left + 420 > window.innerWidth) left = Math.max(8, window.innerWidth - 428);
    locatorPanel.style.top = top + 'px';
    locatorPanel.style.left = left + 'px';
    locatorPanel.style.display = 'block';

    const tag = el.tagName.toLowerCase();
    const id = el.id ? `#${el.id}` : '';
    const text = (el.textContent || '').trim().slice(0, 40);

    locatorPanel.innerHTML = `
      <div class="lp-header">
        <div class="lp-title">🎯 &lt;${tag}${id}&gt; ${text ? `— "${text}"` : ''}</div>
        <button class="lp-close" id="__webapi_lp_close">✕</button>
      </div>
      <div class="lp-body">
        ${locators.map((loc, i) => `
          <div class="lp-row ${i === 0 ? 'selected' : ''}" data-idx="${i}">
            <span class="lp-type">${loc.type}</span>
            <span class="lp-value" title="${loc.value.replace(/"/g, '&quot;')}">${loc.value}</span>
            <span class="lp-strategy ${loc.strategy}">${loc.strategy}</span>
            <button class="lp-copy" data-val="${loc.value.replace(/"/g, '&quot;')}">📋</button>
          </div>
        `).join('')}
      </div>
      <div class="lp-actions">
        <button class="lp-use-btn" id="__webapi_lp_use">✓ Use this locator</button>
        <button class="lp-cancel-btn" id="__webapi_lp_cancel">✕</button>
      </div>
    `;

    // Event handlers
    locatorPanel.querySelector('#__webapi_lp_close').onclick = () => hideLocatorPanel();
    locatorPanel.querySelector('#__webapi_lp_cancel').onclick = () => hideLocatorPanel();
    locatorPanel.querySelector('#__webapi_lp_use').onclick = () => {
      if (selectedLocator) {
        chrome.runtime.sendMessage({ type: 'LOCATOR_SELECTED', locator: selectedLocator });
        if (active) {
          send({ action: 'click', selector: selectedLocator.value, locatorType: selectedLocator.type, strategy: selectedLocator.strategy, text: text });
        }
      }
      hideLocatorPanel();
    };

    // Row selection
    locatorPanel.querySelectorAll('.lp-row').forEach(row => {
      row.onclick = (e) => {
        if (e.target.classList.contains('lp-copy')) return;
        locatorPanel.querySelectorAll('.lp-row').forEach(r => r.classList.remove('selected'));
        row.classList.add('selected');
        selectedLocator = locators[parseInt(row.dataset.idx)];
      };
    });

    // Copy buttons
    locatorPanel.querySelectorAll('.lp-copy').forEach(btn => {
      btn.onclick = (e) => {
        e.stopPropagation();
        navigator.clipboard.writeText(btn.dataset.val).then(() => {
          const orig = btn.textContent;
          btn.textContent = '✓';
          setTimeout(() => btn.textContent = orig, 1000);
        });
      };
    });
  }

  function hideLocatorPanel() {
    if (locatorPanel) locatorPanel.style.display = 'none';
    selectedLocator = null;
  }

  // ── Inspect mode ──
  function onInspectMove(e) {
    const el = e.target;
    if (el === highlightBox || el === locatorPanel || locatorPanel?.contains(el) || highlightBox?.contains(el)) return;
    if (el === hoveredEl) return;
    hoveredEl = el;
    updateHighlight(el);
  }

  function onInspectClick(e) {
    const el = e.target;
    if (el === locatorPanel || locatorPanel?.contains(el)) return;
    e.preventDefault(); e.stopPropagation(); e.stopImmediatePropagation();
    showLocatorPanel(el);
  }

  function onInspectKey(e) {
    if (e.key === 'Escape') {
      hideLocatorPanel();
      stopInspect();
      chrome.storage.local.set({ inspecting: false });
    }
  }

  function startInspect() {
    if (inspecting) return;
    inspecting = true;
    createHighlight();
    createLocatorPanel();
    document.addEventListener('mousemove', onInspectMove, true);
    document.addEventListener('click', onInspectClick, true);
    document.addEventListener('keydown', onInspectKey, true);
    document.documentElement.style.cursor = 'crosshair';
  }

  function stopInspect() {
    inspecting = false;
    hoveredEl = null;
    hideHighlight();
    hideLocatorPanel();
    document.removeEventListener('mousemove', onInspectMove, true);
    document.removeEventListener('click', onInspectClick, true);
    document.removeEventListener('keydown', onInspectKey, true);
    document.documentElement.style.cursor = '';
  }

  // ── Recording handlers (unchanged logic, but use primary selector) ──
  function send(step) {
    chrome.runtime.sendMessage({ type: 'STEP_RECORDED', step });
  }

  document.addEventListener('click', e => {
    if (!active || inspecting) return;
    send({ action: 'click', selector: getPrimarySelector(e.target), text: e.target.innerText?.slice(0, 80) });
  }, true);

  document.addEventListener('change', e => {
    if (!active || inspecting) return;
    const el = e.target;
    if (['INPUT', 'TEXTAREA', 'SELECT'].includes(el.tagName)) {
      send({ action: 'input', selector: getPrimarySelector(el), value: el.value });
    }
  }, true);

  document.addEventListener('keydown', e => {
    if (!active || inspecting) return;
    if (e.key === 'Enter') send({ action: 'press_enter', selector: getPrimarySelector(e.target) });
  }, true);
})();
