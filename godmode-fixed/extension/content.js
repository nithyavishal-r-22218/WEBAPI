// WEBAPI Content Script — records clicks, inputs, navigation
(function () {
  let active = false;

  chrome.storage.local.get('recording', ({ recording }) => { active = !!recording; });
  chrome.storage.onChanged.addListener(changes => {
    if (changes.recording) active = changes.recording.newValue;
  });

  function getSelector(el) {
    // Prefer data-testid for test-stable selectors
    if (el.dataset?.testid) return `[data-testid="${CSS.escape(el.dataset.testid)}"]`;
    // Use escaped ID if available
    if (el.id) return `#${CSS.escape(el.id)}`;
    // Use name attribute
    if (el.name) return `[name="${CSS.escape(el.name)}"]`;
    // Build class-based selector — guard against SVGAnimatedString
    const classList = typeof el.className === 'string' && el.className.trim()
      ? [...el.classList].map(c => `.${CSS.escape(c)}`).join('')
      : '';
    if (classList) return `${el.tagName.toLowerCase()}${classList}`;
    // Fallback: path-based nth-of-type selector
    const tag = el.tagName.toLowerCase();
    const siblings = el.parentElement
      ? [...el.parentElement.children].filter(c => c.tagName === el.tagName)
      : [];
    const idx = siblings.indexOf(el);
    const nthPart = idx >= 0 ? `:nth-of-type(${idx + 1})` : '';
    return `${tag}${nthPart}`;
  }

  function send(step) {
    chrome.runtime.sendMessage({ type: 'STEP_RECORDED', step });
  }

  document.addEventListener('click', e => {
    if (!active) return;
    send({ action: 'click', selector: getSelector(e.target), text: e.target.innerText?.slice(0, 80) });
  }, true);

  document.addEventListener('change', e => {
    if (!active) return;
    const el = e.target;
    if (['INPUT', 'TEXTAREA', 'SELECT'].includes(el.tagName)) {
      send({ action: 'input', selector: getSelector(el), value: el.value });
    }
  }, true);

  document.addEventListener('keydown', e => {
    if (!active) return;
    if (e.key === 'Enter') send({ action: 'press_enter', selector: getSelector(e.target) });
  }, true);
})();
