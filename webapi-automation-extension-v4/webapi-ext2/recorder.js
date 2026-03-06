// WebAPI Automation Tool — content script (thin shim)
// Actual recorder is injected by background.js via scripting API

chrome.runtime.onMessage.addListener((msg, sender, reply) => {
  if (msg.type === 'PING') { reply({ ok:true, url: location.href }); }
  if (msg.type === 'HIGHLIGHT') {
    try {
      const el = document.querySelector(msg.sel);
      if (el) {
        el.scrollIntoView({ behavior:'smooth', block:'center' });
        const orig = el.style.outline;
        el.style.outline = '2px solid #2563eb';
        setTimeout(() => el.style.outline = orig, 2000);
      }
    } catch {}
    reply({ ok:true });
  }
});
