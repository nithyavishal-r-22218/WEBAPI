// WEBAPI Background Service Worker
// GODMODE_API_URL can be overridden at build time via a bundler (e.g., webpack DefinePlugin)
const API = (typeof GODMODE_API_URL !== 'undefined' ? GODMODE_API_URL : null) || 'http://localhost:4000';
const API_KEY = (typeof GODMODE_API_KEY !== 'undefined' ? GODMODE_API_KEY : null) || 'godmode-dev-key';

let recording = false;
let recordedSteps = [];

// Restore state from storage on service worker startup (MV3 workers are ephemeral)
chrome.storage.local.get(['recording', 'recordedSteps'], (data) => {
  recording = !!data.recording;
  recordedSteps = data.recordedSteps || [];
});

// Listen for messages from content script & popup
chrome.runtime.onMessage.addListener((msg, sender, sendResponse) => {
  if (msg.type === 'STEP_RECORDED') {
    if (recording) {
      recordedSteps.push({ ...msg.step, url: sender.tab?.url, ts: Date.now() });
      chrome.storage.local.set({ recordedSteps });
      sendResponse({ ok: true, count: recordedSteps.length });
    } else {
      sendResponse({ ok: false });
    }
    return false;
  }

  if (msg.type === 'START_RECORDING') {
    recording = true;
    recordedSteps = [];
    chrome.storage.local.set({ recording: true, recordedSteps: [] });
    sendResponse({ ok: true });
    return false;
  }

  if (msg.type === 'STOP_RECORDING') {
    recording = false;
    chrome.storage.local.set({ recording: false });
    sendResponse({ ok: true, steps: recordedSteps });
    return false;
  }

  if (msg.type === 'SEND_TO_GODMODE') {
    getStepsFromStorage().then(steps => {
      return sendJobToAPI(steps);
    }).then(r => sendResponse(r)).catch(e => sendResponse({ error: e.message }));
    return true;
  }

  if (msg.type === 'SAVE_TEST_CASE') {
    getStepsFromStorage().then(steps => {
      const testCase = { ...msg.testCase, testSteps: steps, steps: steps.length };
      return saveTestCaseToAPI(testCase);
    }).then(r => sendResponse(r)).catch(e => sendResponse({ error: e.message }));
    return true;
  }

  if (msg.type === 'GET_TEST_CASES') {
    fetchTestCases().then(r => sendResponse(r)).catch(e => sendResponse({ error: e.message }));
    return true;
  }

  if (msg.type === 'GET_STATE') {
    // Always read from storage to survive worker restarts
    chrome.storage.local.get(['recording', 'recordedSteps'], (data) => {
      recording = !!data.recording;
      recordedSteps = data.recordedSteps || [];
      sendResponse({ recording, steps: recordedSteps.length });
    });
    return true;
  }

  if (msg.type === 'LOCATOR_SELECTED') {
    // Forward locator selection to popup (if open)
    sendResponse({ ok: true });
    return false;
  }

  if (msg.type === 'START_INSPECT' || msg.type === 'STOP_INSPECT') {
    chrome.storage.local.set({ inspecting: msg.type === 'START_INSPECT' });
    sendResponse({ ok: true });
    return false;
  }

  return false;
});

// Get steps from in-memory or fall back to chrome.storage.local
async function getStepsFromStorage() {
  if (recordedSteps.length > 0) return recordedSteps;
  return new Promise((resolve) => {
    chrome.storage.local.get('recordedSteps', (data) => {
      const steps = data.recordedSteps || [];
      recordedSteps = steps;
      resolve(steps);
    });
  });
}

async function sendJobToAPI(steps) {
  const res = await fetch(`${API}/run`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'x-api-key': API_KEY,
    },
    body: JSON.stringify({ type: 'AUTOMATE', payload: { steps, source: 'chrome_extension' } }),
  });
  const data = await res.json();
  if (!res.ok) {
    throw new Error(data?.error || `Request failed with status ${res.status}`);
  }
  return data;
}

async function saveTestCaseToAPI(testCase) {
  const res = await fetch(`${API}/test-cases`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'x-api-key': API_KEY,
    },
    body: JSON.stringify(testCase),
  });
  const data = await res.json();
  if (!res.ok) {
    throw new Error(data?.error || `Request failed with status ${res.status}`);
  }
  return data;
}

async function fetchTestCases() {
  const res = await fetch(`${API}/test-cases`, {
    headers: { 'x-api-key': API_KEY },
  });
  const data = await res.json();
  if (!res.ok) {
    throw new Error(data?.error || `Request failed with status ${res.status}`);
  }
  return data;
}
