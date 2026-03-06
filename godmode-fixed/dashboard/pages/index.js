import { useState, useEffect, useCallback, useMemo, useRef } from 'react';
import Head from 'next/head';
import styles from '../styles/godmode.module.css';

const API = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:4000';

const JOB_TYPES = ['SCRAPE', 'AUTOMATE', 'SCHEDULE', 'CUSTOM'];

const STATUS_BADGE = {
  QUEUED:  { bg: '#fef3c7', color: '#d97706', icon: '⏳' },
  RUNNING: { bg: '#dbeafe', color: '#2563eb', icon: '⚡' },
  DONE:    { bg: '#dcfce7', color: '#16a34a', icon: '✓' },
  FAILED:  { bg: '#fee2e2', color: '#dc2626', icon: '✗' },
};

const STATUS_ICON = { QUEUED: '⏳', RUNNING: '⚡', DONE: '✓', FAILED: '✗' };

// ── Theme System ──────────────────────────────────────────────
const THEMES = {
  default: {
    name: 'Default',
    primary: '#6c63ff',
    bg: '#f0eef6',
    surface: '#ffffff',
    secondary: '#8b83ff',
    text: '#1a1a2e',
    textMuted: '#64648c',
    border: '#e8e5f0',
    success: '#16a34a',
    danger: '#dc2626',
    warning: '#d97706',
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
    success: '#16a34a',
    danger: '#dc2626',
    warning: '#d97706',
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
    success: '#16a34a',
    danger: '#dc2626',
    warning: '#d97706',
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
    success: '#16a34a',
    danger: '#dc2626',
    warning: '#d97706',
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
    success: '#16a34a',
    danger: '#dc2626',
    warning: '#EFB11D',
  },
};

const DEFAULT_CUSTOM_COLORS = {
  primary: '#6c63ff',
  bg: '#f0eef6',
  surface: '#ffffff',
  secondary: '#8b83ff',
  text: '#1a1a2e',
  border: '#e8e5f0',
};

function applyTheme(theme) {
  if (typeof document === 'undefined') return;
  const r = document.documentElement;
  r.style.setProperty('--bg', theme.bg);
  r.style.setProperty('--surface', theme.surface);
  r.style.setProperty('--primary', theme.primary);
  r.style.setProperty('--secondary', theme.secondary);
  r.style.setProperty('--text', theme.text);
  r.style.setProperty('--text-muted', theme.textMuted || '#64648c');
  r.style.setProperty('--border', theme.border);
  r.style.setProperty('--success', theme.success || '#16a34a');
  r.style.setProperty('--danger', theme.danger || '#dc2626');
  r.style.setProperty('--warning', theme.warning || '#d97706');
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
    success: '#16a34a',
    danger: '#dc2626',
    warning: '#d97706',
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
  const [showLaunchModal, setShowLaunchModal] = useState(false);
  const [activeNav, setActiveNav] = useState('dashboard');
  const [searchQuery, setSearchQuery] = useState('');

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
      setShowLaunchModal(false);
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

  const filtered = useMemo(() => {
    let result = filter === 'ALL' ? jobs : jobs.filter(j => j.status === filter);
    if (searchQuery.trim()) {
      const q = searchQuery.toLowerCase();
      result = result.filter(j =>
        j.id.toLowerCase().includes(q) ||
        j.type.toLowerCase().includes(q) ||
        j.status.toLowerCase().includes(q)
      );
    }
    return result;
  }, [jobs, filter, searchQuery]);

  const STAT_CARDS = [
    { key: 'ALL',     label: 'Total jobs',  icon: '📊', color: '#6c63ff' },
    { key: 'QUEUED',  label: 'In queue',    icon: '⏳', color: '#d97706' },
    { key: 'RUNNING', label: 'Running now', icon: '⚡', color: '#2563eb' },
    { key: 'DONE',    label: 'Completed',   icon: '✓',  color: '#16a34a' },
    { key: 'FAILED',  label: 'Failed',      icon: '✗',  color: '#dc2626' },
  ];

  return (
    <>
      <Head>
        <title>WEBAPI — Automation Tool</title>
        <link rel="preconnect" href="https://fonts.googleapis.com" />
        <link rel="preconnect" href="https://fonts.gstatic.com" crossOrigin="anonymous" />
        <link href="https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600;700;800&family=JetBrains+Mono:wght@400;600&display=swap" rel="stylesheet" />
      </Head>

      <div className={styles.shell}>
        {/* ── Icon Sidebar ── */}
        <nav className={styles.sidebar}>
          <div className={styles.sidebarLogo}>
            <svg height="28" viewBox="0 0 30 30" fill="none" xmlns="http://www.w3.org/2000/svg">
              <defs>
                <linearGradient id="logoGrad" x1="0" y1="0" x2="30" y2="30" gradientUnits="userSpaceOnUse">
                  <stop offset="0%" style={{ stopColor: 'var(--primary)' }} />
                  <stop offset="100%" style={{ stopColor: 'var(--secondary)' }} />
                </linearGradient>
              </defs>
              <rect x="2" y="2" width="26" height="26" rx="7" fill="url(#logoGrad)" opacity="0.12" />
              <rect x="2" y="2" width="26" height="26" rx="7" stroke="url(#logoGrad)" strokeWidth="1.5" />
              <path d="M10 10L7 15L10 20" stroke="url(#logoGrad)" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
              <path d="M20 10L23 15L20 20" stroke="url(#logoGrad)" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
              <line x1="14" y1="9" x2="16" y2="21" stroke="url(#logoGrad)" strokeWidth="1.5" strokeLinecap="round" opacity="0.7" />
            </svg>
          </div>

          <div className={styles.sidebarNav}>
            {[
              { key: 'dashboard', icon: '🏠', label: 'Dashboard' },
              { key: 'launch',    icon: '⚡', label: 'Launch Job' },
              { key: 'jobs',      icon: '📋', label: 'Job List' },
              { key: 'activity',  icon: '📊', label: 'Activity Log' },
              { key: 'themes',    icon: '⚙️', label: 'Settings' },
            ].map(({ key, icon, label }) => (
              <button
                key={key}
                className={`${styles.sidebarBtn} ${activeNav === key ? styles.sidebarBtnActive : ''}`}
                onClick={() => {
                  if (key === 'launch') {
                    setShowLaunchModal(true);
                    setActiveNav('launch');
                  } else {
                    setActiveNav(key);
                  }
                }}
                title={label}
                aria-label={label}
              >
                <span className={styles.sidebarIcon}>{icon}</span>
              </button>
            ))}
          </div>

          <div className={styles.sidebarBottom}>
            <div className={styles.statusDot} title={health ? 'API Online' : 'API Offline'}>
              <div className={`${styles.dot} ${health ? styles.live : ''}`} />
            </div>
          </div>
        </nav>

        {/* ── Main Area ── */}
        <div className={styles.mainArea}>
          {/* Top Bar */}
          <header className={styles.topbar}>
            <div className={styles.searchBar}>
              <span className={styles.searchIcon}>🔍</span>
              <input
                type="text"
                placeholder="Search jobs..."
                className={styles.searchInput}
                value={searchQuery}
                onChange={e => setSearchQuery(e.target.value)}
                aria-label="Search jobs"
              />
            </div>
            <div className={styles.topbarRight}>
              <ThemeSwitcher current={currentTheme} onChange={handleThemeChange} />
              <button
                className={styles.iconBtn}
                title={health ? `API LIVE · ${health.jobs} total · ${health.queued} queued` : 'API OFFLINE'}
                aria-label="API Status"
              >
                {health ? '🟢' : '🔴'}
              </button>
              <div className={styles.avatar} title="WEBAPI User">
                <span>WA</span>
              </div>
            </div>
          </header>

          {/* Scrollable Content */}
          <div className={styles.content}>
            {/* Welcome Section */}
            <div className={styles.welcomeSection}>
              <div className={styles.welcomeText}>
                <h1 className={styles.welcomeTitle}>Welcome! 👋</h1>
                <p className={styles.welcomeSub}>Automate tasks and achieve more every day.</p>
              </div>
              <div className={styles.quickActions}>
                {[
                  { icon: '✨', name: 'Scrape Bot',  desc: 'Web Scraping',      type: 'SCRAPE'   },
                  { icon: '🤖', name: 'AutoRunner',  desc: 'Task Automation',   type: 'AUTOMATE' },
                  { icon: '🗓️', name: 'Scheduler',   desc: 'Scheduled Jobs',    type: 'SCHEDULE' },
                ].map(({ icon, name, desc, type }) => (
                  <button
                    key={type}
                    className={styles.quickActionCard}
                    onClick={() => { setForm(f => ({ ...f, type })); setShowLaunchModal(true); setActiveNav('launch'); }}
                  >
                    <span className={styles.qaIcon}>{icon}</span>
                    <div className={styles.qaText}>
                      <div className={styles.qaName}>{name}</div>
                      <div className={styles.qaDesc}>{desc}</div>
                    </div>
                    <span className={styles.qaArrow}>›</span>
                  </button>
                ))}
              </div>
            </div>

            {/* Stat Cards */}
            <div className={styles.statsRow}>
              {STAT_CARDS.map(({ key, label, icon, color }) => (
                <div
                  key={key}
                  className={styles.statCard}
                  style={{ borderTopColor: color }}
                  onClick={() => setFilter(key)}
                  role="button"
                  tabIndex={0}
                  onKeyDown={e => e.key === 'Enter' && setFilter(key)}
                  aria-label={`Filter by ${key}`}
                >
                  <div className={styles.statCardHeader}>
                    <span className={styles.statCardIcon} style={{ color }}>{icon}</span>
                    <span className={styles.statCardKey} style={{ color }}>{key}</span>
                  </div>
                  <div className={styles.statCardVal} style={{ color }}>{statusCounts[key]}</div>
                  <div className={styles.statCardLabel}>{label}</div>
                </div>
              ))}
            </div>

            {/* Jobs + Detail Panel */}
            <div className={styles.jobsSection}>
              {/* Jobs Card */}
              <div className={styles.jobsCard}>
                <div className={styles.jobsCardHeader}>
                  <div className={styles.jobsCardTitle}>
                    <span>Jobs List</span>
                    <span className={styles.jobsCount}>{filtered.length}</span>
                  </div>
                  <button className={styles.newJobBtn} onClick={() => { setShowLaunchModal(true); setActiveNav('launch'); }}>
                    + New Job
                  </button>
                </div>

                {/* Filter Tabs */}
                <div className={styles.filterBar}>
                  {['ALL', 'QUEUED', 'RUNNING', 'DONE', 'FAILED'].map(f => (
                    <button
                      key={f}
                      className={`${styles.filterBtn} ${filter === f ? styles.filterBtnActive : ''}`}
                      onClick={() => setFilter(f)}
                    >
                      {STATUS_ICON[f] || '◎'} {f}
                      {f !== 'ALL' && statusCounts[f] > 0 && (
                        <span className={styles.filterCount}>{statusCounts[f]}</span>
                      )}
                    </button>
                  ))}
                </div>

                {/* Table */}
                <div className={styles.tableWrapper}>
                  {filtered.length === 0 ? (
                    <div className={styles.emptyState}>
                      <div className={styles.emptyIcon}>∅</div>
                      <div className={styles.emptyText}>
                        No jobs {filter !== 'ALL' ? `with status ${filter}` : 'yet'}
                      </div>
                      <button
                        className={styles.emptyNewBtn}
                        onClick={() => { setShowLaunchModal(true); setActiveNav('launch'); }}
                      >
                        + Launch your first job
                      </button>
                    </div>
                  ) : (
                    <table className={styles.jobTable}>
                      <thead>
                        <tr>
                          <th>NAME</th>
                          <th>STATUS</th>
                          <th>TYPE</th>
                          <th>CREATED</th>
                          <th>ACTION</th>
                        </tr>
                      </thead>
                      <tbody>
                        {filtered.map(job => {
                          const badge = STATUS_BADGE[job.status] || { bg: '#f5f5f5', color: '#666', icon: '?' };
                          return (
                            <tr
                              key={job.id}
                              className={`${styles.jobRow} ${selected?.id === job.id ? styles.jobRowActive : ''}`}
                              onClick={() => setSelected(job)}
                            >
                              <td>
                                <span className={styles.jobId}>{job.id.slice(0, 8)}…</span>
                              </td>
                              <td>
                                <span className={styles.statusBadge} style={{ background: badge.bg, color: badge.color }}>
                                  {badge.icon} {job.status}
                                </span>
                              </td>
                              <td>
                                <span className={styles.typeTag}>{job.type}</span>
                              </td>
                              <td>
                                <span className={styles.timeText}>{timeAgo(job.createdAt)}</span>
                              </td>
                              <td onClick={e => e.stopPropagation()}>
                                <div className={styles.actionBtns}>
                                  <button
                                    className={styles.actionBtn}
                                    onClick={() => setSelected(job)}
                                    title="View details"
                                    aria-label="View job details"
                                  >
                                    👁
                                  </button>
                                  {job.status === 'QUEUED' && (
                                    <button
                                      className={`${styles.actionBtn} ${styles.actionBtnDanger}`}
                                      onClick={() => cancelJob(job.id)}
                                      title="Cancel job"
                                      aria-label="Cancel job"
                                    >
                                      ✕
                                    </button>
                                  )}
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

              {/* Job Detail Panel (slide-in) */}
              {selected && (
                <div className={styles.detailPanel}>
                  <div className={styles.detailHeader}>
                    <div>
                      <div className={styles.detailTitle}>{selected.id.slice(0, 14)}…</div>
                      <span
                        className={styles.statusBadge}
                        style={{
                          background: (STATUS_BADGE[selected.status] || { bg: '#f5f5f5' }).bg,
                          color: (STATUS_BADGE[selected.status] || { color: '#666' }).color,
                        }}
                      >
                        {(STATUS_BADGE[selected.status] || { icon: '?' }).icon} {selected.status}
                      </span>
                    </div>
                    <button className={styles.closeDetailBtn} onClick={() => setSelected(null)} aria-label="Close detail panel">
                      ✕
                    </button>
                  </div>

                  <div className={styles.detailBody}>
                    {[
                      ['Type',      selected.type],
                      ['Status',    selected.status],
                      ['Created',   selected.createdAt   ? new Date(selected.createdAt).toLocaleString()   : '—'],
                      ['Started',   selected.startedAt   ? new Date(selected.startedAt).toLocaleString()   : '—'],
                      ['Completed', selected.completedAt ? new Date(selected.completedAt).toLocaleString() : '—'],
                    ].map(([k, v]) => (
                      <div key={k} className={styles.detailRow}>
                        <div className={styles.detailKey}>{k}</div>
                        <div className={styles.detailVal}>{v}</div>
                      </div>
                    ))}

                    <div className={styles.detailRow}>
                      <div className={styles.detailKey}>Payload</div>
                      <pre className={styles.codeBlock}>{JSON.stringify(selected.payload, null, 2)}</pre>
                    </div>

                    {selected.result && (
                      <div className={styles.detailRow}>
                        <div className={styles.detailKey}>Result</div>
                        <pre className={styles.codeBlock}>{JSON.stringify(selected.result, null, 2)}</pre>
                      </div>
                    )}

                    {selected.error && (
                      <div className={styles.detailRow}>
                        <div className={styles.detailKey}>Error</div>
                        <pre className={`${styles.codeBlock} ${styles.codeBlockError}`}>{selected.error}</pre>
                      </div>
                    )}
                  </div>
                </div>
              )}
            </div>

            {/* Activity Log */}
            <div className={styles.activityCard}>
              <div className={styles.activityHeader}>
                <span className={styles.activityTitle}>📡 Activity Log</span>
                <span className={styles.activityCount}>{log.length} events</span>
              </div>
              <div className={styles.logBox}>
                {log.length === 0 ? (
                  <div className={styles.logEmpty}>Waiting for activity…</div>
                ) : (
                  [...log].reverse().map((e, i) => (
                    <div key={i} className={styles.logEntry}>
                      <span className={styles.logTs}>{e.ts}</span>
                      <span className={`${styles.logMsg} ${styles[e.type] || ''}`}>{e.msg}</span>
                    </div>
                  ))
                )}
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* ── Launch Job Modal ── */}
      {showLaunchModal && (
        <div
          className={styles.modalOverlay}
          onClick={() => { setShowLaunchModal(false); setActiveNav('dashboard'); }}
          role="dialog"
          aria-modal="true"
          aria-label="Launch new job"
        >
          <div className={styles.modal} onClick={e => e.stopPropagation()}>
            <div className={styles.modalHeader}>
              <span className={styles.modalTitle}>⚡ Launch New Job</span>
              <button
                className={styles.modalClose}
                onClick={() => { setShowLaunchModal(false); setActiveNav('dashboard'); }}
                aria-label="Close modal"
              >
                ✕
              </button>
            </div>
            <div className={styles.modalBody}>
              <div className={styles.formGroup}>
                <label className={styles.formLabel}>Job Type</label>
                <select
                  className={styles.formSelect}
                  value={form.type}
                  onChange={e => setForm(f => ({ ...f, type: e.target.value }))}
                >
                  {JOB_TYPES.map(t => <option key={t}>{t}</option>)}
                </select>
              </div>
              <div className={styles.formGroup}>
                <label className={styles.formLabel}>Payload (JSON)</label>
                <textarea
                  className={styles.formTextarea}
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
          </div>
        </div>
      )}
    </>
  );
}

