import { useState, useEffect, useCallback, useMemo } from 'react';
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

function timeAgo(iso) {
  if (!iso) return '—';
  const diff = Date.now() - new Date(iso).getTime();
  if (diff < 60000) return `${Math.floor(diff / 1000)}s ago`;
  if (diff < 3600000) return `${Math.floor(diff / 60000)}m ago`;
  return `${Math.floor(diff / 3600000)}h ago`;
}

export default function GodMode() {
  const [jobs, setJobs] = useState([]);
  const [health, setHealth] = useState(null);
  const [selected, setSelected] = useState(null);
  const [form, setForm] = useState({ type: 'SCRAPE', payload: '{\n  "url": "https://example.com"\n}' });
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState('');
  const [filter, setFilter] = useState('ALL');
  const [log, setLog] = useState([]);

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
        <link href="https://fonts.googleapis.com/css2?family=JetBrains+Mono:wght@400;600;700&family=Syne:wght@700;800&display=swap" rel="stylesheet" />
      </Head>

      <div className={styles.gridBg} />
      <div className={styles.shell}>
        {/* Topbar */}
        <header className={styles.topbar}>
          <div className={styles.logo}>
            <svg height="32" viewBox="0 0 32 32" fill="none" xmlns="http://www.w3.org/2000/svg" style={{verticalAlign:'middle', marginRight:8}}>
              <defs>
                <linearGradient id="gearGrad" x1="0" y1="0" x2="32" y2="32" gradientUnits="userSpaceOnUse">
                  <stop offset="0%" stopColor="#00d4aa"/>
                  <stop offset="100%" stopColor="#0ea5e9"/>
                </linearGradient>
              </defs>
              <path d="M13 2l-1.5 2.6A7 7 0 0 0 9 6L6.1 5.5 3.5 8.1 4 11a7 7 0 0 0-1.4 2.5L0 15v3.7l2.6 1.5A7 7 0 0 0 4 22.5l-.5 2.9 2.6 2.6L9 27.4a7 7 0 0 0 2.5 1.4L13 31h3.7l1.5-2.6A7 7 0 0 0 20.5 27l2.9.5 2.6-2.6-.5-2.9A7 7 0 0 0 26.9 19L29 17.6V14l-2.1-1.4A7 7 0 0 0 25.5 10l.5-2.9-2.6-2.6L20.5 5A7 7 0 0 0 18 3.6L16.6 1H13z" fill="url(#gearGrad)" opacity="0.15"/>
              <circle cx="12" cy="12" r="6.5" stroke="url(#gearGrad)" strokeWidth="1.5" fill="none"/>
              <circle cx="20" cy="20" r="6.5" stroke="url(#gearGrad)" strokeWidth="1.5" fill="none"/>
              <circle cx="12" cy="12" r="2" fill="url(#gearGrad)"/>
              <circle cx="20" cy="20" r="2" fill="url(#gearGrad)"/>
              <text x="8.5" y="15" fontFamily="monospace" fontSize="5" fill="url(#gearGrad)" fontWeight="bold">{"{"}</text>
              <text x="14" y="15" fontFamily="monospace" fontSize="5" fill="url(#gearGrad)" fontWeight="bold">{"}"}</text>
              <text x="16.5" y="23" fontFamily="monospace" fontSize="5" fill="url(#gearGrad)" fontWeight="bold">→</text>
            </svg>
            <span>WEB</span><em>API</em>
            <span style={{fontSize:11, fontFamily:'JetBrains Mono', fontWeight:400, marginLeft:12, color:'#555570', letterSpacing:2}}>AUTOMATION TOOL</span>
          </div>
          <div className={styles.statusPill}>
            <div className={`${styles.dot} ${health ? styles.live : ''}`} />
            {health ? `API LIVE · ${health.jobs} total jobs · ${health.queued} queued` : 'API OFFLINE'}
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
                  <div className={styles.statVal} style={{ color: STATUS_COLOR[s] || 'var(--text)' }}>{statusCounts[s]}</div>
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
                <div style={{ color: 'var(--muted)', fontSize: 11, marginTop: 20, textAlign: 'center' }}>
                  Select a job to inspect
                </div>
              )}
            </div>
            <div className={styles.panelTitle} style={{ borderTop: '1px solid var(--border)' }}>📡 Activity Log</div>
            <div className={styles.logBox}>
              {log.length === 0 ? (
                <div style={{ color: 'var(--muted)', fontSize: 10 }}>Waiting for activity…</div>
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
