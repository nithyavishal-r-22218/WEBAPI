// GodMode Background Service Worker
const API = 'http://localhost:4000';
const API_KEY = 'godmode-dev-key';

let recording = false;
let recordedSteps = [];

// Listen for messages from content script & popup
chrome.runtime.onMessage.addListener((msg, sender, sendResponse) => {
  if (msg.type === 'STEP_RECORDED') {
    if (recording) {
      recordedSteps.push({ ...msg.step, url: sender.tab?.url, ts: Date.now() });
      chrome.storage.local.set({ recordedSteps });
      sendResponse({ ok: true, count: recordedSteps.length });
    }
  }

  if (msg.type === 'START_RECORDING') {
    recording = true;
    recordedSteps = [];
    chrome.storage.local.set({ recording: true, recordedSteps: [] });
    sendResponse({ ok: true });
  }

  if (msg.type === 'STOP_RECORDING') {
    recording = false;
    chrome.storage.local.set({ recording: false });
    sendResponse({ ok: true, steps: recordedSteps });
  }

  if (msg.type === 'SEND_TO_GODMODE') {
    sendJobToAPI(recordedSteps).then(r => sendResponse(r)).catch(e => sendResponse({ error: e.message }));
    return true; // keep channel open for async
  }

  if (msg.type === 'GET_STATE') {
    sendResponse({ recording, steps: recordedSteps.length });
  }

  return true;
});

async function sendJobToAPI(steps) {
  const res = await fetch(`${API}/run`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'x-api-key': API_KEY },
    body: JSON.stringify({ type: 'AUTOMATE', payload: { steps, source: 'chrome_extension' } }),
  });
  return await res.json();
}
