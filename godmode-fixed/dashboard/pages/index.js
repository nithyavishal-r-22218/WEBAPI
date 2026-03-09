import { useState, useEffect, useCallback, useMemo, useRef } from 'react';
import Head from 'next/head';

const API = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:4000';
const API_KEY = process.env.NEXT_PUBLIC_API_KEY || 'godmode-dev-key';

const JOB_TYPES = ['SCRAPE', 'AUTOMATE', 'SCHEDULE', 'CUSTOM'];

const STATUS_BADGE = {
  QUEUED:  { bg: 'bg-amber-50', color: 'text-amber-600', icon: '⏳' },
  RUNNING: { bg: 'bg-blue-50', color: 'text-blue-600', icon: '⚡' },
  DONE:    { bg: 'bg-emerald-50', color: 'text-emerald-600', icon: '✓' },
  FAILED:  { bg: 'bg-red-50', color: 'text-red-600', icon: '✗' },
};

const STATUS_ICON = { QUEUED: '⏳', RUNNING: '⚡', DONE: '✓', FAILED: '✗' };

function apiHeaders(extra = {}) {
  return { 'Content-Type': 'application/json', 'x-api-key': API_KEY, ...extra };
}

function timeAgo(iso) {
  if (!iso) return '—';
  const diff = Date.now() - new Date(iso).getTime();
  if (diff < 60000) return `${Math.floor(diff / 1000)}s ago`;
  if (diff < 3600000) return `${Math.floor(diff / 60000)}m ago`;
  return `${Math.floor(diff / 3600000)}h ago`;
}

// ── Nav Items ─────────────────────────────────────────────────
const NAV_ITEMS = [
  { key: 'jobs', icon: '📋', label: 'Jobs' },
  { key: 'testcases', icon: '📝', label: 'Test Cases' },
  { key: 'suites', icon: '📦', label: 'Test Suites' },
  { key: 'plans', icon: '🗓️', label: 'Test Plans' },
  { key: 'results', icon: '✓', label: 'Results' },
  { key: 'credentials', icon: '🔑', label: 'Credentials' },
  { key: 'environments', icon: '🌐', label: 'Environments' },
];

const NAV_BOTTOM = [
  { key: 'activity', icon: '📡', label: 'Activity' },
  { key: 'settings', icon: '⚙️', label: 'Settings' },
];

// ── Main Dashboard ────────────────────────────────────────────
export default function GodMode() {
  const [jobs, setJobs] = useState([]);
  const [testCases, setTestCases] = useState([]);
  const [testSuites, setTestSuites] = useState([]);
  const [testPlans, setTestPlans] = useState([]);
  const [results, setResults] = useState([]);
  const [health, setHealth] = useState(null);
  const [selected, setSelected] = useState(null);
  const [form, setForm] = useState({ type: 'SCRAPE', payload: '{\n  "url": "https://example.com"\n}' });
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState('');
  const [filter, setFilter] = useState('ALL');
  const [log, setLog] = useState([]);
  const [showLaunchModal, setShowLaunchModal] = useState(false);
  const [activeNav, setActiveNav] = useState('jobs');
  const [searchQuery, setSearchQuery] = useState('');
  const [showTestCaseModal, setShowTestCaseModal] = useState(false);
  const [showTestSuiteModal, setShowTestSuiteModal] = useState(false);
  const [showTestPlanModal, setShowTestPlanModal] = useState(false);
  const [testCaseForm, setTestCaseForm] = useState({ name: '', type: 'UI', framework: '', description: '' });
  const [testSuiteForm, setTestSuiteForm] = useState({ name: '', description: '', testCaseIds: [] });
  const [testPlanForm, setTestPlanForm] = useState({ name: '', suiteId: '', schedule: 'ONCE', environment: 'DEV' });
  const [editingTestCase, setEditingTestCase] = useState(null);
  const [testSteps, setTestSteps] = useState([]);
  const [isRecording, setIsRecording] = useState(false);
  const [selectedStep, setSelectedStep] = useState(null);
  const [draggedStep, setDraggedStep] = useState(null);
  const [stepGroups, setStepGroups] = useState([]);
  const [testCaseVersions, setTestCaseVersions] = useState([]);
  const [showVersionHistory, setShowVersionHistory] = useState(false);
  const [showExpressionEditor, setShowExpressionEditor] = useState(false);
  const [expressionTarget, setExpressionTarget] = useState(null);
  const [expressionValue, setExpressionValue] = useState('');
  const [expressionTab, setExpressionTab] = useState('variables');
  const [credentials, setCredentials] = useState([]);
  const [showCredForm, setShowCredForm] = useState(false);
  const [editingCred, setEditingCred] = useState(null);
  const [credForm, setCredForm] = useState({ accountName: '', profile: '', userEmail: '', portalId: '', clientId: '', clientSecret: '', refreshToken: '' });
  const [showRunConfigModal, setShowRunConfigModal] = useState(false);
  const [runConfigTarget, setRunConfigTarget] = useState(null);
  const [runConfig, setRunConfig] = useState({ browser: 'chromium', server: 'local', environment: '' });
  const [environments, setEnvironments] = useState([]);
  const [showEnvForm, setShowEnvForm] = useState(false);
  const [editingEnv, setEditingEnv] = useState(null);
  const [envForm, setEnvForm] = useState({ name: '', url: '', description: '' });
  const extensionPort = useRef(null);

  const addLog = (msg, type = 'info') => {
    setLog(prev => [...prev.slice(-49), { msg, type, ts: new Date().toLocaleTimeString() }]);
  };

  // ── API Functions ─────────────────────────────────────────
  const fetchJobs = useCallback(async () => {
    try {
      const r = await fetch(`${API}/jobs`, { headers: apiHeaders() });
      if (!r.ok) throw new Error(`Failed to fetch jobs (${r.status})`);
      const d = await r.json();
      setJobs(d.jobs || []);
    } catch (err) {
      if (process.env.NODE_ENV === 'development') console.warn('fetchJobs failed:', err);
    }
  }, []);

  const fetchTestCases = useCallback(async () => {
    try {
      const r = await fetch(`${API}/test-cases`, { headers: apiHeaders() });
      if (!r.ok) throw new Error(`Failed to fetch test cases (${r.status})`);
      const d = await r.json();
      setTestCases(d.testCases || d.cases || []);
    } catch (err) {
      if (process.env.NODE_ENV === 'development') console.warn('fetchTestCases failed:', err);
    }
  }, []);

  async function deleteTestCase(id) {
    try {
      const r = await fetch(`${API}/test-cases/${encodeURIComponent(id)}`, { method: 'DELETE', headers: apiHeaders() });
      if (!r.ok) throw new Error('Failed to delete test case');
      addLog('Test case deleted', 'warn');
      fetchTestCases();
    } catch (e) { addLog(e.message, 'error'); }
  }

  async function runTestCaseAsJob(tc) {
    setRunConfigTarget({ kind: 'testcase', data: tc });
    setShowRunConfigModal(true);
  }

  async function rerunJob(job) {
    setRunConfigTarget({ kind: 'job', data: job });
    setShowRunConfigModal(true);
  }

  async function executeWithConfig() {
    if (!runConfigTarget) return;
    const { kind, data } = runConfigTarget;
    setShowRunConfigModal(false);
    try {
      let r, d;
      if (kind === 'testcase') {
        const steps = data.testSteps || [];
        r = await fetch(`${API}/run`, {
          method: 'POST', headers: apiHeaders(),
          body: JSON.stringify({ type: 'AUTOMATE', payload: { steps, testCaseId: data.id, testCaseName: data.name, source: 'dashboard', browser: runConfig.browser, server: runConfig.server, environment: runConfig.environment } }),
        });
        d = await r.json();
        if (!r.ok) throw new Error(d.error || 'Failed to run test case');
        addLog(`Job ${d.jobId.slice(0, 8)}… queued from "${data.name}"`, 'success');
      } else {
        r = await fetch(`${API}/run`, {
          method: 'POST', headers: apiHeaders(),
          body: JSON.stringify({ type: data.type, payload: { ...data.payload, browser: runConfig.browser, server: runConfig.server, environment: runConfig.environment } }),
        });
        d = await r.json();
        if (!r.ok) throw new Error(d.error || 'Failed to rerun job');
        addLog(`Job ${d.jobId.slice(0, 8)}… re-queued [${data.type}]`, 'success');
      }
      fetchJobs(); setActiveNav('jobs');
    } catch (e) { addLog(e.message, 'error'); }
    setRunConfigTarget(null);
    setRunConfig({ browser: 'chromium', server: 'local', environment: '' });
  }

  const fetchHealth = useCallback(async () => {
    try { const r = await fetch(`${API}/health`); const d = await r.json(); setHealth(d); }
    catch { setHealth(null); }
  }, []);

  const fetchCredentials = useCallback(async () => {
    try {
      const r = await fetch(`${API}/credentials`, { headers: apiHeaders() });
      if (!r.ok) throw new Error(`Failed to fetch credentials (${r.status})`);
      const d = await r.json();
      setCredentials(d.credentials || []);
    } catch (err) {
      if (process.env.NODE_ENV === 'development') console.warn('fetchCredentials failed:', err);
    }
  }, []);

  async function saveCred() {
    if (!credForm.accountName.trim()) { setError('Account Name is required'); return; }
    setSubmitting(true);
    try {
      const id = editingCred?.id || 'cred-' + Date.now() + '-' + Math.random().toString(36).slice(2, 9);
      const r = await fetch(`${API}/credentials`, { method: 'POST', headers: apiHeaders(), body: JSON.stringify({ id, ...credForm }) });
      const d = await r.json();
      if (!r.ok) throw new Error(d.error || 'Failed to save credential');
      addLog(`Credential "${credForm.accountName}" ${editingCred ? 'updated' : 'saved'}`, 'success');
      fetchCredentials(); setShowCredForm(false); setEditingCred(null);
      setCredForm({ accountName: '', profile: '', userEmail: '', portalId: '', clientId: '', clientSecret: '', refreshToken: '' });
      setError('');
    } catch (e) { setError(e.message); addLog(e.message, 'error'); }
    setSubmitting(false);
  }

  async function deleteCred(id) {
    try {
      const r = await fetch(`${API}/credentials/${encodeURIComponent(id)}`, { method: 'DELETE', headers: apiHeaders() });
      if (!r.ok) throw new Error('Failed to delete credential');
      addLog('Credential deleted', 'warn'); fetchCredentials();
    } catch (e) { addLog(e.message, 'error'); }
  }

  const fetchEnvironments = useCallback(async () => {
    try {
      const r = await fetch(`${API}/environments`, { headers: apiHeaders() });
      if (!r.ok) throw new Error(`Failed to fetch environments (${r.status})`);
      const d = await r.json();
      setEnvironments(d.environments || []);
    } catch (err) {
      if (process.env.NODE_ENV === 'development') console.warn('fetchEnvironments failed:', err);
    }
  }, []);

  async function saveEnv() {
    if (!envForm.name.trim()) { setError('Name is required'); return; }
    setSubmitting(true);
    try {
      const id = editingEnv?.id || 'env-' + Date.now() + '-' + Math.random().toString(36).slice(2, 9);
      const r = await fetch(`${API}/environments`, { method: 'POST', headers: apiHeaders(), body: JSON.stringify({ id, ...envForm }) });
      const d = await r.json();
      if (!r.ok) throw new Error(d.error || 'Failed to save environment');
      addLog(`Environment "${envForm.name}" ${editingEnv ? 'updated' : 'saved'}`, 'success');
      fetchEnvironments(); setShowEnvForm(false); setEditingEnv(null);
      setEnvForm({ name: '', url: '', description: '' });
      setError('');
    } catch (e) { setError(e.message); addLog(e.message, 'error'); }
    setSubmitting(false);
  }

  async function deleteEnv(id) {
    try {
      const r = await fetch(`${API}/environments/${encodeURIComponent(id)}`, { method: 'DELETE', headers: apiHeaders() });
      if (!r.ok) throw new Error('Failed to delete environment');
      addLog('Environment deleted', 'warn'); fetchEnvironments();
    } catch (e) { addLog(e.message, 'error'); }
  }

  useEffect(() => {
    fetchJobs(); fetchTestCases(); fetchHealth(); fetchCredentials(); fetchEnvironments();
    const t = setInterval(() => { fetchJobs(); fetchTestCases(); fetchHealth(); fetchCredentials(); fetchEnvironments(); }, 3000);
    return () => clearInterval(t);
  }, [fetchJobs, fetchTestCases, fetchHealth, fetchCredentials, fetchEnvironments]);

  const statusCounts = useMemo(() => {
    const counts = { ALL: jobs.length, QUEUED: 0, RUNNING: 0, DONE: 0, FAILED: 0 };
    jobs.forEach(j => { if (counts[j.status] !== undefined) counts[j.status]++; });
    return counts;
  }, [jobs]);

  // ── Step Templates ──────────────────────────────────────────
  const ERROR_HANDLING_OPTIONS = ['CONTINUE_ON_ERROR', 'STOP_ON_ERROR'];
  const WINDOW_TYPE_OPTIONS = ['same window', 'new tab', 'new window'];
  const SELECT_TYPE_OPTIONS = ['INDEX', 'TEXT', 'VALUE'];
  const WAIT_EVENT_OPTIONS = ['CLICKABLE', 'HIDE', 'PRESENT', 'SHOW'];

  const STEP_TEMPLATES = {
    'General': [
      { type: 'openUrl', label: 'Open URL', icon: '🔗', params: { url: '', windowType: '' }, paramMeta: { url: { type: 'text', placeholder: '<URL>' }, windowType: { type: 'select', options: WINDOW_TYPE_OPTIONS, placeholder: '<Window Type>' } } },
      { type: 'wait', label: 'Wait', icon: '⏱️', params: { time: '', locator: '', event: '' }, paramMeta: { time: { type: 'text', placeholder: '<Time>' }, locator: { type: 'text', placeholder: '<Locator>' }, event: { type: 'select', options: WAIT_EVENT_OPTIONS, placeholder: 'Select Event' } } },
    ],
    'Interactions': [
      { type: 'click', label: 'Click', icon: '🖱️', params: { locator: '' }, paramMeta: { locator: { type: 'text', placeholder: '<Locator>' } } },
      { type: 'setValue', label: 'Set Value', icon: '✏️', params: { locator: '', value: '' }, paramMeta: { locator: { type: 'text', placeholder: '<Locator>' }, value: { type: 'text', placeholder: '<Value>' } } },
      { type: 'select', label: 'Select', icon: '▶', params: { locator: '', values: '', selectType: '' }, paramMeta: { locator: { type: 'text', placeholder: '<Locator>' }, values: { type: 'text', placeholder: '<Values>' }, selectType: { type: 'select', options: SELECT_TYPE_OPTIONS, placeholder: 'Select Type' } } },
      { type: 'deselect', label: 'Deselect', icon: '◁', params: { locator: '', values: '', selectType: '' }, paramMeta: { locator: { type: 'text', placeholder: '<Locator>' }, values: { type: 'text', placeholder: '<Values>' }, selectType: { type: 'select', options: SELECT_TYPE_OPTIONS, placeholder: 'Select Type' } } },
      { type: 'check', label: 'Check', icon: '✓', params: { locator: '' }, paramMeta: { locator: { type: 'text', placeholder: '<Locator>' } } },
      { type: 'uncheck', label: 'Uncheck', icon: '⊘', params: { locator: '' }, paramMeta: { locator: { type: 'text', placeholder: '<Locator>' } } },
      { type: 'clear', label: 'Clear', icon: '✕', params: { locator: '' }, paramMeta: { locator: { type: 'text', placeholder: '<Locator>' } } },
      { type: 'upload', label: 'Upload', icon: '⬆', params: { locator: '', fileName: '' }, paramMeta: { locator: { type: 'text', placeholder: '<Locator>' }, fileName: { type: 'text', placeholder: '<File Name>' } } },
    ],
    'Assertions': [
      { type: 'assertText', label: 'Assert Text', icon: 'T', params: { locator: '', text: '', errorHandling: 'CONTINUE_ON_ERROR' }, paramMeta: { locator: { type: 'text', placeholder: '<Locator>' }, text: { type: 'text', placeholder: '<Text>' }, errorHandling: { type: 'select', options: ERROR_HANDLING_OPTIONS, placeholder: 'Error Handling' } } },
      { type: 'assertValue', label: 'Assert Value', icon: '🔍', params: { locator: '', text: '', errorHandling: 'STOP_ON_ERROR' }, paramMeta: { locator: { type: 'text', placeholder: '<Locator>' }, text: { type: 'text', placeholder: '<Text>' }, errorHandling: { type: 'select', options: ERROR_HANDLING_OPTIONS, placeholder: 'Error Handling' } } },
      { type: 'assertSelected', label: 'Assert Selected', icon: '☑', params: { locator: '', errorHandling: 'CONTINUE_ON_ERROR' }, paramMeta: { locator: { type: 'text', placeholder: '<Locator>' }, errorHandling: { type: 'select', options: ERROR_HANDLING_OPTIONS, placeholder: 'Error Handling' } } },
      { type: 'assertDisabled', label: 'Assert Disabled', icon: '⊗', params: { locator: '', errorHandling: 'CONTINUE_ON_ERROR' }, paramMeta: { locator: { type: 'text', placeholder: '<Locator>' }, errorHandling: { type: 'select', options: ERROR_HANDLING_OPTIONS, placeholder: 'Error Handling' } } },
      { type: 'assertVisible', label: 'Assert Visible', icon: '👁', params: { locator: '', errorHandling: 'CONTINUE_ON_ERROR' }, paramMeta: { locator: { type: 'text', placeholder: '<Locator>' }, errorHandling: { type: 'select', options: ERROR_HANDLING_OPTIONS, placeholder: 'Error Handling' } } },
      { type: 'assertFocused', label: 'Assert Focused', icon: '◉', params: { locator: '', errorHandling: 'CONTINUE_ON_ERROR' }, paramMeta: { locator: { type: 'text', placeholder: '<Locator>' }, errorHandling: { type: 'select', options: ERROR_HANDLING_OPTIONS, placeholder: 'Error Handling' } } },
      { type: 'assertHidden', label: 'Assert Hidden', icon: '◌', params: { locator: '', errorHandling: 'CONTINUE_ON_ERROR' }, paramMeta: { locator: { type: 'text', placeholder: '<Locator>' }, errorHandling: { type: 'select', options: ERROR_HANDLING_OPTIONS, placeholder: 'Error Handling' } } },
      { type: 'assertImageExists', label: 'Assert ImageExi...', icon: '🖼', params: { locator: '', errorHandling: 'CONTINUE_ON_ERROR' }, paramMeta: { locator: { type: 'text', placeholder: '<Locator>' }, errorHandling: { type: 'select', options: ERROR_HANDLING_OPTIONS, placeholder: 'Error Handling' } } },
      { type: 'assertFileDownloaded', label: 'Assert File Dow...', icon: '📁', params: { fileName: '', errorHandling: 'CONTINUE_ON_ERROR' }, paramMeta: { fileName: { type: 'text', placeholder: '<File Name>' }, errorHandling: { type: 'select', options: ERROR_HANDLING_OPTIONS, placeholder: 'Error Handling' } } },
      { type: 'assertNotPresent', label: 'Assert Not Pres...', icon: '∅', params: { locator: '', errorHandling: 'CONTINUE_ON_ERROR' }, paramMeta: { locator: { type: 'text', placeholder: '<Locator>' }, errorHandling: { type: 'select', options: ERROR_HANDLING_OPTIONS, placeholder: 'Error Handling' } } },
      { type: 'throwError', label: 'Throw Error', icon: '⚠', params: { message: '' }, paramMeta: { message: { type: 'text', placeholder: '<Error Message>' } } },
    ],
  };

  function addStep(template) {
    const newStep = { id: 'step-' + Date.now() + '-' + Math.random().toString(36).slice(2, 6), ...template, config: { timeout: 30, retries: 0, errorHandling: 'STOP_ON_ERROR', description: '', group: '' } };
    setTestSteps([...testSteps, newStep]); setSelectedStep(newStep.id);
  }
  function removeStep(stepId) { setTestSteps(testSteps.filter(s => s.id !== stepId)); if (selectedStep === stepId) setSelectedStep(null); }
  function updateStepParam(stepId, paramKey, value) { setTestSteps(testSteps.map(s => s.id === stepId ? { ...s, params: { ...s.params, [paramKey]: value } } : s)); }
  function updateStepConfig(stepId, configKey, value) { setTestSteps(testSteps.map(s => s.id === stepId ? { ...s, config: { ...s.config, [configKey]: value } } : s)); }
  function moveStep(stepId, direction) {
    const idx = testSteps.findIndex(s => s.id === stepId);
    if ((direction === 'up' && idx > 0) || (direction === 'down' && idx < testSteps.length - 1)) {
      const newSteps = [...testSteps]; const swapIdx = direction === 'up' ? idx - 1 : idx + 1;
      [newSteps[idx], newSteps[swapIdx]] = [newSteps[swapIdx], newSteps[idx]]; setTestSteps(newSteps);
    }
  }
  function duplicateStep(stepId) {
    const step = testSteps.find(s => s.id === stepId); if (!step) return;
    const idx = testSteps.findIndex(s => s.id === stepId);
    const newStep = { ...step, id: 'step-' + Date.now() + '-' + Math.random().toString(36).slice(2, 6), params: { ...step.params }, config: { ...step.config } };
    const newSteps = [...testSteps]; newSteps.splice(idx + 1, 0, newStep); setTestSteps(newSteps); setSelectedStep(newStep.id);
  }
  function createGroup(name) { setStepGroups([...stepGroups, { id: 'grp-' + Date.now(), name, collapsed: false }]); }
  function assignStepToGroup(stepId, groupId) { updateStepConfig(stepId, 'group', groupId); }
  function saveVersion() {
    if (!editingTestCase?.name) return;
    const version = { id: 'v-' + Date.now(), version: testCaseVersions.length + 1, name: editingTestCase.name, description: editingTestCase.description, steps: JSON.parse(JSON.stringify(testSteps)), savedAt: new Date().toISOString() };
    setTestCaseVersions([...testCaseVersions, version]); addLog(`Version ${version.version} saved`, 'success');
  }
  function restoreVersion(versionId) {
    const version = testCaseVersions.find(v => v.id === versionId); if (!version) return;
    setTestSteps(JSON.parse(JSON.stringify(version.steps)));
    setEditingTestCase({ ...editingTestCase, name: version.name, description: version.description });
    addLog(`Restored to version ${version.version}`, 'success'); setShowVersionHistory(false);
  }
  function openExpressionEditor(stepId, paramKey) {
    setExpressionTarget({ stepId, paramKey }); const step = testSteps.find(s => s.id === stepId);
    setExpressionValue(step?.params?.[paramKey] || ''); setShowExpressionEditor(true);
  }
  function applyExpression() { if (expressionTarget) updateStepParam(expressionTarget.stepId, expressionTarget.paramKey, expressionValue); setShowExpressionEditor(false); setExpressionTarget(null); }
  function startRecording() { setIsRecording(true); setTestSteps([]); addLog('Recording started from browser extension', 'success'); if (typeof chrome !== 'undefined' && chrome.runtime) chrome.runtime.sendMessage({ type: 'START_RECORDING' }, () => {}); }
  function stopRecording() { setIsRecording(false); addLog('Recording stopped', 'success'); if (typeof chrome !== 'undefined' && chrome.runtime) chrome.runtime.sendMessage({ type: 'STOP_RECORDING' }, (res) => { if (res && res.steps) addLog(`${res.steps.length} steps recorded`, 'success'); }); }

  async function saveTestBuilderCase() {
    if (!editingTestCase?.name.trim()) { setError('Test case name is required'); return; }
    setSubmitting(true);
    try {
      const testCaseId = editingTestCase.id || 'tc-' + Date.now() + '-' + Math.random().toString(36).slice(2, 9);
      saveVersion();
      const r = await fetch(`${API}/test-cases`, { method: 'POST', headers: apiHeaders(), body: JSON.stringify({ id: testCaseId, name: editingTestCase.name, type: 'UI', framework: 'WebAPI Recorder', description: editingTestCase.description, steps: testSteps.length, version: testCaseVersions.length + 1, createdAt: new Date().toISOString(), testSteps, groups: stepGroups }) });
      const d = await r.json(); if (!r.ok) throw new Error(d.error || 'Failed to save test case');
      addLog(`Test case "${editingTestCase.name}" saved with ${testSteps.length} steps`, 'success');
      fetchTestCases(); setEditingTestCase(null); setTestSteps([]); setSelectedStep(null);
    } catch (e) { setError(e.message); addLog(e.message, 'error'); }
    setSubmitting(false);
  }

  async function runJob() {
    setError(''); let payload;
    try { payload = JSON.parse(form.payload); } catch { setError('Invalid JSON payload'); return; }
    setSubmitting(true);
    try {
      const r = await fetch(`${API}/run`, { method: 'POST', headers: apiHeaders(), body: JSON.stringify({ type: form.type, payload }) });
      const d = await r.json(); if (!r.ok) throw new Error(d.error);
      addLog(`Job ${d.jobId.slice(0, 8)}… queued [${form.type}]`, 'success'); fetchJobs(); setShowLaunchModal(false);
    } catch (e) { setError(e.message); addLog(e.message, 'error'); }
    setSubmitting(false);
  }

  async function createTestCase() {
    if (!testCaseForm.name.trim()) { setError('Test case name is required'); return; }
    setSubmitting(true);
    try {
      const testCaseId = 'tc-' + Date.now() + '-' + Math.random().toString(36).slice(2, 9);
      const r = await fetch(`${API}/test-cases`, { method: 'POST', headers: apiHeaders(), body: JSON.stringify({ id: testCaseId, name: testCaseForm.name, type: testCaseForm.type, framework: testCaseForm.framework, description: testCaseForm.description, createdAt: new Date().toISOString(), steps: 0 }) });
      const d = await r.json(); if (!r.ok) throw new Error(d.error || 'Failed to create test case');
      addLog(`Test case "${testCaseForm.name}" created`, 'success'); fetchTestCases(); setShowTestCaseModal(false);
      setTestCaseForm({ name: '', type: 'UI', framework: '', description: '' });
    } catch (e) { setError(e.message); addLog(e.message, 'error'); }
    setSubmitting(false);
  }

  async function cancelJob(id) {
    try { await fetch(`${API}/jobs/${id}`, { method: 'DELETE', headers: apiHeaders() }); addLog(`Job ${id.slice(0, 8)}… cancelled`, 'warn'); fetchJobs(); }
    catch (e) { addLog(e.message, 'error'); }
  }

  const filtered = useMemo(() => {
    let result = filter === 'ALL' ? jobs : jobs.filter(j => j.status === filter);
    if (searchQuery.trim()) { const q = searchQuery.toLowerCase(); result = result.filter(j => j.id.toLowerCase().includes(q) || j.type.toLowerCase().includes(q) || j.status.toLowerCase().includes(q)); }
    return result;
  }, [jobs, filter, searchQuery]);

  const STAT_CARDS = [
    { key: 'ALL', label: 'Total jobs', icon: '📊', color: '#3b8fd4', bgColor: 'bg-sky-50' },
    { key: 'QUEUED', label: 'In queue', icon: '⏳', color: '#f59e0b', bgColor: 'bg-amber-50' },
    { key: 'RUNNING', label: 'Running now', icon: '⚡', color: '#3b82f6', bgColor: 'bg-blue-50' },
    { key: 'DONE', label: 'Completed', icon: '✓', color: '#22c55e', bgColor: 'bg-emerald-50' },
    { key: 'FAILED', label: 'Failed', icon: '✗', color: '#ef4444', bgColor: 'bg-red-50' },
  ];

  // ── RENDER ──────────────────────────────────────────────────
  return (
    <>
      <Head>
        <title>WEBAPI — Automation Tool</title>
        <link rel="preconnect" href="https://fonts.googleapis.com" />
        <link rel="preconnect" href="https://fonts.gstatic.com" crossOrigin="anonymous" />
        <link href="https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600;700;800&family=JetBrains+Mono:wght@400;600&display=swap" rel="stylesheet" />
      </Head>

      <div className="flex h-screen overflow-hidden relative" style={{ background: 'linear-gradient(135deg, #c5e3f6 0%, #dbeef9 25%, #e8f4fd 50%, #f0f0fa 75%, #f5f0f5 100%)' }}>
        {/* ── Sidebar (Mind Bridge icon-only style) ── */}
        <nav className="w-[72px] flex-shrink-0 flex flex-col items-center py-5 z-10" style={{ background: 'rgba(255,255,255,0.45)', backdropFilter: 'blur(24px) saturate(180%)', WebkitBackdropFilter: 'blur(24px) saturate(180%)', borderRight: '1px solid rgba(255,255,255,0.5)', boxShadow: '2px 0 20px rgba(0,0,0,0.03)' }}>
          {/* Logo */}
          <div className="mb-6 pb-4 border-b border-gray-100">
            <div className="w-10 h-10 rounded-xl bg-gradient-to-br from-sky-400 to-blue-500 flex items-center justify-center shadow-md shadow-sky-200">
              <svg width="20" height="20" viewBox="0 0 24 24" fill="none"><path d="M8 8L4 12L8 16" stroke="white" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/><path d="M16 8L20 12L16 16" stroke="white" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/><line x1="11" y1="6" x2="13" y2="18" stroke="white" strokeWidth="1.5" strokeLinecap="round" opacity="0.7"/></svg>
            </div>
          </div>

          {/* Nav Icons */}
          <div className="flex flex-col items-center gap-1 flex-1">
            {NAV_ITEMS.map(({ key, icon, label }) => (
              <button key={key} onClick={() => setActiveNav(key)} title={label}
                className={`w-11 h-11 rounded-xl flex items-center justify-center text-lg transition-all duration-200 ${activeNav === key ? 'bg-sky-100 text-sky-600 shadow-sm shadow-sky-100' : 'text-gray-400 hover:bg-sky-50 hover:text-sky-500'}`}>
                <span>{icon}</span>
              </button>
            ))}

            <div className="w-6 h-px bg-gray-200 my-3" />

            {NAV_BOTTOM.map(({ key, icon, label }) => (
              <button key={key} onClick={() => setActiveNav(key)} title={label}
                className={`w-11 h-11 rounded-xl flex items-center justify-center text-lg transition-all duration-200 ${activeNav === key ? 'bg-sky-100 text-sky-600 shadow-sm shadow-sky-100' : 'text-gray-400 hover:bg-sky-50 hover:text-sky-500'}`}>
                <span>{icon}</span>
              </button>
            ))}
          </div>

          {/* Status */}
          <div className="mt-auto pt-4" title={health ? 'API Online' : 'API Offline'}>
            <div className={`w-2.5 h-2.5 rounded-full ${health ? 'bg-emerald-400 shadow-[0_0_0_3px_rgba(52,199,123,0.2)] animate-pulse' : 'bg-red-400'}`} />
          </div>
        </nav>

        {/* ── Main Area ── */}
        <div className="flex-1 flex flex-col min-w-0 overflow-hidden bg-transparent">
          {/* ── Top Bar ── */}
          <header className="flex items-center justify-between px-9 pt-7 pb-2">
            <h1 className="text-[26px] font-bold text-gray-800 tracking-tight">
              Hey, Welcome back! <span className="inline-block">👋</span>
            </h1>
            <div className="flex items-center gap-2.5">
              <button className="w-10 h-10 rounded-xl border border-gray-200 bg-white flex items-center justify-center text-sm text-gray-400 hover:border-sky-300 hover:bg-sky-50 transition-all shadow-sm" title="Notifications">🔔</button>
              <button className="w-10 h-10 rounded-xl border border-gray-200 bg-white flex items-center justify-center text-sm hover:border-sky-300 hover:bg-sky-50 transition-all shadow-sm" title={health ? 'API Live' : 'API Offline'}>{health ? '🟢' : '🔴'}</button>
              <div className="w-10 h-10 rounded-xl bg-gradient-to-br from-sky-400 to-blue-500 flex items-center justify-center text-white text-xs font-bold shadow-md shadow-sky-200 cursor-pointer">WA</div>
            </div>
          </header>

          {/* ── Content ── */}
          <div className="flex-1 overflow-y-auto px-9 py-5 flex flex-col gap-5">

            {/* ═══ Jobs Section ═══ */}
            {activeNav === 'jobs' && (
              <>
                {/* Stat Cards */}
                <div className="grid grid-cols-5 gap-4">
                  {STAT_CARDS.map(({ key, label, icon, color, bgColor }) => (
                    <div key={key} onClick={() => setFilter(key)} role="button" tabIndex={0} onKeyDown={e => e.key === 'Enter' && setFilter(key)}
                      className={`bg-white rounded-2xl border border-gray-100 p-6 shadow-sm hover:shadow-md hover:-translate-y-0.5 transition-all duration-200 cursor-pointer group`}>
                      <div className="flex items-center justify-between mb-4">
                        <span className="text-xl">{icon}</span>
                        <span className={`text-[10px] font-bold tracking-wider uppercase px-3 py-1 rounded-full ${bgColor}`} style={{ color }}>{key}</span>
                      </div>
                      <div className="text-4xl font-extrabold tracking-tight mb-1" style={{ color }}>{statusCounts[key]}</div>
                      <div className="text-sm text-gray-400">{label}</div>
                      {/* Mini progress bar like Mind Bridge */}
                      <div className="mt-3 h-1.5 bg-gray-100 rounded-full overflow-hidden">
                        <div className="h-full rounded-full transition-all duration-500" style={{ backgroundColor: color, width: `${statusCounts.ALL ? (statusCounts[key] / Math.max(statusCounts.ALL, 1)) * 100 : 0}%` }} />
                      </div>
                    </div>
                  ))}
                </div>

                {/* Jobs Card */}
                <div className="flex gap-5 items-start">
                  <div className="flex-1 min-w-0 bg-white rounded-2xl border border-gray-100 shadow-sm overflow-hidden">
                    <div className="flex items-center justify-between px-7 py-5 border-b border-gray-100">
                      <div className="flex items-center gap-3">
                        <span className="text-lg font-bold text-gray-800">Jobs List</span>
                        <span className="bg-sky-50 text-sky-600 text-xs font-bold px-3 py-1 rounded-full">{filtered.length}</span>
                      </div>
                    </div>

                    {/* Filter tabs */}
                    <div className="flex px-6 border-b border-gray-100 bg-gray-50/50 overflow-x-auto">
                      {['ALL', 'QUEUED', 'RUNNING', 'DONE', 'FAILED'].map(f => (
                        <button key={f} onClick={() => setFilter(f)}
                          className={`flex items-center gap-1.5 px-4 py-3 text-[13px] font-medium border-b-2 transition-all whitespace-nowrap ${filter === f ? 'border-sky-500 text-sky-600 font-semibold' : 'border-transparent text-gray-400 hover:text-gray-600'}`}>
                          {STATUS_ICON[f] || '◎'} {f}
                          {f !== 'ALL' && statusCounts[f] > 0 && (
                            <span className="bg-gray-200 text-gray-500 text-[10px] font-bold px-2 py-0.5 rounded-full">{statusCounts[f]}</span>
                          )}
                        </button>
                      ))}
                    </div>

                    {/* Table */}
                    <div className="overflow-y-auto max-h-[420px]">
                      {filtered.length === 0 ? (
                        <div className="flex flex-col items-center justify-center py-16 text-gray-400">
                          <div className="text-4xl opacity-30 mb-3">∅</div>
                          <div className="text-sm">No jobs {filter !== 'ALL' ? `with status ${filter}` : 'yet'}</div>
                          <div className="text-xs mt-1 text-gray-300">Run a test case to create a job</div>
                        </div>
                      ) : (
                        <table className="w-full">
                          <thead>
                            <tr className="bg-gray-50/60 border-b border-gray-100">
                              {['NAME', 'STATUS', 'TYPE', 'CREATED', 'ACTION'].map(h => (
                                <th key={h} className="text-left px-5 py-3 text-[11px] font-bold uppercase tracking-wider text-gray-400">{h}</th>
                              ))}
                            </tr>
                          </thead>
                          <tbody>
                            {filtered.map(job => {
                              const badge = STATUS_BADGE[job.status] || { bg: 'bg-gray-50', color: 'text-gray-500', icon: '?' };
                              return (
                                <tr key={job.id} onClick={() => setSelected(job)} className="border-b border-gray-50 cursor-pointer hover:bg-sky-50/50 transition-colors">
                                  <td className="px-5 py-3.5"><span className="font-mono text-[13px] font-semibold text-gray-700">{job.id.slice(0, 8)}…</span></td>
                                  <td className="px-5 py-3.5"><span className={`inline-flex items-center gap-1 px-3 py-1 rounded-full text-xs font-semibold ${badge.bg} ${badge.color}`}>{badge.icon} {job.status}</span></td>
                                  <td className="px-5 py-3.5"><span className="text-xs font-semibold px-3 py-1 rounded-lg bg-sky-50 text-sky-600">{job.type}</span></td>
                                  <td className="px-5 py-3.5"><span className="text-[13px] text-gray-400">{timeAgo(job.createdAt)}</span></td>
                                  <td className="px-5 py-3.5" onClick={e => e.stopPropagation()}>
                                    <div className="flex gap-1.5">
                                      <button onClick={() => setSelected(job)} className="w-8 h-8 rounded-lg border border-gray-200 bg-white flex items-center justify-center text-xs text-gray-400 hover:border-sky-300 hover:text-sky-500 transition-all" title="View">👁</button>
                                      {(job.status === 'DONE' || job.status === 'FAILED') && <button onClick={() => rerunJob(job)} className="w-8 h-8 rounded-lg border border-gray-200 bg-white flex items-center justify-center text-xs text-gray-400 hover:border-sky-300 hover:text-sky-500 transition-all" title="Re-run">▶</button>}
                                      {job.status === 'QUEUED' && <button onClick={() => cancelJob(job.id)} className="w-8 h-8 rounded-lg border border-gray-200 bg-white flex items-center justify-center text-xs text-gray-400 hover:border-red-300 hover:text-red-500 transition-all" title="Cancel">✕</button>}
                                    </div>
                                  </td>
                                </tr>
                              );
                            })}
                          </tbody>
                        </table>
                      )}
                    </div>
                  </div>

                  {/* Detail Panel */}
                  {selected && (
                    <div className="w-[370px] flex-shrink-0 bg-white rounded-2xl border border-gray-100 shadow-md overflow-hidden flex flex-col max-h-[580px] animate-[slideIn_0.25s_ease]">
                      <div className="flex items-start justify-between p-5 border-b border-gray-100 bg-gray-50/40">
                        <div>
                          <div className="font-mono text-sm font-bold text-gray-700 mb-2">{selected.id.slice(0, 14)}…</div>
                          {(() => { const b = STATUS_BADGE[selected.status] || { bg: 'bg-gray-50', color: 'text-gray-500', icon: '?' }; return <span className={`inline-flex items-center gap-1 px-3 py-1 rounded-full text-xs font-semibold ${b.bg} ${b.color}`}>{b.icon} {selected.status}</span>; })()}
                        </div>
                        <button onClick={() => setSelected(null)} className="w-8 h-8 rounded-lg border border-gray-200 bg-white flex items-center justify-center text-xs text-gray-400 hover:border-red-300 hover:text-red-500 transition-all">✕</button>
                      </div>
                      <div className="flex-1 overflow-y-auto p-5 flex flex-col gap-3.5">
                        {[['Type', selected.type], ['Status', selected.status], ['Created', selected.createdAt ? new Date(selected.createdAt).toLocaleString() : '—'], ['Started', selected.startedAt ? new Date(selected.startedAt).toLocaleString() : '—'], ['Completed', selected.completedAt ? new Date(selected.completedAt).toLocaleString() : '—']].map(([k, v]) => (
                          <div key={k} className="flex flex-col gap-1">
                            <div className="text-[11px] text-gray-400 uppercase tracking-wider font-semibold">{k}</div>
                            <div className="text-[13px] text-gray-700 bg-gray-50 border border-gray-100 rounded-xl px-3.5 py-2">{v}</div>
                          </div>
                        ))}
                        <div className="flex flex-col gap-1">
                          <div className="text-[11px] text-gray-400 uppercase tracking-wider font-semibold">Payload</div>
                          <pre className="text-xs text-gray-600 bg-gray-50 border border-gray-100 rounded-xl p-3.5 font-mono whitespace-pre-wrap break-all max-h-44 overflow-auto">{JSON.stringify(selected.payload, null, 2)}</pre>
                        </div>
                      </div>
                    </div>
                  )}
                </div>
              </>
            )}

            {/* ═══ Test Cases Section ═══ */}
            {activeNav === 'testcases' && (
              <>
                {!editingTestCase ? (
                  <div className="bg-white rounded-2xl border border-gray-100 shadow-sm overflow-hidden">
                    <div className="flex items-center justify-between px-7 py-5 border-b border-gray-100">
                      <div className="flex items-center gap-3">
                        <span className="text-lg font-bold text-gray-800">📝 Test Cases</span>
                        <span className="bg-sky-50 text-sky-600 text-xs font-bold px-3 py-1 rounded-full">{testCases.length}</span>
                      </div>
                      <button onClick={() => { setEditingTestCase({ name: '', description: '' }); setTestSteps([]); setSelectedStep(null); }}
                        className="bg-sky-500 text-white px-5 py-2.5 rounded-xl text-[13px] font-semibold hover:bg-sky-600 transition-all shadow-sm shadow-sky-200 hover:shadow-md">+ New Test Case</button>
                    </div>
                    <div className="overflow-y-auto max-h-[420px]">
                      {testCases.length === 0 ? (
                        <div className="flex flex-col items-center justify-center py-16 text-gray-400">
                          <div className="text-4xl opacity-30 mb-3">📝</div>
                          <div className="text-sm">No test cases yet</div>
                          <button onClick={() => { setEditingTestCase({ name: '', description: '' }); setTestSteps([]); }}
                            className="mt-4 bg-sky-500 text-white px-6 py-2.5 rounded-xl text-[13px] font-semibold hover:bg-sky-600 transition-all shadow-sm shadow-sky-200">+ Create your first test case</button>
                        </div>
                      ) : (
                        <table className="w-full">
                          <thead><tr className="bg-gray-50/60 border-b border-gray-100">{['NAME','TYPE','FRAMEWORK','STEPS','CREATED','ACTION'].map(h=><th key={h} className="text-left px-5 py-3 text-[11px] font-bold uppercase tracking-wider text-gray-400">{h}</th>)}</tr></thead>
                          <tbody>
                            {testCases.map((tc, idx) => (
                              <tr key={idx} className="border-b border-gray-50 hover:bg-sky-50/50 transition-colors">
                                <td className="px-5 py-3.5"><span className="font-mono text-[13px] font-semibold text-gray-700">{tc.name}</span></td>
                                <td className="px-5 py-3.5"><span className="text-xs font-semibold px-3 py-1 rounded-lg bg-sky-50 text-sky-600">{tc.type || 'Unknown'}</span></td>
                                <td className="px-5 py-3.5"><span className="text-[13px] text-gray-400">{tc.framework || '—'}</span></td>
                                <td className="px-5 py-3.5"><span className="text-xs font-semibold px-3 py-1 rounded-lg bg-sky-50 text-sky-600">{(tc.testSteps || []).length || tc.steps || 0}</span></td>
                                <td className="px-5 py-3.5"><span className="text-[13px] text-gray-400">{timeAgo(tc.createdAt)}</span></td>
                                <td className="px-5 py-3.5">
                                  <div className="flex gap-1.5">
                                    <button onClick={() => runTestCaseAsJob(tc)} className="w-8 h-8 rounded-lg border border-gray-200 bg-white flex items-center justify-center text-xs text-gray-400 hover:border-sky-300 hover:text-sky-500 transition-all" title="Run">▶</button>
                                    <button onClick={() => { setEditingTestCase(tc); setTestSteps(tc.testSteps || []); }} className="w-8 h-8 rounded-lg border border-gray-200 bg-white flex items-center justify-center text-xs text-gray-400 hover:border-sky-300 hover:text-sky-500 transition-all" title="Edit">✏️</button>
                                    <button onClick={() => { if (confirm('Delete test case "' + (tc.name || tc.id) + '"?')) deleteTestCase(tc.id); }} className="w-8 h-8 rounded-lg border border-gray-200 bg-white flex items-center justify-center text-xs text-gray-400 hover:border-red-300 hover:text-red-500 transition-all" title="Delete">🗑️</button>
                                  </div>
                                </td>
                              </tr>
                            ))}
                          </tbody>
                        </table>
                      )}
                    </div>
                  </div>
                ) : (
                  /* ── Test Builder ── */
                  <div className="bg-white rounded-2xl border border-gray-100 shadow-md overflow-hidden flex flex-col" style={{ height: 'calc(100vh - 140px)' }}>
                    <div className="px-7 py-5 border-b border-gray-100 bg-gray-50/40 flex items-center justify-between gap-4">
                      <div>
                        <input type="text" value={editingTestCase.name} onChange={e => setEditingTestCase({ ...editingTestCase, name: e.target.value })} placeholder="Test Case Name"
                          className="text-lg font-bold text-gray-800 bg-transparent border-none border-b-2 border-transparent focus:border-sky-400 outline-none px-2 py-1 w-full max-w-[400px]" />
                        <input type="text" value={editingTestCase.description || ''} onChange={e => setEditingTestCase({ ...editingTestCase, description: e.target.value })} placeholder="Description (optional)"
                          className="text-[13px] text-gray-400 bg-transparent border-none outline-none px-2 py-1 mt-1 w-full" />
                      </div>
                      <div className="flex gap-2 flex-shrink-0 items-center">
                        <button onClick={isRecording ? stopRecording : startRecording}
                          className={`px-4 py-2.5 rounded-xl text-[13px] font-semibold text-white transition-all ${isRecording ? 'bg-red-500 animate-pulse' : 'bg-amber-500 hover:bg-amber-600'} shadow-sm`}>
                          {isRecording ? '⏹ STOP' : '⏺ REC'}
                        </button>
                        <button onClick={() => setShowVersionHistory(true)} className="px-4 py-2.5 rounded-xl text-[13px] font-semibold text-gray-500 border border-gray-200 hover:border-sky-300 hover:text-sky-500 transition-all">🕐 v{testCaseVersions.length + 1}</button>
                        <button onClick={saveTestBuilderCase} disabled={submitting} className="px-5 py-2.5 rounded-xl text-[13px] font-semibold text-white bg-emerald-500 hover:bg-emerald-600 transition-all shadow-sm shadow-emerald-200 disabled:opacity-50">{submitting ? 'SAVING…' : '💾 Save'}</button>
                        <button className="px-4 py-2.5 rounded-xl text-[13px] font-semibold text-gray-600 border border-gray-200 hover:border-sky-300 hover:text-sky-500 transition-all">▶ Run</button>
                        <button onClick={() => { setEditingTestCase(null); setTestSteps([]); setTestCaseVersions([]); setStepGroups([]); }}
                          className="px-4 py-2.5 rounded-xl text-[13px] font-semibold text-gray-400 border border-gray-200 hover:border-red-300 hover:text-red-500 transition-all">✕</button>
                      </div>
                    </div>

                    <div className="grid grid-cols-[220px_1fr_320px] flex-1 overflow-hidden min-h-0">
                      {/* Step Library */}
                      <div className="bg-gray-50/60 border-r border-gray-100 overflow-y-auto p-4 flex flex-col gap-4">
                        {Object.entries(STEP_TEMPLATES).map(([category, steps]) => (
                          <div key={category} className="flex flex-col gap-1.5">
                            <div className="text-[11px] font-bold uppercase text-sky-600 tracking-wider px-1.5 mb-1">{category}</div>
                            {steps.map(step => (
                              <button key={step.type} onClick={() => addStep(step)} draggable onDragStart={e => { e.dataTransfer.effectAllowed = 'copy'; setDraggedStep(step); }} title={`Add ${step.label}`}
                                className="flex items-center gap-2.5 px-3 py-2.5 bg-white border border-gray-200 rounded-xl text-[13px] text-gray-700 hover:bg-sky-50 hover:border-sky-300 transition-all cursor-grab active:cursor-grabbing whitespace-nowrap">
                                <span className="text-sm">{step.icon}</span>
                                <span className="font-medium truncate">{step.label}</span>
                              </button>
                            ))}
                          </div>
                        ))}
                      </div>

                      {/* Steps Canvas */}
                      <div className="bg-[#f8fafd] flex flex-col overflow-hidden border-r border-gray-100">
                        <div className="px-5 py-3.5 border-b border-gray-100 text-sm font-semibold text-gray-700 bg-gray-50/60 flex items-center justify-between">
                          <span>Test Steps ({testSteps.length})</span>
                          <button onClick={() => { const name = prompt('Group name:'); if (name) createGroup(name); }} className="text-xs text-gray-400 border border-gray-200 rounded-lg px-3 py-1.5 hover:border-sky-300 hover:text-sky-500 transition-all">+ Group</button>
                        </div>
                        <div className="flex-1 overflow-y-auto p-4"
                          onDragOver={e => { e.preventDefault(); e.currentTarget.style.background = '#e8f4fd'; }}
                          onDragLeave={e => { e.currentTarget.style.background = ''; }}
                          onDrop={e => { e.currentTarget.style.background = ''; if (draggedStep) { addStep(draggedStep); setDraggedStep(null); } }}>
                          {testSteps.length === 0 ? (
                            <div className="flex flex-col items-center justify-center h-full text-gray-400 text-sm opacity-60 gap-3">
                              <div className="text-4xl opacity-40">📋</div>
                              <div>Drag steps here or record from browser</div>
                            </div>
                          ) : (
                            <div className="flex flex-col gap-0.5">
                              {testSteps.map((step, idx) => (
                                <div key={step.id} onClick={() => setSelectedStep(step.id)} draggable
                                  onDragStart={e => { e.dataTransfer.effectAllowed = 'move'; setDraggedStep({ ...step, _reorder: true, _fromIdx: idx }); }}
                                  onDragOver={e => { e.preventDefault(); e.currentTarget.style.borderTopColor = '#3b8fd4'; e.currentTarget.style.borderTopWidth = '3px'; }}
                                  onDragLeave={e => { e.currentTarget.style.borderTopColor = ''; e.currentTarget.style.borderTopWidth = ''; }}
                                  onDrop={e => { e.stopPropagation(); e.currentTarget.style.borderTopColor = ''; e.currentTarget.style.borderTopWidth = '';
                                    if (draggedStep && draggedStep._reorder) { const fromIdx = draggedStep._fromIdx; if (fromIdx !== idx) { const ns = [...testSteps]; const [m] = ns.splice(fromIdx, 1); ns.splice(idx, 0, m); setTestSteps(ns); } setDraggedStep(null); }
                                    else if (draggedStep) { const ns = [...testSteps]; const nw = { id: 'step-' + Date.now() + '-' + Math.random().toString(36).slice(2, 6), ...draggedStep, config: { timeout: 30, retries: 0, errorHandling: 'STOP_ON_ERROR', description: '', group: '' } }; ns.splice(idx + 1, 0, nw); setTestSteps(ns); setSelectedStep(nw.id); setDraggedStep(null); }
                                  }}
                                  className={`flex items-center gap-3 px-4 py-3.5 bg-white border rounded-xl cursor-pointer transition-all mb-1 min-h-[56px] group ${selectedStep === step.id ? 'border-sky-300 bg-sky-50/60 shadow-sm' : 'border-transparent border-b-gray-100 hover:bg-sky-50/40'}`}>
                                  <div className="w-6 h-6 flex items-center justify-center text-xs font-semibold text-gray-400 flex-shrink-0">{idx + 1}</div>
                                  <div className="flex gap-2.5 items-center flex-1 min-w-0">
                                    <span className="text-base">{step.icon}</span>
                                    <div className="flex items-center gap-2 flex-wrap flex-1 min-w-0">
                                      <span className="text-[13px] font-semibold text-sky-600 whitespace-nowrap">{step.label}</span>
                                      {step.config?.group && <span className="text-[9px] bg-sky-50 text-sky-600 px-2 py-0.5 rounded font-semibold">{stepGroups.find(g => g.id === step.config.group)?.name || ''}</span>}
                                      <div className="flex gap-1.5 items-center flex-wrap">
                                        {Object.entries(step.params || {}).map(([k, v]) => (
                                          <span key={k} className={`text-xs px-2.5 py-1 rounded-lg border whitespace-nowrap max-w-[180px] truncate ${v ? 'text-gray-600 bg-sky-50 border-sky-200' : 'text-gray-400 bg-white border-gray-200'}`}>
                                            {v || (step.paramMeta?.[k]?.placeholder || `<${k}>`)}
                                          </span>
                                        ))}
                                      </div>
                                    </div>
                                  </div>
                                  {step.params?.errorHandling && <div className="text-[11px] text-sky-600 bg-sky-50 px-2.5 py-1 rounded-lg font-medium flex-shrink-0 whitespace-nowrap">errorhandling.{step.params.errorHandling}</div>}
                                  <div className="flex gap-0.5 flex-shrink-0 opacity-0 group-hover:opacity-100 transition-opacity">
                                    <button onClick={e => { e.stopPropagation(); duplicateStep(step.id); }} className="w-7 h-7 rounded-lg flex items-center justify-center text-xs text-gray-400 hover:text-sky-500 hover:bg-sky-50 transition-all" title="Duplicate">⧉</button>
                                    {idx > 0 && <button onClick={e => { e.stopPropagation(); moveStep(step.id, 'up'); }} className="w-7 h-7 rounded-lg flex items-center justify-center text-xs text-gray-400 hover:text-sky-500 hover:bg-sky-50 transition-all" title="Up">▲</button>}
                                    {idx < testSteps.length - 1 && <button onClick={e => { e.stopPropagation(); moveStep(step.id, 'down'); }} className="w-7 h-7 rounded-lg flex items-center justify-center text-xs text-gray-400 hover:text-sky-500 hover:bg-sky-50 transition-all" title="Down">▼</button>}
                                    <button onClick={e => { e.stopPropagation(); removeStep(step.id); }} className="w-7 h-7 rounded-lg flex items-center justify-center text-xs text-gray-400 hover:text-red-500 hover:bg-red-50 transition-all" title="Remove">🗑</button>
                                  </div>
                                </div>
                              ))}
                            </div>
                          )}
                        </div>
                      </div>

                      {/* Properties Panel */}
                      <div className="bg-gray-50/40 overflow-y-auto">
                        {selectedStep ? (() => {
                          const step = testSteps.find(s => s.id === selectedStep);
                          return step ? (
                            <div className="flex flex-col">
                              <div className="flex items-center gap-2.5 px-6 py-5 border-b border-gray-100 sticky top-0 bg-gray-50/80 backdrop-blur-sm z-10">
                                <span className="text-lg">{step.icon}</span>
                                <span className="text-[15px] font-bold text-gray-800">{step.label}</span>
                                <button onClick={() => removeStep(step.id)} className="ml-auto text-gray-400 hover:text-red-500 transition-colors" title="Delete">🗑</button>
                              </div>
                              {Object.entries(step.params || {}).map(([paramKey, paramValue]) => {
                                const meta = step.paramMeta?.[paramKey] || { type: 'text', placeholder: paramKey };
                                return (
                                  <div key={paramKey} className="flex flex-col gap-1.5 px-6 mt-4">
                                    <label className="text-[13px] font-semibold text-gray-700">{paramKey.replace(/([A-Z])/g, ' $1').replace(/^./, s => s.toUpperCase())}</label>
                                    {meta.type === 'select' ? (
                                      <select value={paramValue || ''} onChange={e => updateStepParam(selectedStep, paramKey, e.target.value)}
                                        className="w-full bg-white border border-gray-200 rounded-xl px-3.5 py-2.5 text-[13px] text-gray-700 outline-none focus:border-sky-400 focus:ring-2 focus:ring-sky-100 transition-all">
                                        <option value="">{meta.placeholder || `Select ${paramKey}`}</option>
                                        {meta.options.map(opt => <option key={opt} value={opt}>{opt}</option>)}
                                      </select>
                                    ) : (
                                      <div className="flex gap-1.5">
                                        <input type="text" value={paramValue || ''} onChange={e => updateStepParam(selectedStep, paramKey, e.target.value)} placeholder={meta.placeholder || paramKey}
                                          className="flex-1 bg-white border border-gray-200 rounded-xl px-3.5 py-2.5 text-[13px] text-gray-700 outline-none focus:border-sky-400 focus:ring-2 focus:ring-sky-100 transition-all" />
                                        {(paramKey === 'locator' || paramKey === 'value') && (
                                          <button onClick={() => openExpressionEditor(step.id, paramKey)} className="w-9 h-10 border border-gray-200 rounded-xl bg-white text-[11px] font-bold font-mono text-gray-400 hover:border-sky-300 hover:text-sky-500 transition-all flex-shrink-0">fx</button>
                                        )}
                                      </div>
                                    )}
                                  </div>
                                );
                              })}
                              <div className="h-px bg-gray-200 mx-6 my-5" />
                              <div className="text-xs font-bold uppercase tracking-wider text-gray-400 px-6 mb-2">Configuration</div>
                              <div className="flex flex-col gap-1.5 px-6 mt-2"><label className="text-[13px] font-semibold text-gray-700">Timeout (seconds)</label><input type="number" value={step.config?.timeout || 30} onChange={e => updateStepConfig(selectedStep, 'timeout', parseInt(e.target.value) || 0)} min={0} className="w-full bg-white border border-gray-200 rounded-xl px-3.5 py-2.5 text-[13px] text-gray-700 outline-none focus:border-sky-400 focus:ring-2 focus:ring-sky-100 transition-all" /></div>
                              <div className="flex flex-col gap-1.5 px-6 mt-4"><label className="text-[13px] font-semibold text-gray-700">Retries</label><input type="number" value={step.config?.retries || 0} onChange={e => updateStepConfig(selectedStep, 'retries', parseInt(e.target.value) || 0)} min={0} max={5} className="w-full bg-white border border-gray-200 rounded-xl px-3.5 py-2.5 text-[13px] text-gray-700 outline-none focus:border-sky-400 focus:ring-2 focus:ring-sky-100 transition-all" /></div>
                              <div className="flex flex-col gap-1.5 px-6 mt-4"><label className="text-[13px] font-semibold text-gray-700">Error Handling</label><select value={step.config?.errorHandling || 'STOP_ON_ERROR'} onChange={e => updateStepConfig(selectedStep, 'errorHandling', e.target.value)} className="w-full bg-white border border-gray-200 rounded-xl px-3.5 py-2.5 text-[13px] text-gray-700 outline-none focus:border-sky-400 focus:ring-2 focus:ring-sky-100 transition-all">{ERROR_HANDLING_OPTIONS.map(opt => <option key={opt} value={opt}>{opt}</option>)}</select></div>
                              <div className="flex flex-col gap-1.5 px-6 mt-4"><label className="text-[13px] font-semibold text-gray-700">Description</label><textarea value={step.config?.description || ''} onChange={e => updateStepConfig(selectedStep, 'description', e.target.value)} placeholder="Step description (optional)" rows={2} className="w-full bg-white border border-gray-200 rounded-xl px-3.5 py-2.5 text-[13px] text-gray-700 outline-none focus:border-sky-400 focus:ring-2 focus:ring-sky-100 transition-all resize-y" /></div>
                              {stepGroups.length > 0 && <div className="flex flex-col gap-1.5 px-6 mt-4"><label className="text-[13px] font-semibold text-gray-700">Step Group</label><select value={step.config?.group || ''} onChange={e => assignStepToGroup(selectedStep, e.target.value)} className="w-full bg-white border border-gray-200 rounded-xl px-3.5 py-2.5 text-[13px] text-gray-700 outline-none focus:border-sky-400 focus:ring-2 focus:ring-sky-100 transition-all"><option value="">No group</option>{stepGroups.map(g => <option key={g.id} value={g.id}>{g.name}</option>)}</select></div>}
                              <div className="h-px bg-gray-200 mx-6 my-5" />
                              <div className="flex gap-2 px-6 pb-6">
                                <button onClick={() => duplicateStep(step.id)} className="flex-1 py-2.5 border border-gray-200 rounded-xl bg-white text-xs text-gray-500 hover:border-sky-300 hover:text-sky-500 transition-all">⧉ Duplicate</button>
                                <button onClick={() => removeStep(step.id)} className="flex-1 py-2.5 border border-gray-200 rounded-xl bg-white text-xs text-gray-500 hover:border-red-300 hover:text-red-500 transition-all">🗑 Delete</button>
                              </div>
                            </div>
                          ) : null;
                        })() : (
                          <div className="flex flex-col items-center justify-center h-48 text-gray-400 gap-2 text-sm">
                            <div className="text-4xl opacity-30">📋</div>
                            <div>Select a step to edit properties</div>
                          </div>
                        )}
                      </div>
                    </div>

                    {/* Footer */}
                    <div className="px-6 py-3.5 border-t border-gray-100 bg-gray-50/40 flex items-center justify-between">
                      <div>{error && <span className="text-xs text-red-500">⚠ {error}</span>}</div>
                      <div className="flex items-center gap-2">
                        <button onClick={saveTestBuilderCase} disabled={submitting} className="px-5 py-2 rounded-xl text-[13px] font-semibold text-white bg-emerald-500 hover:bg-emerald-600 transition-all shadow-sm shadow-emerald-200 disabled:opacity-50">💾 Save</button>
                        <button className="px-4 py-2 rounded-xl text-[13px] font-semibold text-gray-600 border border-gray-200 hover:border-sky-300 hover:text-sky-500 transition-all">▶ Run</button>
                        <span className="text-xs text-gray-400 cursor-pointer hover:text-sky-500 transition-colors ml-2">📖 User Guide</span>
                      </div>
                    </div>
                    {error && <div className="text-xs text-red-500 bg-red-50 px-5 py-3 border-l-[3px] border-red-500">⚠ {error}</div>}
                  </div>
                )}
              </>
            )}

            {/* ═══ Suites / Plans / Results (empty states) ═══ */}
            {activeNav === 'suites' && <EmptyCard title="📦 Test Suites" count={testSuites.length} emptyIcon="📦" emptyText="Create test suites by grouping test cases" btnText="+ Create your first test suite" onNew={() => setShowTestSuiteModal(true)} />}
            {activeNav === 'plans' && <EmptyCard title="🗓️ Test Plans" count={testPlans.length} emptyIcon="🗓️" emptyText="Schedule and automate your test execution" btnText="+ Create your first test plan" onNew={() => setShowTestPlanModal(true)} />}
            {activeNav === 'results' && <EmptyCard title="✓ Results" count={results.length} emptyIcon="✓" emptyText="Test execution results will appear here" />}

            {/* ═══ Credentials Section ═══ */}
            {activeNav === 'credentials' && (
              <div className="bg-white rounded-2xl border border-gray-100 shadow-sm overflow-hidden">
                <div className="flex items-center justify-between px-7 py-5 border-b border-gray-100">
                  <div className="flex items-center gap-3">
                    <span className="text-lg font-bold text-gray-800">🔑 Credentials</span>
                    <span className="bg-sky-50 text-sky-600 text-xs font-bold px-3 py-1 rounded-full">{credentials.length}</span>
                  </div>
                  {credentials.length > 0 && !showCredForm && (
                    <button onClick={() => { setEditingCred(null); setCredForm({ accountName: '', profile: '', userEmail: '', portalId: '', clientId: '', clientSecret: '', refreshToken: '' }); setShowCredForm(true); setError(''); }}
                      className="bg-sky-500 text-white px-5 py-2.5 rounded-xl text-[13px] font-semibold hover:bg-sky-600 transition-all shadow-sm shadow-sky-200">+ Add</button>
                  )}
                </div>
                {showCredForm ? (
                  <div className="p-7">
                    <div className="text-lg font-bold text-gray-800 mb-6">{editingCred ? 'Edit Credential' : 'Add New Credential'}</div>
                    <div className="grid grid-cols-2 gap-4">
                      {[
                        { key: 'accountName', label: 'Account Name *', placeholder: 'e.g., Production HubSpot', span: true },
                        { key: 'profile', label: 'Profile', placeholder: 'e.g., Admin' },
                        { key: 'userEmail', label: 'User Email', placeholder: 'e.g., user@company.com' },
                        { key: 'portalId', label: 'Portal ID', placeholder: 'e.g., 12345678' },
                        { key: 'clientId', label: 'Client ID', placeholder: 'Client ID' },
                        { key: 'clientSecret', label: 'Client Secret', placeholder: 'Client Secret', type: 'password' },
                        { key: 'refreshToken', label: 'Refresh Token', placeholder: 'Refresh Token', type: 'password' },
                      ].map(({ key, label, placeholder, type, span }) => (
                        <div key={key} className={`flex flex-col gap-1.5 ${span ? 'col-span-2' : ''}`}>
                          <label className="text-xs font-semibold text-gray-400 uppercase tracking-wider">{label}</label>
                          <input type={type || 'text'} value={credForm[key]} placeholder={placeholder} onChange={e => setCredForm(f => ({ ...f, [key]: e.target.value }))}
                            className="bg-white border border-gray-200 rounded-xl px-4 py-3 text-[13px] text-gray-700 outline-none focus:border-sky-400 focus:ring-2 focus:ring-sky-100 transition-all" />
                        </div>
                      ))}
                    </div>
                    {error && <div className="text-xs text-red-500 bg-red-50 px-4 py-3 rounded-xl border-l-[3px] border-red-500 mt-4">⚠ {error}</div>}
                    <div className="flex gap-2.5 mt-6">
                      <button onClick={saveCred} disabled={submitting} className="bg-sky-500 text-white px-6 py-3 rounded-xl text-sm font-bold hover:bg-sky-600 transition-all shadow-sm shadow-sky-200 disabled:opacity-50">{submitting ? 'SAVING…' : editingCred ? '✓ UPDATE' : '✓ ADD'}</button>
                      <button onClick={() => { setShowCredForm(false); setEditingCred(null); setError(''); }}
                        className="px-5 py-3 rounded-xl text-sm font-semibold text-gray-400 border border-gray-200 hover:border-red-300 hover:text-red-500 transition-all">✕ CANCEL</button>
                    </div>
                  </div>
                ) : credentials.length === 0 ? (
                  <div className="flex flex-col items-center justify-center py-16 text-gray-400">
                    <div className="text-4xl opacity-30 mb-3">🔑</div>
                    <div className="text-sm">No credentials saved yet</div>
                    <button onClick={() => { setEditingCred(null); setCredForm({ accountName: '', profile: '', userEmail: '', portalId: '', clientId: '', clientSecret: '', refreshToken: '' }); setShowCredForm(true); setError(''); }}
                      className="mt-4 bg-sky-500 text-white px-6 py-2.5 rounded-xl text-[13px] font-semibold hover:bg-sky-600 transition-all shadow-sm shadow-sky-200">+ Add Credentials</button>
                  </div>
                ) : (
                  <div className="overflow-y-auto max-h-[420px]">
                    <table className="w-full">
                      <thead><tr className="bg-gray-50/60 border-b border-gray-100">{['ACCOUNT NAME','PROFILE','EMAIL','PORTAL ID','CREATED','ACTION'].map(h=><th key={h} className="text-left px-5 py-3 text-[11px] font-bold uppercase tracking-wider text-gray-400">{h}</th>)}</tr></thead>
                      <tbody>
                        {credentials.map(cred => (
                          <tr key={cred.id} className="border-b border-gray-50 hover:bg-sky-50/50 transition-colors">
                            <td className="px-5 py-3.5"><span className="font-mono text-[13px] font-semibold text-gray-700">{cred.accountName}</span></td>
                            <td className="px-5 py-3.5"><span className="text-xs font-semibold px-3 py-1 rounded-lg bg-sky-50 text-sky-600">{cred.profile || '—'}</span></td>
                            <td className="px-5 py-3.5"><span className="text-[13px] text-gray-400">{cred.userEmail || '—'}</span></td>
                            <td className="px-5 py-3.5"><span className="text-xs font-semibold px-3 py-1 rounded-lg bg-sky-50 text-sky-600">{cred.portalId || '—'}</span></td>
                            <td className="px-5 py-3.5"><span className="text-[13px] text-gray-400">{timeAgo(cred.createdAt)}</span></td>
                            <td className="px-5 py-3.5">
                              <div className="flex gap-1.5">
                                <button onClick={() => { setEditingCred(cred); setCredForm({ accountName: cred.accountName || '', profile: cred.profile || '', userEmail: cred.userEmail || '', portalId: cred.portalId || '', clientId: cred.clientId || '', clientSecret: cred.clientSecret || '', refreshToken: cred.refreshToken || '' }); setShowCredForm(true); setError(''); }}
                                  className="w-8 h-8 rounded-lg border border-gray-200 bg-white flex items-center justify-center text-xs text-gray-400 hover:border-sky-300 hover:text-sky-500 transition-all" title="Edit">✏️</button>
                                <button onClick={() => { if (confirm('Delete credential "' + cred.accountName + '"?')) deleteCred(cred.id); }}
                                  className="w-8 h-8 rounded-lg border border-gray-200 bg-white flex items-center justify-center text-xs text-gray-400 hover:border-red-300 hover:text-red-500 transition-all" title="Delete">🗑️</button>
                              </div>
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                )}
              </div>
            )}

            {/* ═══ Environments Section ═══ */}
            {activeNav === 'environments' && (
              <div className="bg-white rounded-2xl border border-gray-100 shadow-sm overflow-hidden">
                <div className="flex items-center justify-between px-7 py-5 border-b border-gray-100">
                  <div className="flex items-center gap-3">
                    <span className="text-lg font-bold text-gray-800">🌐 Environments</span>
                    <span className="bg-sky-50 text-sky-600 text-xs font-bold px-3 py-1 rounded-full">{environments.length}</span>
                  </div>
                  {environments.length > 0 && !showEnvForm && (
                    <button onClick={() => { setEditingEnv(null); setEnvForm({ name: '', url: '', description: '' }); setShowEnvForm(true); setError(''); }}
                      className="bg-sky-500 text-white px-5 py-2.5 rounded-xl text-[13px] font-semibold hover:bg-sky-600 transition-all shadow-sm shadow-sky-200">+ Add</button>
                  )}
                </div>
                {showEnvForm ? (
                  <div className="p-7">
                    <div className="text-lg font-bold text-gray-800 mb-6">{editingEnv ? 'Edit Environment' : 'Add New Environment'}</div>
                    <div className="flex flex-col gap-4">
                      <div className="flex flex-col gap-1.5">
                        <label className="text-xs font-semibold text-gray-400 uppercase tracking-wider">Name *</label>
                        <input type="text" value={envForm.name} placeholder="e.g., Production, Staging, QA" onChange={e => setEnvForm(f => ({ ...f, name: e.target.value }))}
                          className="bg-white border border-gray-200 rounded-xl px-4 py-3 text-[13px] text-gray-700 outline-none focus:border-sky-400 focus:ring-2 focus:ring-sky-100 transition-all" />
                      </div>
                      <div className="flex flex-col gap-1.5">
                        <label className="text-xs font-semibold text-gray-400 uppercase tracking-wider">URL</label>
                        <input type="text" value={envForm.url} placeholder="e.g., https://staging.example.com" onChange={e => setEnvForm(f => ({ ...f, url: e.target.value }))}
                          className="bg-white border border-gray-200 rounded-xl px-4 py-3 text-[13px] text-gray-700 outline-none focus:border-sky-400 focus:ring-2 focus:ring-sky-100 transition-all" />
                      </div>
                      <div className="flex flex-col gap-1.5">
                        <label className="text-xs font-semibold text-gray-400 uppercase tracking-wider">Description</label>
                        <input type="text" value={envForm.description} placeholder="Brief description" onChange={e => setEnvForm(f => ({ ...f, description: e.target.value }))}
                          className="bg-white border border-gray-200 rounded-xl px-4 py-3 text-[13px] text-gray-700 outline-none focus:border-sky-400 focus:ring-2 focus:ring-sky-100 transition-all" />
                      </div>
                    </div>
                    {error && <div className="text-xs text-red-500 bg-red-50 px-4 py-3 rounded-xl border-l-[3px] border-red-500 mt-4">⚠ {error}</div>}
                    <div className="flex gap-2.5 mt-6">
                      <button onClick={saveEnv} disabled={submitting} className="bg-sky-500 text-white px-6 py-3 rounded-xl text-sm font-bold hover:bg-sky-600 transition-all shadow-sm shadow-sky-200 disabled:opacity-50">{submitting ? 'SAVING…' : editingEnv ? '✓ UPDATE' : '✓ ADD'}</button>
                      <button onClick={() => { setShowEnvForm(false); setEditingEnv(null); setError(''); }}
                        className="px-5 py-3 rounded-xl text-sm font-semibold text-gray-400 border border-gray-200 hover:border-red-300 hover:text-red-500 transition-all">✕ CANCEL</button>
                    </div>
                  </div>
                ) : environments.length === 0 ? (
                  <div className="flex flex-col items-center justify-center py-16 text-gray-400">
                    <div className="text-4xl opacity-30 mb-3">🌐</div>
                    <div className="text-sm">No environments added yet</div>
                    <button onClick={() => { setEditingEnv(null); setEnvForm({ name: '', url: '', description: '' }); setShowEnvForm(true); setError(''); }}
                      className="mt-4 bg-sky-500 text-white px-6 py-2.5 rounded-xl text-[13px] font-semibold hover:bg-sky-600 transition-all shadow-sm shadow-sky-200">+ Add Environment</button>
                  </div>
                ) : (
                  <div className="overflow-y-auto max-h-[420px]">
                    <table className="w-full">
                      <thead><tr className="bg-gray-50/60 border-b border-gray-100">{['NAME','URL','DESCRIPTION','CREATED','ACTION'].map(h=><th key={h} className="text-left px-5 py-3 text-[11px] font-bold uppercase tracking-wider text-gray-400">{h}</th>)}</tr></thead>
                      <tbody>
                        {environments.map(env => (
                          <tr key={env.id} className="border-b border-gray-50 hover:bg-sky-50/50 transition-colors cursor-pointer"
                            onClick={() => { setEditingEnv(env); setEnvForm({ name: env.name || '', url: env.url || '', description: env.description || '' }); setShowEnvForm(true); setError(''); }}>
                            <td className="px-5 py-3.5"><span className="font-mono text-[13px] font-semibold text-gray-700">{env.name}</span></td>
                            <td className="px-5 py-3.5"><span className="text-[13px] text-gray-400">{env.url || '—'}</span></td>
                            <td className="px-5 py-3.5"><span className="text-[13px] text-gray-400">{env.description || '—'}</span></td>
                            <td className="px-5 py-3.5"><span className="text-[13px] text-gray-400">{timeAgo(env.createdAt)}</span></td>
                            <td className="px-5 py-3.5" onClick={e => e.stopPropagation()}>
                              <div className="flex gap-1.5">
                                <button onClick={() => { setEditingEnv(env); setEnvForm({ name: env.name || '', url: env.url || '', description: env.description || '' }); setShowEnvForm(true); setError(''); }}
                                  className="w-8 h-8 rounded-lg border border-gray-200 bg-white flex items-center justify-center text-xs text-gray-400 hover:border-sky-300 hover:text-sky-500 transition-all" title="Edit">✏️</button>
                                <button onClick={() => { if (confirm('Delete environment "' + env.name + '"?')) deleteEnv(env.id); }}
                                  className="w-8 h-8 rounded-lg border border-gray-200 bg-white flex items-center justify-center text-xs text-gray-400 hover:border-red-300 hover:text-red-500 transition-all" title="Delete">🗑️</button>
                              </div>
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                )}
              </div>
            )}

            {/* ═══ Activity Log ═══ */}
            {activeNav === 'activity' && (
              <div className="bg-white rounded-2xl border border-gray-100 shadow-sm overflow-hidden">
                <div className="flex items-center justify-between px-6 py-4 border-b border-gray-100 bg-gray-50/40">
                  <span className="text-[15px] font-bold text-gray-800">📡 Activity Log</span>
                  <span className="text-xs text-gray-400 bg-gray-100 px-3 py-1 rounded-full">{log.length} events</span>
                </div>
                <div className="h-60 overflow-y-auto px-5 py-4">
                  {log.length === 0 ? (
                    <div className="text-sm text-gray-400 text-center py-8">Waiting for activity…</div>
                  ) : (
                    [...log].reverse().map((e, i) => (
                      <div key={i} className="text-[13px] leading-8 flex gap-3.5">
                        <span className="text-gray-400 flex-shrink-0 font-mono text-[11px]">{e.ts}</span>
                        <span className={e.type === 'success' ? 'text-emerald-600' : e.type === 'error' ? 'text-red-500' : e.type === 'warn' ? 'text-amber-500' : 'text-gray-700'}>{e.msg}</span>
                      </div>
                    ))
                  )}
                </div>
              </div>
            )}
          </div>
        </div>
      </div>

      {/* ── Modals ── */}
      {showLaunchModal && <Modal title="⚡ Launch New Job" onClose={() => setShowLaunchModal(false)}>
        <div className="flex flex-col gap-1.5"><label className="text-xs font-semibold text-gray-400 uppercase tracking-wider">Job Type</label><select value={form.type} onChange={e => setForm(f => ({ ...f, type: e.target.value }))} className="bg-white border border-gray-200 rounded-xl px-4 py-3 text-[13px] text-gray-700 font-mono outline-none focus:border-sky-400 focus:ring-2 focus:ring-sky-100">{JOB_TYPES.map(t => <option key={t}>{t}</option>)}</select></div>
        <div className="flex flex-col gap-1.5"><label className="text-xs font-semibold text-gray-400 uppercase tracking-wider">Payload (JSON)</label><textarea value={form.payload} onChange={e => setForm(f => ({ ...f, payload: e.target.value }))} spellCheck={false} className="bg-white border border-gray-200 rounded-xl px-4 py-3 text-[13px] text-gray-700 font-mono outline-none focus:border-sky-400 focus:ring-2 focus:ring-sky-100 min-h-[110px] resize-y" /></div>
        {error && <div className="text-xs text-red-500 bg-red-50 px-4 py-3 rounded-xl border-l-[3px] border-red-500">⚠ {error}</div>}
        <button onClick={runJob} disabled={submitting} className="w-full bg-sky-500 text-white py-3.5 rounded-xl text-sm font-bold hover:bg-sky-600 transition-all shadow-sm shadow-sky-200 disabled:opacity-50">{submitting ? 'QUEUING…' : '▶ RUN JOB'}</button>
      </Modal>}

      {showTestCaseModal && <Modal title="📝 New Test Case" onClose={() => setShowTestCaseModal(false)}>
        <div className="flex flex-col gap-1.5"><label className="text-xs font-semibold text-gray-400 uppercase tracking-wider">Test Case Name *</label><input type="text" value={testCaseForm.name} placeholder="e.g., User Login Flow" onChange={e => setTestCaseForm(f => ({ ...f, name: e.target.value }))} className="bg-white border border-gray-200 rounded-xl px-4 py-3 text-[13px] text-gray-700 outline-none focus:border-sky-400 focus:ring-2 focus:ring-sky-100" /></div>
        <div className="flex flex-col gap-1.5"><label className="text-xs font-semibold text-gray-400 uppercase tracking-wider">Type *</label><select value={testCaseForm.type} onChange={e => setTestCaseForm(f => ({ ...f, type: e.target.value }))} className="bg-white border border-gray-200 rounded-xl px-4 py-3 text-[13px] text-gray-700 outline-none focus:border-sky-400 focus:ring-2 focus:ring-sky-100"><option value="UI">UI Automation</option><option value="API">API Test</option><option value="E2E">E2E Test</option></select></div>
        <div className="flex flex-col gap-1.5"><label className="text-xs font-semibold text-gray-400 uppercase tracking-wider">Framework</label><input type="text" value={testCaseForm.framework} placeholder="e.g., Selenium, Playwright" onChange={e => setTestCaseForm(f => ({ ...f, framework: e.target.value }))} className="bg-white border border-gray-200 rounded-xl px-4 py-3 text-[13px] text-gray-700 outline-none focus:border-sky-400 focus:ring-2 focus:ring-sky-100" /></div>
        <div className="flex flex-col gap-1.5"><label className="text-xs font-semibold text-gray-400 uppercase tracking-wider">Description</label><input type="text" value={testCaseForm.description} placeholder="Brief description" onChange={e => setTestCaseForm(f => ({ ...f, description: e.target.value }))} className="bg-white border border-gray-200 rounded-xl px-4 py-3 text-[13px] text-gray-700 outline-none focus:border-sky-400 focus:ring-2 focus:ring-sky-100" /></div>
        {error && <div className="text-xs text-red-500 bg-red-50 px-4 py-3 rounded-xl border-l-[3px] border-red-500">⚠ {error}</div>}
        <button onClick={createTestCase} disabled={submitting} className="w-full bg-sky-500 text-white py-3.5 rounded-xl text-sm font-bold hover:bg-sky-600 transition-all shadow-sm shadow-sky-200 disabled:opacity-50">{submitting ? 'CREATING…' : '✓ CREATE TEST CASE'}</button>
      </Modal>}

      {showVersionHistory && <Modal title="🕐 Version History" onClose={() => setShowVersionHistory(false)}>
        {testCaseVersions.length === 0 ? (
          <div className="text-center py-8 text-gray-400"><div className="text-4xl opacity-30 mb-3">🕐</div><div className="text-sm">No versions saved yet</div><div className="text-xs mt-1 text-gray-300">Versions are created each time you save</div></div>
        ) : (
          <div className="flex flex-col gap-2 max-h-[360px] overflow-y-auto">
            {[...testCaseVersions].reverse().map(v => (
              <div key={v.id} className="flex items-center justify-between p-4 bg-white border border-gray-200 rounded-xl hover:border-sky-300 hover:bg-sky-50/50 transition-all">
                <div><div className="text-sm font-semibold text-gray-700">Version {v.version}</div><div className="text-xs text-gray-400">{v.steps.length} steps • {new Date(v.savedAt).toLocaleString()}</div></div>
                <button onClick={() => restoreVersion(v.id)} className="text-xs text-gray-500 border border-gray-200 rounded-xl px-4 py-2 hover:border-sky-300 hover:text-sky-500 transition-all">Restore</button>
              </div>
            ))}
          </div>
        )}
      </Modal>}

      {showRunConfigModal && <Modal title="⚙️ Run Configuration" onClose={() => { setShowRunConfigModal(false); setRunConfigTarget(null); }}>
        <div className="flex flex-col gap-1.5">
          <label className="text-xs font-semibold text-gray-400 uppercase tracking-wider">Browser</label>
          <select value={runConfig.browser} onChange={e => setRunConfig(c => ({ ...c, browser: e.target.value }))} className="bg-white border border-gray-200 rounded-xl px-4 py-3 text-[13px] text-gray-700 outline-none focus:border-sky-400 focus:ring-2 focus:ring-sky-100">
            <option value="chromium">Chrome</option>
            <option value="firefox">Firefox</option>
            <option value="msedge">Edge</option>
          </select>
        </div>
        <div className="flex flex-col gap-1.5">
          <label className="text-xs font-semibold text-gray-400 uppercase tracking-wider">Server</label>
          <div className="flex gap-6 mt-1">
            <label className="flex items-center gap-2 cursor-pointer text-[13px] font-medium text-gray-700">
              <input type="radio" name="rcServer" value="local" checked={runConfig.server === 'local'} onChange={e => setRunConfig(c => ({ ...c, server: e.target.value }))} className="accent-sky-500" /> Local
            </label>
            <label className="flex items-center gap-2 cursor-pointer text-[13px] font-medium text-gray-700">
              <input type="radio" name="rcServer" value="pre" checked={runConfig.server === 'pre'} onChange={e => setRunConfig(c => ({ ...c, server: e.target.value }))} className="accent-sky-500" /> Pre
            </label>
          </div>
        </div>
        <div className="flex flex-col gap-1.5">
          <label className="text-xs font-semibold text-gray-400 uppercase tracking-wider">Environment</label>
          <select value={runConfig.environment} onChange={e => setRunConfig(c => ({ ...c, environment: e.target.value }))} className="bg-white border border-gray-200 rounded-xl px-4 py-3 text-[13px] text-gray-700 outline-none focus:border-sky-400 focus:ring-2 focus:ring-sky-100">
            <option value="">— Select Environment —</option>
            {environments.map(env => <option key={env.id} value={env.name}>{env.name}</option>)}
          </select>
        </div>
        <div className="flex gap-3 justify-end">
          <button onClick={() => { setShowRunConfigModal(false); setRunConfigTarget(null); }} className="px-5 py-2.5 rounded-xl text-[13px] font-semibold text-gray-500 border border-gray-200 hover:border-gray-300 transition-all">Cancel</button>
          <button onClick={executeWithConfig} className="px-5 py-2.5 rounded-xl text-[13px] font-semibold text-white bg-sky-500 hover:bg-sky-600 transition-all shadow-sm shadow-sky-200">▶ Run</button>
        </div>
      </Modal>}

      {showExpressionEditor && <Modal title="Set Expression" onClose={() => setShowExpressionEditor(false)} wide>
        <textarea value={expressionValue} onChange={e => setExpressionValue(e.target.value)} placeholder="Enter expression..." rows={4}
          className="w-full bg-white border-2 border-sky-400 rounded-xl px-4 py-3.5 text-[13px] text-gray-700 font-mono outline-none ring-2 ring-sky-100 min-h-[80px] resize-y" />
        <div className="flex border-b border-gray-200 mt-1">
          {['variables', 'functions', 'files'].map(tab => (
            <button key={tab} onClick={() => setExpressionTab(tab)}
              className={`px-4 py-2.5 text-[13px] font-medium border-b-2 transition-all ${expressionTab === tab ? 'border-sky-500 text-sky-600 font-semibold' : 'border-transparent text-gray-400 hover:text-gray-600'}`}>
              {tab.charAt(0).toUpperCase() + tab.slice(1)}
            </button>
          ))}
        </div>
        <div className="flex items-center gap-2.5 px-4 py-2.5 border border-gray-200 rounded-xl mt-3 bg-white"><span>🔍</span><input type="text" placeholder="Search" className="flex-1 border-none outline-none text-[13px] text-gray-700 bg-transparent" /><span className="text-gray-400">⧉</span></div>
        <div className="mt-4"><div className="text-sm font-bold text-gray-700 pb-2 border-b border-gray-200">Local Variables</div><div className="text-center text-gray-400 text-[13px] py-4">No data available</div></div>
        <div className="mt-4"><div className="text-sm font-bold text-gray-700 pb-2 border-b border-gray-200">Global Variables</div><div className="text-center text-gray-400 text-[13px] py-4">No data available</div></div>
        <button onClick={applyExpression} className="bg-sky-500 text-white px-6 py-2.5 rounded-xl text-[13px] font-semibold hover:bg-sky-600 transition-all shadow-sm shadow-sky-200">Done</button>
      </Modal>}
    </>
  );
}

// ── Reusable Components ─────────────────────────────────────

function Modal({ title, onClose, children, wide }) {
  return (
    <div className="fixed inset-0 bg-gray-900/20 backdrop-blur-sm z-50 flex items-center justify-center p-6 animate-[fadeIn_0.15s_ease]" onClick={onClose} role="dialog" aria-modal="true">
      <div className={`bg-white rounded-2xl border border-gray-100 shadow-xl ${wide ? 'max-w-[520px]' : 'max-w-[480px]'} w-full animate-[modalIn_0.25s_ease] overflow-hidden`} onClick={e => e.stopPropagation()}>
        <div className="flex items-center justify-between px-7 py-5 border-b border-gray-100 bg-gray-50/40">
          <span className="text-lg font-bold text-gray-800">{title}</span>
          <button onClick={onClose} className="w-8 h-8 rounded-lg border border-gray-200 bg-white flex items-center justify-center text-xs text-gray-400 hover:border-red-300 hover:text-red-500 transition-all">✕</button>
        </div>
        <div className="px-7 py-6 flex flex-col gap-5">{children}</div>
      </div>
    </div>
  );
}

function EmptyCard({ title, count, emptyIcon, emptyText, btnText, onNew }) {
  return (
    <div className="bg-white rounded-2xl border border-gray-100 shadow-sm overflow-hidden">
      <div className="flex items-center justify-between px-7 py-5 border-b border-gray-100">
        <div className="flex items-center gap-3">
          <span className="text-lg font-bold text-gray-800">{title}</span>
          <span className="bg-sky-50 text-sky-600 text-xs font-bold px-3 py-1 rounded-full">{count}</span>
        </div>
        {onNew && <button onClick={onNew} className="bg-sky-500 text-white px-5 py-2.5 rounded-xl text-[13px] font-semibold hover:bg-sky-600 transition-all shadow-sm shadow-sky-200">+ New</button>}
      </div>
      <div className="flex flex-col items-center justify-center py-16 text-gray-400">
        <div className="text-4xl opacity-30 mb-3">{emptyIcon}</div>
        <div className="text-sm">{emptyText}</div>
        {btnText && onNew && <button onClick={onNew} className="mt-4 bg-sky-500 text-white px-6 py-2.5 rounded-xl text-[13px] font-semibold hover:bg-sky-600 transition-all shadow-sm shadow-sky-200">{btnText}</button>}
      </div>
    </div>
  );
}
