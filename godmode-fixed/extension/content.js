// GodMode Content Script — records clicks, inputs, navigation
(function () {
  let active = false;

  chrome.storage.local.get('recording', ({ recording }) => { active = !!recording; });
  chrome.storage.onChanged.addListener(changes => {
    if (changes.recording) active = changes.recording.newValue;
  });

  function getSelector(el) {
    if (el.id) return `#${el.id}`;
    if (el.name) return `[name="${el.name}"]`;
    if (el.className) return `${el.tagName.toLowerCase()}.${[...el.classList].join('.')}`;
    return el.tagName.toLowerCase();
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
