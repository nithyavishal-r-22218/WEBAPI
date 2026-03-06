import { useState, useEffect, useCallback, useMemo, useRef } from 'react';
import Head from 'next/head';
import styles from '../styles/godmode.module.css';

const API = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:4000';

const JOB_TYPES = ['SCRAPE', 'AUTOMATE', 'SCHEDULE', 'CUSTOM'];

const STATUS_COLOR = {
  QUEUED:  '#f59e0b',
  RUNNING: '#3b82f6',
  DONE:    '#10b981',
  FAILED:  '#ef4444',
};

const STATUS_ICON = { QUEUED: '⏳', RUNNING: '⚡', DONE: '✓', FAILED: '✗' };

// ── Theme System ──────────────────────────────────────────────
const THEMES = {
  default: {
    name: 'Default',
    primary: '#3D52A0',
    bg: '#f5f5f7',
    surface: '#ffffff',
    secondary: '#7091E6',
    text: '#1a1a2e',
    textMuted: '#8697C4',
    border: '#ADBBDA',
    success: '#10b981',
    danger: '#ef4444',
    warning: '#f59e0b',
  },
  lavender: {
    name: 'Lavender',
    primary: '#3D52A0',
    bg: '#EDE8F5',
    surface: '#ffffff',
    secondary: '#7091E6',
    text: '#1a1a2e',
    textMuted: '#8697C4',
    border: '#ADBBDA',
    success: '#10b981',
    danger: '#ef4444',
    warning: '#f59e0b',
  },
  desert: {
    name: 'Desert',
    primary: '#E64833',
    bg: '#FBE9D0',
    surface: '#ffffff',
    secondary: '#244855',
    text: '#1a1a2e',
    textMuted: '#874F41',
    border: '#90AEAD',
    success: '#10b981',
    danger: '#ef4444',
    warning: '#f59e0b',
  },
  ocean: {
    name: 'Ocean',
    primary: '#024950',
    bg: '#AFDDE5',
    surface: '#ffffff',
    secondary: '#0FA4AF',
    text: '#003135',
    textMuted: '#003135',
    border: '#90C9CE',
    success: '#10b981',
    danger: '#964734',
    warning: '#f59e0b',
  },
  sunset: {
    name: 'Sunset',
    primary: '#E43D12',
    bg: '#EBE9E1',
    surface: '#ffffff',
    secondary: '#D6536D',
    text: '#1a1a2e',
    textMuted: '#874F41',
    border: '#FFA2B6',
    success: '#10b981',
    danger: '#ef4444',
    warning: '#EFB11D',
  },
};

const DEFAULT_CUSTOM_COLORS = {
  primary: '#3D52A0',
  bg: '#f5f5f7',
  surface: '#ffffff',
  secondary: '#7091E6',
  text: '#1a1a2e',
  border: '#ADBBDA',
};

function applyTheme(theme) {
  if (typeof document === 'undefined') return;
  const r = document.documentElement;
  r.style.setProperty('--bg', theme.bg);
  r.style.setProperty('--surface', theme.surface);
  r.style.setProperty('--primary', theme.primary);
  r.style.setProperty('--secondary', theme.secondary);
  r.style.setProperty('--text', theme.text);
  r.style.setProperty('--text-muted', theme.textMuted || '#8697C4');
  r.style.setProperty('--border', theme.border);
  r.style.setProperty('--success', theme.success || '#10b981');
  r.style.setProperty('--danger', theme.danger || '#ef4444');
  r.style.setProperty('--warning', theme.warning || '#f59e0b');
}

function buildCustomTheme(colors) {
  return {
    name: 'Custom',
    primary: colors.primary,
    bg: colors.bg,
    surface: colors.surface,
    secondary: colors.secondary,
    text: colors.text,
    textMuted: colors.text,
    border: colors.border,
    success: '#10b981',
    danger: '#ef4444',
    warning: '#f59e0b',
  };
}

// ── ThemeSwitcher Component ──────────────────────────────────
function ThemeSwitcher({ current, onChange }) {
  const [showCustom, setShowCustom] = useState(false);
  const [customColors, setCustomColors] = useState(DEFAULT_CUSTOM_COLORS);
  const panelRef = useRef(null);
  const btnRef = useRef(null);

  useEffect(() => {
    try {
      const saved = localStorage.getItem('webapi-custom-colors');
      if (saved) setCustomColors(JSON.parse(saved));
    } catch {}
  }, []);

  // Close picker when clicking outside
  useEffect(() => {
    if (!showCustom) return;
    function handleClickOutside(e) {
      if (
        panelRef.current && !panelRef.current.contains(e.target) &&
        btnRef.current && !btnRef.current.contains(e.target)
      ) {
        setShowCustom(false);
      }
    }
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, [showCustom]);

  function handlePresetClick(key) {
    setShowCustom(false);
    onChange(key);
  }

  function handleApplyCustom() {
    try { localStorage.setItem('webapi-custom-colors', JSON.stringify(customColors)); } catch {}
    onChange('custom', buildCustomTheme(customColors));
    setShowCustom(false);
  }

  function handleResetCustom() {
    setCustomColors(DEFAULT_CUSTOM_COLORS);
  }

  return (
    <div className={styles.themeSwitcher}>
      {Object.entries(THEMES).map(([key, theme]) => (
        <button
          key={key}
          className={`${styles.themeSwatch} ${current === key ? styles.themeSwatchActive : ''}`}
          style={{ background: theme.primary }}
          onClick={() => handlePresetClick(key)}
          title={theme.name}
          aria-label={`Switch to ${theme.name} theme`}
        />
      ))}
      <button
        ref={btnRef}
        className={`${styles.themeSwatch} ${styles.themeSwatchCustom} ${current === 'custom' ? styles.themeSwatchActive : ''}`}
        onClick={() => setShowCustom(v => !v)}
        title="Custom theme"
        aria-label="Open custom theme picker"
      >
        🎨
      </button>

      {showCustom && (
        <div ref={panelRef} className={styles.customPickerPanel} role="dialog" aria-label="Custom theme picker">
          <div className={styles.customPickerTitle}>Custom Theme</div>
          {[
            ['Background', 'bg'],
            ['Surface', 'surface'],
            ['Primary', 'primary'],
            ['Secondary', 'secondary'],
            ['Text', 'text'],
            ['Border', 'border'],
          ].map(([label, key]) => (
            <div key={key} className={styles.colorRow}>
              <span className={styles.colorLabel}>{label}</span>
              <input
                type="color"
                value={customColors[key]}
                onChange={e => setCustomColors(c => ({ ...c, [key]: e.target.value }))}
                className={styles.colorInput}
                aria-label={`${label} color`}
              />
              <span className={styles.colorHex}>{customColors[key]}</span>
            </div>
          ))}
          <div className={styles.customPickerActions}>
            <button className={styles.btnSecondary} onClick={handleResetCustom}>Reset</button>
            <button className={styles.btnPrimary} onClick={handleApplyCustom}>Apply</button>
          </div>
        </div>
      )}
    </div>
  );
}

// ── Helpers ──────────────────────────────────────────────────
function timeAgo(iso) {
  if (!iso) return '—';
  const diff = Date.now() - new Date(iso).getTime();
  if (diff < 60000) return `${Math.floor(diff / 1000)}s ago`;
  if (diff < 3600000) return `${Math.floor(diff / 60000)}m ago`;
  return `${Math.floor(diff / 3600000)}h ago`;
}

// ── Main Dashboard ────────────────────────────────────────────
export default function GodMode() {
  const [jobs, setJobs] = useState([]);
  const [health, setHealth] = useState(null);
  const [selected, setSelected] = useState(null);
  const [form, setForm] = useState({ type: 'SCRAPE', payload: '{\n  "url": "https://example.com"\n}' });
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState('');
  const [filter, setFilter] = useState('ALL');
  const [log, setLog] = useState([]);
  const [currentTheme, setCurrentTheme] = useState('default');

  // Load & apply saved theme on mount
  useEffect(() => {
    try {
      const savedKey = localStorage.getItem('webapi-theme') || 'default';
      setCurrentTheme(savedKey);
      if (savedKey === 'custom') {
        const savedColors = localStorage.getItem('webapi-custom-colors');
        if (savedColors) {
          applyTheme(buildCustomTheme(JSON.parse(savedColors)));
        } else {
          applyTheme(THEMES.default);
        }
      } else {
        applyTheme(THEMES[savedKey] || THEMES.default);
      }
    } catch {
      applyTheme(THEMES.default);
    }
  }, []);

  function handleThemeChange(key, customTheme) {
    setCurrentTheme(key);
    try { localStorage.setItem('webapi-theme', key); } catch {}
    applyTheme(customTheme || THEMES[key] || THEMES.default);
  }

  const addLog = (msg, type = 'info') => {
    setLog(prev => [...prev.slice(-49), { msg, type, ts: new Date().toLocaleTimeString() }]);
  };

  const fetchJobs = useCallback(async () => {
    try {
      const r = await fetch(`${API}/jobs`, {
        headers: { 'Content-Type': 'application/json' },
      });
      const d = await r.json();
      setJobs(d.jobs || []);
    } catch (err) {
      if (process.env.NODE_ENV === 'development') console.warn('fetchJobs failed:', err);
    }
  }, []);

  const fetchHealth = useCallback(async () => {
    try {
      const r = await fetch(`${API}/health`);
      const d = await r.json();
      setHealth(d);
    } catch {
      setHealth(null);
    }
  }, []);

  useEffect(() => {
    fetchJobs();
    fetchHealth();
    const t = setInterval(() => { fetchJobs(); fetchHealth(); }, 2000);
    return () => clearInterval(t);
  }, [fetchJobs, fetchHealth]);

  // Sync selected job with latest data when jobs refresh
  useEffect(() => {
    setSelected(prev => {
      if (!prev) return prev;
      const updated = jobs.find(j => j.id === prev.id);
      return updated || prev;
    });
  }, [jobs]);

  // Memoize status counts to avoid redundant filtering per render
  const statusCounts = useMemo(() => {
    const counts = { ALL: jobs.length, QUEUED: 0, RUNNING: 0, DONE: 0, FAILED: 0 };
    jobs.forEach(j => { if (counts[j.status] !== undefined) counts[j.status]++; });
    return counts;
  }, [jobs]);

  async function runJob() {
    setError('');
    let payload;
    try { payload = JSON.parse(form.payload); }
    catch { setError('Invalid JSON payload'); return; }

    setSubmitting(true);
    try {
      const r = await fetch(`${API}/run`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ type: form.type, payload }),
      });
      const d = await r.json();
      if (!r.ok) throw new Error(d.error);
      addLog(`Job ${d.jobId.slice(0, 8)}… queued [${form.type}]`, 'success');
      fetchJobs();
    } catch (e) {
      setError(e.message);
      addLog(e.message, 'error');
    }
    setSubmitting(false);
  }

  async function cancelJob(id) {
    try {
      await fetch(`${API}/jobs/${id}`, { method: 'DELETE', headers: { 'Content-Type': 'application/json' } });
      addLog(`Job ${id.slice(0, 8)}… cancelled`, 'warn');
      fetchJobs();
    } catch (e) { addLog(e.message, 'error'); }
  }

  const filtered = filter === 'ALL' ? jobs : jobs.filter(j => j.status === filter);

  return (
    <>
      <Head>
        <title>WEBAPI — Automation Tool</title>
        <link rel="preconnect" href="https://fonts.googleapis.com" />
        <link rel="preconnect" href="https://fonts.gstatic.com" crossOrigin="anonymous" />
        <link href="https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600;700&family=JetBrains+Mono:wght@400;600;700&display=swap" rel="stylesheet" />
      </Head>

      <div className={styles.gridBg} />
      <div className={styles.shell}>
        {/* Topbar */}
        <header className={styles.topbar}>
          {/* Logo */}
          <div className={styles.logo}>
            <svg height="30" viewBox="0 0 30 30" fill="none" xmlns="http://www.w3.org/2000/svg" style={{verticalAlign:'middle', marginRight:8, flexShrink:0}}>
              <defs>
                <linearGradient id="logoGrad" x1="0" y1="0" x2="30" y2="30" gradientUnits="userSpaceOnUse">
                  <stop offset="0%" style={{stopColor:'var(--primary)'}} />
                  <stop offset="100%" style={{stopColor:'var(--secondary)'}} />
                </linearGradient>
              </defs>
              <rect x="2" y="2" width="26" height="26" rx="7" fill="url(#logoGrad)" opacity="0.12"/>
              <rect x="2" y="2" width="26" height="26" rx="7" stroke="url(#logoGrad)" strokeWidth="1.5"/>
              <path d="M10 10L7 15L10 20" stroke="url(#logoGrad)" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/>
              <path d="M20 10L23 15L20 20" stroke="url(#logoGrad)" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/>
              <line x1="14" y1="9" x2="16" y2="21" stroke="url(#logoGrad)" strokeWidth="1.5" strokeLinecap="round" opacity="0.7"/>
            </svg>
            <span>WEB</span><em>API</em>
            <span style={{fontSize:10, fontFamily:'Inter, sans-serif', fontWeight:500, marginLeft:12, color:'var(--text-muted)', letterSpacing:2, textTransform:'uppercase'}}>Automation</span>
          </div>

          <div className={styles.topbarRight}>
            <ThemeSwitcher current={currentTheme} onChange={handleThemeChange} />
            <div className={styles.statusPill}>
              <div className={`${styles.dot} ${health ? styles.live : ''}`} />
              {health ? `API LIVE · ${health.jobs} total jobs · ${health.queued} queued` : 'API OFFLINE'}
            </div>
          </div>
        </header>

        <div className={styles.main}>
          {/* LEFT: Form + Stats */}
          <aside className={styles.panelLeft}>
            <div className={styles.panelTitle}>⚡ Launch Job</div>
            <div className={styles.jobForm}>
              <div>
                <label className={styles.label}>Job Type</label>
                <select className={styles.select} value={form.type} onChange={e => setForm(f => ({ ...f, type: e.target.value }))}>
                  {JOB_TYPES.map(t => <option key={t}>{t}</option>)}
                </select>
              </div>
              <div>
                <label className={styles.label}>Payload (JSON)</label>
                <textarea
                  className={styles.textarea}
                  value={form.payload}
                  onChange={e => setForm(f => ({ ...f, payload: e.target.value }))}
                  spellCheck={false}
                />
              </div>
              {error && <div className={styles.errorMsg}>⚠ {error}</div>}
              <button
                className={`${styles.btnRun} ${submitting ? styles.loading : ''}`}
                onClick={runJob}
                disabled={submitting}
              >
                {submitting ? 'QUEUING…' : '▶ RUN JOB'}
              </button>
            </div>

            {/* Stats — all 5 statuses */}
            <div className={styles.stats}>
              {['ALL','QUEUED','RUNNING','DONE','FAILED'].map(s => (
                <div className={styles.stat} key={s}>
                  <div className={styles.statVal} style={{ color: STATUS_COLOR[s] || 'var(--primary)' }}>{statusCounts[s]}</div>
                  <div className={styles.statLabel}>{s}</div>
                </div>
              ))}
            </div>
          </aside>

          {/* CENTER: Job List */}
          <main className={styles.panelCenter}>
            <div className={styles.filterBar}>
              {['ALL','QUEUED','RUNNING','DONE','FAILED'].map(f => (
                <button key={f} className={`${styles.filterBtn} ${filter === f ? styles.active : ''}`} onClick={() => setFilter(f)}>
                  {STATUS_ICON[f] || '◎'} {f} {f !== 'ALL' && `(${statusCounts[f]})`}
                </button>
              ))}
            </div>
            <div className={styles.jobList}>
              {filtered.length === 0 ? (
                <div className={styles.emptyState}>
                  <div className={styles.icon}>∅</div>
                  <div>No jobs {filter !== 'ALL' ? `with status ${filter}` : 'yet'}</div>
                </div>
              ) : filtered.map(job => (
                <div key={job.id} className={`${styles.jobRow} ${selected?.id === job.id ? styles.active : ''}`} onClick={() => setSelected(job)}>
                  <span className={styles.statusBadge} style={{ background: STATUS_COLOR[job.status] + '18', color: STATUS_COLOR[job.status] }}>
                    {STATUS_ICON[job.status]} {job.status}
                  </span>
                  <div>
                    <div className={styles.jobId}>{job.id.slice(0, 8)}…</div>
                    <div className={styles.jobMeta}><span className={styles.jobTypeTag}>{job.type}</span> · {timeAgo(job.createdAt)}</div>
                  </div>
                  <div className={styles.jobTime}>{job.completedAt ? timeAgo(job.completedAt) : '—'}</div>
                  {job.status === 'QUEUED' && (
                    <button className={styles.cancelBtn} onClick={e => { e.stopPropagation(); cancelJob(job.id); }}>✕</button>
                  )}
                </div>
              ))}
            </div>
          </main>

          {/* RIGHT: Detail + Log */}
          <aside className={styles.panelRight}>
            <div className={styles.panelTitle}>🔍 Job Detail</div>
            <div className={styles.detailBox}>
              {selected ? (
                <>
                  {[
                    ['ID', selected.id],
                    ['Type', selected.type],
                    ['Status', selected.status],
                    ['Created', selected.createdAt],
                    ['Started', selected.startedAt || '—'],
                    ['Completed', selected.completedAt || '—'],
                    ['Payload', JSON.stringify(selected.payload, null, 2)],
                    ['Result', selected.result ? JSON.stringify(selected.result, null, 2) : '—'],
                    ['Error', selected.error || '—'],
                  ].map(([k, v]) => (
                    <div key={k}>
                      <div className={styles.detailKey}>{k}</div>
                      <div className={styles.detailVal}>{v}</div>
                    </div>
                  ))}
                </>
              ) : (
                <div style={{ color: 'var(--text-muted)', fontSize: 11, marginTop: 20, textAlign: 'center' }}>
                  Select a job to inspect
                </div>
              )}
            </div>
            <div className={styles.panelTitle} style={{ borderTop: '1px solid var(--border)' }}>📡 Activity Log</div>
            <div className={styles.logBox}>
              {log.length === 0 ? (
                <div style={{ color: 'var(--text-muted)', fontSize: 10 }}>Waiting for activity…</div>
              ) : [...log].reverse().map((e, i) => (
                <div key={i} className={styles.logEntry}>
                  <span className={styles.logTs}>{e.ts}</span>
                  <span className={`${styles.logMsg} ${styles[e.type] || ''}`}>{e.msg}</span>
                </div>
              ))}
            </div>
          </aside>
        </div>
      </div>
    </>
  );
}

