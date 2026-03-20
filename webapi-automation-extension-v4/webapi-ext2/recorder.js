// WebAPI Automation Tool — content script
// Handles: PING, HIGHLIGHT, and Element Inspector with multi-locator picker

(function() {
  if (window.__WEBAPI_CONTENT__) return;
  window.__WEBAPI_CONTENT__ = true;

  let inspecting = false;
  let highlightBox = null;
  let highlightLabel = null;
  let locatorPanel = null;
  let locatorStyles = null;

  // ── Locator generators ──────────────────────────────────────────────────

  function getXPath(el) {
    if (el === document.body) return '/html/body';
    const parts = [];
    let node = el;
    while (node && node.nodeType === 1) {
      let idx = 1;
      let sib = node.previousSibling;
      while (sib) {
        if (sib.nodeType === 1 && sib.tagName === node.tagName) idx++;
        sib = sib.previousSibling;
      }
      parts.unshift(node.tagName.toLowerCase() + '[' + idx + ']');
      node = node.parentNode;
    }
    return '/' + parts.join('/');
  }

  function getRelativeXPath(el) {
    if (el.id) return '//*[@id="' + el.id + '"]';
    const tag = el.tagName.toLowerCase();
    const text = (el.textContent || '').trim().slice(0, 30);
    if (text && !el.children.length) return '//' + tag + '[contains(text(),"' + text.replace(/"/g, "'") + '")]';
    const zpqa = el.getAttribute('data-zpqa');
    if (zpqa) return '//' + tag + '[@data-zpqa="' + zpqa + '"]';
    const aria = el.getAttribute('aria-label');
    if (aria) return '//' + tag + '[@aria-label="' + aria + '"]';
    return getXPath(el);
  }

  function getNthSelector(el) {
    const parent = el.parentElement;
    if (!parent) return el.tagName.toLowerCase();
    const tag = el.tagName.toLowerCase();
    const siblings = Array.from(parent.children).filter(c => c.tagName === el.tagName);
    if (siblings.length === 1) return tag;
    const idx = siblings.indexOf(el) + 1;
    return tag + ':nth-of-type(' + idx + ')';
  }

  function getCssPath(el) {
    const parts = [];
    let node = el;
    while (node && node !== document.body && node.nodeType === 1) {
      parts.unshift(getNthSelector(node));
      node = node.parentElement;
    }
    return parts.join(' > ');
  }

  function getAllLocators(el) {
    const locators = [];
    const tag = el.tagName.toLowerCase();

    // Special handling for contenteditable body (rich text editors in iframes)
    if (el === document.body && el.getAttribute('contenteditable') === 'true') {
      const aria = el.getAttribute('aria-label');
      if (aria) locators.push({ type: 'ARIA', strategy: 'css', value: 'body[aria-label="' + aria + '"]' });
      const cls = Array.from(el.classList || []).filter(c => !/^(hover|focus|active|is-|ng-|v-|css-|__wb)/.test(c)).slice(0, 2);
      if (cls.length) locators.push({ type: 'CSS Class', strategy: 'css', value: 'body.' + cls.join('.') });
      locators.push({ type: 'Contenteditable', strategy: 'css', value: 'body[contenteditable="true"]' });
      locators.push({ type: 'Abs XPath', strategy: 'xpath', value: '/html/body' });
      return locators;
    }

    // ID
    if (el.id) locators.push({ type: 'ID', strategy: 'css', value: '#' + CSS.escape(el.id) });

    // data-zpqa (Zoho-specific)
    const zpqa = el.getAttribute('data-zpqa');
    if (zpqa) locators.push({ type: 'ZPQA', strategy: 'css', value: '[data-zpqa="' + zpqa + '"]' });

    // data-testid
    const tid = el.getAttribute('data-testid') || el.getAttribute('data-test') || el.getAttribute('data-cy') || el.getAttribute('data-qa');
    if (tid) locators.push({ type: 'TestID', strategy: 'css', value: '[data-testid="' + tid + '"]' });

    // data-tooltip
    const tooltip = el.getAttribute('data-tooltip');
    if (tooltip && tooltip !== 'true' && tooltip !== 'false') locators.push({ type: 'Tooltip', strategy: 'css', value: '[data-tooltip="' + tooltip + '"]' });

    // Name
    const name = el.getAttribute('name');
    if (name) locators.push({ type: 'Name', strategy: 'css', value: tag + '[name="' + name + '"]' });

    // aria-label
    const aria = el.getAttribute('aria-label');
    if (aria) locators.push({ type: 'ARIA', strategy: 'css', value: '[aria-label="' + aria + '"]' });

    // role + accessible name (using aria-label or data-tooltip for valid CSS)
    const role = el.getAttribute('role');
    const txt = (el.innerText || '').trim().slice(0, 30);
    if (role && aria) locators.push({ type: 'Role+Aria', strategy: 'css', value: '[role="' + role + '"][aria-label="' + aria + '"]' });
    else if (role && tooltip && tooltip !== 'true') locators.push({ type: 'Role+Tooltip', strategy: 'css', value: '[role="' + role + '"][data-tooltip="' + tooltip + '"]' });
    else if (role && txt) locators.push({ type: 'Role+Text', strategy: 'text', value: '[role="' + role + '"]:has-text("' + txt + '")' });

    // Placeholder
    const ph = el.getAttribute('placeholder');
    if (ph) locators.push({ type: 'Placeholder', strategy: 'css', value: tag + '[placeholder="' + ph + '"]' });

    // CSS class-based
    const cls = Array.from(el.classList || []).filter(c => !/^(hover|focus|active|is-|ng-|v-|css-|__wb)/.test(c)).slice(0, 2);
    if (cls.length) locators.push({ type: 'CSS Class', strategy: 'css', value: tag + '.' + cls.join('.') });

    // Full CSS path
    locators.push({ type: 'CSS Path', strategy: 'css', value: getCssPath(el) });

    // Text XPath
    const textContent = (el.textContent || '').trim().slice(0, 40);
    if (textContent && !el.children.length) {
      locators.push({ type: 'Text XPath', strategy: 'xpath', value: '//' + tag + '[contains(text(),"' + textContent.replace(/"/g, "'") + '")]' });
    }

    // Relative XPath
    locators.push({ type: 'Rel XPath', strategy: 'xpath', value: getRelativeXPath(el) });

    // Absolute XPath
    locators.push({ type: 'Abs XPath', strategy: 'xpath', value: getXPath(el) });

    return locators;
  }

  // ── Highlight overlay ───────────────────────────────────────────────────

  function createHighlight() {
    if (highlightBox) return;
    highlightBox = document.createElement('div');
    highlightBox.id = '__webapi_highlight';
    highlightBox.style.cssText = 'position:fixed;pointer-events:none;z-index:2147483646;border:2px solid #2563eb;background:rgba(37,99,235,0.08);border-radius:3px;transition:all 0.05s ease;display:none;';
    highlightLabel = document.createElement('div');
    highlightLabel.id = '__webapi_hlabel';
    highlightLabel.style.cssText = 'position:fixed;pointer-events:none;z-index:2147483647;background:#2563eb;color:#fff;font:600 10px/1 -apple-system,sans-serif;padding:3px 7px;border-radius:3px;white-space:nowrap;display:none;';
    document.documentElement.appendChild(highlightBox);
    document.documentElement.appendChild(highlightLabel);
  }

  function updateHighlight(el) {
    if (!highlightBox) createHighlight();
    const r = el.getBoundingClientRect();
    highlightBox.style.top = r.top + 'px';
    highlightBox.style.left = r.left + 'px';
    highlightBox.style.width = r.width + 'px';
    highlightBox.style.height = r.height + 'px';
    highlightBox.style.display = 'block';
    const tag = el.tagName.toLowerCase();
    const id = el.id ? '#' + el.id : '';
    const cls = el.className && typeof el.className === 'string' ? '.' + el.className.trim().split(/\s+/).slice(0, 2).join('.') : '';
    highlightLabel.textContent = tag + id + cls;
    highlightLabel.style.top = Math.max(0, r.top - 22) + 'px';
    highlightLabel.style.left = r.left + 'px';
    highlightLabel.style.display = 'block';
  }

  function hideHighlight() {
    if (highlightBox) highlightBox.style.display = 'none';
    if (highlightLabel) highlightLabel.style.display = 'none';
  }

  // ── Locator panel ──────────────────────────────────────────────────────

  function ensureStyles() {
    if (locatorStyles) return;
    locatorStyles = document.createElement('style');
    locatorStyles.id = '__webapi_lstyles';
    locatorStyles.textContent = `
      #__webapi_lpanel{position:fixed;z-index:2147483647;background:#fff;border:1px solid #d1d5db;border-radius:10px;box-shadow:0 12px 40px rgba(0,0,0,.18);font-family:-apple-system,system-ui,sans-serif;width:420px;max-height:400px;overflow:hidden;display:none}
      #__webapi_lpanel .lp-hdr{display:flex;align-items:center;gap:8px;padding:10px 14px;background:#f8fafc;border-bottom:1px solid #e5e7eb;border-radius:10px 10px 0 0}
      #__webapi_lpanel .lp-title{font-size:12px;font-weight:700;color:#1e293b;flex:1}
      #__webapi_lpanel .lp-tag{font-size:10px;color:#64748b;font-family:monospace;background:#e2e8f0;padding:2px 6px;border-radius:4px}
      #__webapi_lpanel .lp-close{width:22px;height:22px;border:none;background:none;color:#94a3b8;font-size:16px;cursor:pointer;display:flex;align-items:center;justify-content:center;border-radius:4px}
      #__webapi_lpanel .lp-close:hover{background:#fee2e2;color:#ef4444}
      #__webapi_lpanel .lp-body{max-height:320px;overflow-y:auto;padding:6px 0}
      #__webapi_lpanel .lp-row{display:flex;align-items:center;gap:8px;padding:7px 14px;cursor:pointer;transition:background .1s}
      #__webapi_lpanel .lp-row:hover{background:#f1f5f9}
      #__webapi_lpanel .lp-row.selected{background:#eff6ff;border-left:3px solid #2563eb}
      #__webapi_lpanel .lp-type{font-size:10px;font-weight:700;color:#64748b;text-transform:uppercase;width:72px;flex-shrink:0;letter-spacing:.3px}
      #__webapi_lpanel .lp-val{flex:1;font-size:11px;color:#1e293b;font-family:'DM Mono',monospace,monospace;word-break:break-all;line-height:1.4}
      #__webapi_lpanel .lp-copy{width:24px;height:24px;border:1px solid #d1d5db;background:#fff;color:#64748b;font-size:11px;cursor:pointer;border-radius:5px;display:flex;align-items:center;justify-content:center;flex-shrink:0;transition:all .1s}
      #__webapi_lpanel .lp-copy:hover{background:#2563eb;color:#fff;border-color:#2563eb}
      #__webapi_lpanel .lp-attrs{padding:6px 14px;background:#fefce8;border-bottom:1px solid #e5e7eb;display:flex;flex-direction:column;gap:3px}
      #__webapi_lpanel .lp-attr{display:flex;align-items:baseline;gap:6px;font-size:10px;line-height:1.4}
      #__webapi_lpanel .lp-attr-name{font-weight:700;color:#92400e;font-family:monospace;white-space:nowrap}
      #__webapi_lpanel .lp-attr-val{color:#78350f;font-family:monospace;word-break:break-all}
      #__webapi_lpanel .lp-use{width:100%;margin:0;padding:9px;border:none;background:#2563eb;color:#fff;font-size:12px;font-weight:700;cursor:pointer;border-radius:0 0 10px 10px;transition:background .15s}
      #__webapi_lpanel .lp-use:hover{background:#1d4ed8}
      #__webapi_sleep_pill{position:fixed;z-index:2147483647;display:none;background:#fff;border:1px solid #d1d5db;border-radius:12px;box-shadow:0 8px 30px rgba(0,0,0,.18);font-family:-apple-system,system-ui,sans-serif;padding:12px 16px;width:280px}
      #__webapi_sleep_pill .sp-title{font-size:11px;font-weight:700;color:#1e293b;margin-bottom:8px;display:flex;align-items:center;gap:6px}
      #__webapi_sleep_pill .sp-row{display:flex;align-items:center;gap:8px;margin-bottom:10px}
      #__webapi_sleep_pill .sp-row label{font-size:10px;font-weight:700;color:#64748b;text-transform:uppercase;letter-spacing:.3px;white-space:nowrap}
      #__webapi_sleep_pill .sp-row input{flex:1;height:30px;border:1px solid #d1d5db;border-radius:6px;padding:0 8px;font-size:12px;font-family:'DM Mono',monospace;color:#1e293b;outline:none;background:#fff}
      #__webapi_sleep_pill .sp-row input:focus{border-color:#2563eb;box-shadow:0 0 0 2px rgba(37,99,235,.15)}
      #__webapi_sleep_pill .sp-btns{display:flex;gap:6px;justify-content:flex-end}
      #__webapi_sleep_pill .sp-btn{padding:5px 14px;border-radius:6px;font-size:11px;font-weight:700;cursor:pointer;border:none;transition:all .1s}
      #__webapi_sleep_pill .sp-save{background:#2563eb;color:#fff}
      #__webapi_sleep_pill .sp-save:hover{background:#1d4ed8}
      #__webapi_sleep_pill .sp-cancel{background:#f1f5f9;color:#64748b;border:1px solid #d1d5db}
      #__webapi_sleep_pill .sp-cancel:hover{background:#e2e8f0}
      #__webapi_sleep_pill .sp-skip{background:none;color:#94a3b8;font-weight:600;padding:5px 8px}
      #__webapi_sleep_pill .sp-skip:hover{color:#64748b}
    `;
    document.documentElement.appendChild(locatorStyles);
  }

  function createLocatorPanel() {
    ensureStyles();
    if (locatorPanel) return;
    locatorPanel = document.createElement('div');
    locatorPanel.id = '__webapi_lpanel';
    document.documentElement.appendChild(locatorPanel);
  }

  function showLocatorPanel(el, onSelect, isInIframe) {
    createLocatorPanel();
    const locators = getAllLocators(el);
    const r = el.getBoundingClientRect();

    // Position panel near the element
    let top = r.bottom + 8;
    let left = r.left;
    if (top + 400 > window.innerHeight) top = Math.max(8, r.top - 400 - 8);
    if (left + 420 > window.innerWidth) left = Math.max(8, window.innerWidth - 428);

    locatorPanel.style.top = top + 'px';
    locatorPanel.style.left = left + 'px';
    locatorPanel._elRect = { top: r.top, bottom: r.bottom, left: r.left, right: r.right };

    const tag = el.tagName.toLowerCase();
    const id = el.id ? '#' + el.id : '';
    const iframeBadge = isInIframe ? '<span style="font-size:9px;background:#7c3aed;color:#fff;padding:2px 6px;border-radius:4px;margin-left:4px;">IFRAME</span>' : '';

    // Collect display attributes
    const attrPairs = [];
    const ariaLabel = el.getAttribute('aria-label');
    const dataTooltip = el.getAttribute('data-tooltip');
    const title = el.getAttribute('title');
    const role = el.getAttribute('role');
    const placeholder = el.getAttribute('placeholder');
    if (ariaLabel) attrPairs.push(['aria-label', ariaLabel]);
    if (dataTooltip) attrPairs.push(['data-tooltip', dataTooltip]);
    if (title) attrPairs.push(['title', title]);
    if (role) attrPairs.push(['role', role]);
    if (placeholder) attrPairs.push(['placeholder', placeholder]);

    const attrsHtml = attrPairs.length > 0
      ? '<div class="lp-attrs">' + attrPairs.map(function(p) {
          return '<div class="lp-attr"><span class="lp-attr-name">' + escHtml(p[0]) + '</span><span class="lp-attr-val">"' + escHtml(p[1]) + '"</span></div>';
        }).join('') + '</div>'
      : '';

    locatorPanel.innerHTML =
      '<div class="lp-hdr">'
      + '<span style="font-size:14px">🎯</span>'
      + '<span class="lp-title">Element Locators</span>'
      + iframeBadge
      + '<span class="lp-tag">' + tag + id + '</span>'
      + '<button class="lp-close" id="__lp_close">✕</button>'
      + '</div>'
      + attrsHtml
      + '<div class="lp-body">'
      + locators.map(function(loc, i) {
          return '<div class="lp-row" data-idx="' + i + '">'
            + '<span class="lp-type">' + loc.type + '</span>'
            + '<span class="lp-val">' + escHtml(loc.value) + '</span>'
            + '<button class="lp-copy" data-val="' + encodeURIComponent(loc.value) + '" title="Copy">📋</button>'
            + '</div>';
        }).join('')
      + '</div>'
      + '<button class="lp-use" id="__lp_use">✓ Use Selected Locator</button>';

    locatorPanel.style.display = 'block';
    freezePage();

    // Select first locator by default
    const firstRow = locatorPanel.querySelector('.lp-row');
    if (firstRow) firstRow.classList.add('selected');

    // Event delegation for panel
    locatorPanel.onclick = function(e) {
      e.stopPropagation();
      e.preventDefault();

      // Close button
      if (e.target.id === '__lp_close' || e.target.closest('#__lp_close')) {
        hideLocatorPanel();
        return;
      }

      // Copy button
      const copyBtn = e.target.closest('.lp-copy');
      if (copyBtn) {
        const val = decodeURIComponent(copyBtn.dataset.val);
        navigator.clipboard.writeText(val).then(function() {
          copyBtn.textContent = '✓';
          setTimeout(function() { copyBtn.textContent = '📋'; }, 1200);
        });
        return;
      }

      // Row click → select (auto-use if callback provided)
      const row = e.target.closest('.lp-row');
      if (row) {
        locatorPanel.querySelectorAll('.lp-row').forEach(function(r) { r.classList.remove('selected'); });
        row.classList.add('selected');
        if (onSelect) {
          var ridx = parseInt(row.dataset.idx);
          var rloc = locators[ridx];
          if (rloc) {
            hideLocatorPanel();
            showSleepPill(rloc, onSelect);
          }
        }
        return;
      }

      // Use button
      if (e.target.id === '__lp_use') {
        var sel2 = locatorPanel.querySelector('.lp-row.selected');
        if (sel2) {
          var uidx = parseInt(sel2.dataset.idx);
          var uloc = locators[uidx];
          if (uloc) {
            hideLocatorPanel();
            showSleepPill(uloc, onSelect);
          }
        }
        return;
      }
    };

    // Close button
    var closeBtn = locatorPanel.querySelector('#__lp_close');
    if (closeBtn) {
      closeBtn.onclick = function(e) {
        e.stopPropagation();
        hideLocatorPanel();
      };
    }
  }

  function hideLocatorPanel() {
    if (locatorPanel) locatorPanel.style.display = 'none';
    // Only unfreeze if sleep pill is not visible
    if (!sleepPill || sleepPill.style.display === 'none') unfreezePage();
  }

  // ── Sleep pill popup ───────────────────────────────────────────────────

  var sleepPill = null;

  function showSleepPill(locator, onSelect) {
    ensureStyles();
    hideHighlight();
    if (!sleepPill) {
      sleepPill = document.createElement('div');
      sleepPill.id = '__webapi_sleep_pill';
      document.documentElement.appendChild(sleepPill);
    }

    // Position near the element (use stored rect from locator panel)
    var rect = locatorPanel && locatorPanel._elRect;
    if (rect) {
      var pillH = 120, pillW = 280;
      var ptop = rect.bottom + 8;
      var pleft = rect.left;
      if (ptop + pillH > window.innerHeight) ptop = Math.max(8, rect.top - pillH - 8);
      if (pleft + pillW > window.innerWidth) pleft = Math.max(8, window.innerWidth - pillW - 8);
      sleepPill.style.top = ptop + 'px';
      sleepPill.style.left = pleft + 'px';
      sleepPill.style.transform = 'none';
    } else {
      sleepPill.style.top = '50%';
      sleepPill.style.left = '50%';
      sleepPill.style.transform = 'translate(-50%, -50%)';
    }

    sleepPill.innerHTML =
      '<div class="sp-title">⏱ Set Sleep Time</div>'
      + '<div class="sp-row"><label>ms</label><input type="number" id="__sp_input" min="0" step="100" value="0" placeholder="0"/></div>'
      + '<div class="sp-btns">'
        + '<button class="sp-btn sp-skip" id="__sp_skip">Skip</button>'
        + '<button class="sp-btn sp-cancel" id="__sp_cancel">Cancel</button>'
        + '<button class="sp-btn sp-save" id="__sp_save">Save</button>'
      + '</div>';

    sleepPill.style.display = 'block';
    freezePage();

    var input = sleepPill.querySelector('#__sp_input');
    if (input) input.focus();

    sleepPill.onclick = function(e) {
      e.stopPropagation();
      e.preventDefault();

      if (e.target.id === '__sp_save') {
        var ms = parseInt((sleepPill.querySelector('#__sp_input') || {}).value) || 0;
        locator.sleep = ms;
        hideSleepPill();
        if (onSelect) onSelect(locator);
        chrome.runtime.sendMessage({ type: 'LOCATOR_SELECTED', locator: locator });
        return;
      }
      if (e.target.id === '__sp_skip') {
        locator.sleep = 0;
        hideSleepPill();
        if (onSelect) onSelect(locator);
        chrome.runtime.sendMessage({ type: 'LOCATOR_SELECTED', locator: locator });
        return;
      }
      if (e.target.id === '__sp_cancel') {
        hideSleepPill();
        return;
      }
    };
  }

  function hideSleepPill() {
    if (sleepPill) sleepPill.style.display = 'none';
    // Only unfreeze if locator panel is also not visible
    if (!locatorPanel || locatorPanel.style.display === 'none') unfreezePage();
  }

  function escHtml(s) {
    return s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
  }

  // ── Inspect mode ───────────────────────────────────────────────────────

  let frozen = false;
  let freezeStyle = null;

  function freezePage() {
    if (frozen) return;
    frozen = true;
    freezeStyle = document.createElement('style');
    freezeStyle.id = '__webapi_freeze';
    freezeStyle.textContent = `
      *:not(#__webapi_highlight):not(#__webapi_hlabel):not(#__webapi_lpanel):not(#__webapi_lpanel *):not(#__webapi_sleep_pill):not(#__webapi_sleep_pill *):not(#__webapi_freeze_badge) {
        pointer-events: none !important;
      }
      #__webapi_highlight, #__webapi_hlabel, #__webapi_lpanel, #__webapi_lpanel *, #__webapi_sleep_pill, #__webapi_sleep_pill * {
        pointer-events: auto !important;
      }
    `;
    document.documentElement.appendChild(freezeStyle);
    // Show freeze badge
    let badge = document.getElementById('__webapi_freeze_badge');
    if (!badge) {
      badge = document.createElement('div');
      badge.id = '__webapi_freeze_badge';
      badge.style.cssText = 'position:fixed;top:8px;left:50%;transform:translateX(-50%);z-index:2147483647;background:#dc2626;color:#fff;font:700 11px/1 -apple-system,sans-serif;padding:5px 14px;border-radius:16px;box-shadow:0 4px 12px rgba(0,0,0,.3);pointer-events:auto;cursor:pointer;';
      badge.textContent = '❄ Page Frozen — Click or press F to unfreeze';
      badge.addEventListener('click', unfreezePage);
      document.documentElement.appendChild(badge);
    }
  }

  function unfreezePage() {
    if (!frozen) return;
    frozen = false;
    if (freezeStyle) { freezeStyle.remove(); freezeStyle = null; }
    const badge = document.getElementById('__webapi_freeze_badge');
    if (badge) badge.remove();
  }

  function onInspectMove(e) {
    // Completely skip inspect when sleep pill or locator panel is visible
    var sp = document.getElementById('__webapi_sleep_pill');
    if (sp && sp.style.display !== 'none') return;
    var lp = document.getElementById('__webapi_lpanel');
    if (lp && lp.style.display !== 'none') return;
    const el = e.target;
    if (!el || el === document.documentElement) { hideHighlight(); return; }
    // Allow contenteditable body (rich text editors) but skip regular body
    if (el === document.body && el.getAttribute('contenteditable') !== 'true') { hideHighlight(); return; }
    if (el.id && el.id.startsWith('__')) return;
    if (el.closest('#__webapi_lpanel') || el.closest('#__webapi_highlight') || el.closest('#__webapi_hlabel') || el.closest('#__webapi_sleep_pill')) return;
    if (el.id === '__webapi_freeze_badge') return;
    updateHighlight(el);
  }

  function onInspectClick(e) {
    // Completely skip inspect when sleep pill or locator panel is visible
    var sp = document.getElementById('__webapi_sleep_pill');
    if (sp && sp.style.display !== 'none') { e.stopPropagation(); return; }
    var lp = document.getElementById('__webapi_lpanel');
    if (lp && lp.style.display !== 'none') { e.stopPropagation(); return; }
    const el = e.target;
    if (el.id === '__webapi_freeze_badge') return;
    if (el.closest('#__webapi_lpanel')) return; // panel clicks handled internally
    if (el.closest('#__webapi_sleep_pill')) { e.stopPropagation(); return; }
    if (el.id && el.id.startsWith('__')) return;
    e.preventDefault();
    e.stopPropagation();
    e.stopImmediatePropagation();
    // Add iframe context to the locator panel
    const isInIframe = (window !== window.top);
    showLocatorPanel(el, null, isInIframe);
  }

  function onInspectKey(e) {
    // F key = freeze/unfreeze page (for hovering menus & popups)
    if (e.key === 'f' || e.key === 'F') {
      if (e.target.tagName === 'INPUT' || e.target.tagName === 'TEXTAREA' || e.target.isContentEditable) return;
      e.preventDefault();
      e.stopPropagation();
      if (frozen) unfreezePage();
      else freezePage();
      return;
    }
    if (e.key === 'Escape') {
      if (frozen) { unfreezePage(); return; }
      if (locatorPanel && locatorPanel.style.display !== 'none') {
        hideLocatorPanel();
      } else {
        stopInspect();
        chrome.runtime.sendMessage({ type: 'INSPECT_STOPPED' });
      }
    }
  }

  function startInspect() {
    if (inspecting) return;
    inspecting = true;
    window.__WEBAPI_INSPECTING__ = true;
    createHighlight();
    document.addEventListener('mousemove', onInspectMove, true);
    document.addEventListener('click', onInspectClick, true);
    document.addEventListener('keydown', onInspectKey, true);
    document.body.style.cursor = 'crosshair';
  }

  function stopInspect() {
    if (!inspecting) return;
    inspecting = false;
    window.__WEBAPI_INSPECTING__ = false;
    document.removeEventListener('mousemove', onInspectMove, true);
    document.removeEventListener('click', onInspectClick, true);
    document.removeEventListener('keydown', onInspectKey, true);
    hideHighlight();
    hideLocatorPanel();
    unfreezePage();
    document.body.style.cursor = '';
  }

  // ── Message handler ────────────────────────────────────────────────────

  chrome.runtime.onMessage.addListener(function(msg, sender, reply) {
    if (msg.type === 'PING') {
      reply({ ok: true, url: location.href });
      return;
    }
    if (msg.type === 'HIGHLIGHT') {
      try {
        var el;
        if (msg.sel && msg.sel.startsWith('/')) {
          var xr = document.evaluate(msg.sel, document, null, XPathResult.FIRST_ORDERED_NODE_TYPE, null);
          el = xr.singleNodeValue;
        } else {
          el = document.querySelector(msg.sel);
        }
        if (el) {
          el.scrollIntoView({ behavior: 'smooth', block: 'center' });
          const orig = el.style.outline;
          el.style.outline = '2px solid #2563eb';
          setTimeout(function() { el.style.outline = orig; }, 2000);
        }
      } catch (ex) {}
      reply({ ok: true });
      return;
    }
    if (msg.type === 'START_INSPECT') {
      startInspect();
      reply({ ok: true });
      return;
    }
    if (msg.type === 'STOP_INSPECT') {
      stopInspect();
      reply({ ok: true });
      return;
    }
  });

  // Expose API for injected recorder to use during recording
  window.__WEBAPI_API = {
    getAllLocators: getAllLocators,
    showLocatorPanel: showLocatorPanel,
    hideLocatorPanel: hideLocatorPanel,
    createHighlight: createHighlight,
    updateHighlight: updateHighlight,
    hideHighlight: hideHighlight,
    stopInspect: stopInspect
  };

})();
