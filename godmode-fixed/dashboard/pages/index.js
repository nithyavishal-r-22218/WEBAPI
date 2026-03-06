import { useState, useEffect, useCallback } from 'react';
import Head from 'next/head';

const API = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:4000';
const API_KEY = process.env.NEXT_PUBLIC_API_KEY || 'godmode-dev-key';

const headers = { 'Content-Type': 'application/json', 'x-api-key': API_KEY };

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
      const r = await fetch(`${API}/jobs`, { headers });
      const d = await r.json();
      setJobs(d.jobs || []);
    } catch { /* silently retry */ }
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

  async function runJob() {
    setError('');
    let payload;
    try { payload = JSON.parse(form.payload); }
    catch { setError('Invalid JSON payload'); return; }

    setSubmitting(true);
    try {
      const r = await fetch(`${API}/run`, {
        method: 'POST', headers,
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
      await fetch(`${API}/jobs/${id}`, { method: 'DELETE', headers });
      addLog(`Job ${id.slice(0, 8)}… cancelled`, 'warn');
      fetchJobs();
    } catch (e) { addLog(e.message, 'error'); }
  }

  const filtered = filter === 'ALL' ? jobs : jobs.filter(j => j.status === filter);

  return (
    <>
      <Head>
        <title>GodMode — Automation HQ</title>
        <link rel="preconnect" href="https://fonts.googleapis.com" />
        <link href="https://fonts.googleapis.com/css2?family=JetBrains+Mono:wght@400;600;700&family=Syne:wght@700;800&display=swap" rel="stylesheet" />
      </Head>

      <style>{`
        *, *::before, *::after { box-sizing: border-box; margin: 0; padding: 0; }
        :root {
          --bg: #050508;
          --surface: #0d0d14;
          --border: #1a1a2e;
          --accent: #6c63ff;
          --accent2: #00d4aa;
          --text: #e8e8f0;
          --muted: #555570;
          --danger: #ef4444;
        }
        body { background: var(--bg); color: var(--text); font-family: 'JetBrains Mono', monospace; min-height: 100vh; overflow-x: hidden; }
        body::before {
          content: '';
          position: fixed; inset: 0;
          background: radial-gradient(ellipse at 20% 50%, #6c63ff0a 0%, transparent 60%),
                      radial-gradient(ellipse at 80% 20%, #00d4aa08 0%, transparent 50%);
          pointer-events: none;
        }
        .grid-bg {
          position: fixed; inset: 0;
          background-image: linear-gradient(rgba(108,99,255,0.03) 1px, transparent 1px),
                            linear-gradient(90deg, rgba(108,99,255,0.03) 1px, transparent 1px);
          background-size: 40px 40px;
          pointer-events: none;
        }
        /* Layout */
        .shell { display: grid; grid-template-rows: auto 1fr; min-height: 100vh; }
        .topbar {
          display: flex; align-items: center; justify-content: space-between;
          padding: 14px 28px; border-bottom: 1px solid var(--border);
          background: rgba(5,5,8,0.9); backdrop-filter: blur(12px);
          position: sticky; top: 0; z-index: 100;
        }
        .logo { font-family: 'Syne', sans-serif; font-size: 22px; font-weight: 800; letter-spacing: -0.5px; }
        .logo span { color: var(--accent); }
        .logo em { color: var(--accent2); font-style: normal; }
        .status-pill {
          display: flex; align-items: center; gap: 8px;
          font-size: 11px; color: var(--muted); padding: 6px 12px;
          border: 1px solid var(--border); border-radius: 99px;
        }
        .dot { width: 7px; height: 7px; border-radius: 50%; background: var(--muted); }
        .dot.live { background: var(--accent2); box-shadow: 0 0 8px var(--accent2); animation: pulse 2s infinite; }
        @keyframes pulse { 0%,100%{opacity:1} 50%{opacity:0.5} }

        .main { display: grid; grid-template-columns: 340px 1fr 300px; gap: 0; height: calc(100vh - 57px); overflow: hidden; }

        /* Left Panel */
        .panel-left { border-right: 1px solid var(--border); display: flex; flex-direction: column; overflow: hidden; }
        .panel-title { padding: 16px 20px; font-size: 10px; letter-spacing: 2px; color: var(--muted); border-bottom: 1px solid var(--border); text-transform: uppercase; }

        .job-form { padding: 20px; display: flex; flex-direction: column; gap: 14px; border-bottom: 1px solid var(--border); }
        select, textarea, input {
          background: var(--surface); border: 1px solid var(--border); color: var(--text);
          font-family: 'JetBrains Mono', monospace; font-size: 12px;
          border-radius: 6px; padding: 10px 12px; width: 100%; outline: none;
          transition: border-color 0.2s;
        }
        select:focus, textarea:focus, input:focus { border-color: var(--accent); }
        textarea { resize: vertical; min-height: 100px; line-height: 1.6; }
        label { font-size: 10px; color: var(--muted); letter-spacing: 1px; text-transform: uppercase; margin-bottom: 4px; display: block; }

        .btn-run {
          background: var(--accent); color: #fff; border: none; border-radius: 6px;
          padding: 12px; font-family: 'Syne', sans-serif; font-size: 14px; font-weight: 700;
          cursor: pointer; letter-spacing: 0.5px; transition: all 0.2s;
          position: relative; overflow: hidden;
        }
        .btn-run:hover { background: #7c75ff; transform: translateY(-1px); box-shadow: 0 4px 20px rgba(108,99,255,0.4); }
        .btn-run:active { transform: translateY(0); }
        .btn-run:disabled { opacity: 0.5; cursor: not-allowed; transform: none; }
        .btn-run.loading::after {
          content: ''; position: absolute; inset: 0;
          background: linear-gradient(90deg, transparent, rgba(255,255,255,0.1), transparent);
          animation: shimmer 1s infinite;
        }
        @keyframes shimmer { 0%{transform:translateX(-100%)} 100%{transform:translateX(100%)} }

        .error-msg { color: var(--danger); font-size: 11px; padding: 8px 10px; background: rgba(239,68,68,0.08); border-radius: 4px; border-left: 2px solid var(--danger); }

        /* Stats */
        .stats { display: grid; grid-template-columns: 1fr 1fr; gap: 1px; background: var(--border); }
        .stat { background: var(--surface); padding: 14px 16px; }
        .stat-val { font-family: 'Syne', sans-serif; font-size: 22px; font-weight: 800; }
        .stat-label { font-size: 9px; color: var(--muted); letter-spacing: 1.5px; text-transform: uppercase; margin-top: 2px; }

        /* Center Panel */
        .panel-center { display: flex; flex-direction: column; overflow: hidden; }
        .filter-bar { display: flex; gap: 0; border-bottom: 1px solid var(--border); }
        .filter-btn {
          padding: 12px 18px; font-family: 'JetBrains Mono', monospace; font-size: 11px;
          background: none; border: none; color: var(--muted); cursor: pointer;
          border-bottom: 2px solid transparent; transition: all 0.2s;
        }
        .filter-btn.active { color: var(--accent); border-bottom-color: var(--accent); }
        .filter-btn:hover:not(.active) { color: var(--text); }

        .job-list { flex: 1; overflow-y: auto; }
        .job-list::-webkit-scrollbar { width: 4px; }
        .job-list::-webkit-scrollbar-track { background: transparent; }
        .job-list::-webkit-scrollbar-thumb { background: var(--border); border-radius: 4px; }

        .job-row {
          display: grid; grid-template-columns: auto 1fr auto auto; gap: 12px;
          align-items: center; padding: 14px 20px; border-bottom: 1px solid var(--border);
          cursor: pointer; transition: background 0.15s;
        }
        .job-row:hover { background: rgba(108,99,255,0.04); }
        .job-row.active { background: rgba(108,99,255,0.08); border-left: 2px solid var(--accent); }

        .status-badge {
          display: inline-flex; align-items: center; gap: 5px;
          padding: 3px 8px; border-radius: 4px; font-size: 10px; font-weight: 600;
          letter-spacing: 0.5px;
        }
        .job-id { font-size: 11px; color: var(--text); }
        .job-meta { font-size: 10px; color: var(--muted); margin-top: 2px; }
        .job-type-tag { font-size: 10px; color: var(--accent2); letter-spacing: 1px; }
        .job-time { font-size: 10px; color: var(--muted); white-space: nowrap; }

        .cancel-btn {
          background: none; border: 1px solid var(--border); color: var(--muted);
          font-size: 10px; font-family: 'JetBrains Mono', monospace;
          padding: 4px 8px; border-radius: 4px; cursor: pointer; transition: all 0.2s;
        }
        .cancel-btn:hover { border-color: var(--danger); color: var(--danger); }

        .empty-state { display: flex; flex-direction: column; align-items: center; justify-content: center; height: 200px; color: var(--muted); gap: 8px; }
        .empty-state .icon { font-size: 32px; opacity: 0.3; }

        /* Right Panel — Detail + Log */
        .panel-right { border-left: 1px solid var(--border); display: flex; flex-direction: column; overflow: hidden; }
        .detail-box { flex: 1; overflow-y: auto; padding: 16px; }
        .detail-box::-webkit-scrollbar { width: 4px; }
        .detail-box::-webkit-scrollbar-thumb { background: var(--border); }

        .detail-key { font-size: 10px; color: var(--muted); letter-spacing: 1px; text-transform: uppercase; margin-bottom: 4px; }
        .detail-val { font-size: 11px; color: var(--text); background: var(--surface); border: 1px solid var(--border); border-radius: 4px; padding: 8px 10px; word-break: break-all; margin-bottom: 12px; white-space: pre-wrap; line-height: 1.6; }

        .log-box { border-top: 1px solid var(--border); height: 200px; overflow-y: auto; padding: 12px; }
        .log-box::-webkit-scrollbar { width: 4px; }
        .log-box::-webkit-scrollbar-thumb { background: var(--border); }
        .log-entry { font-size: 10px; line-height: 1.8; display: flex; gap: 8px; }
        .log-ts { color: var(--muted); flex-shrink: 0; }
        .log-msg.success { color: var(--accent2); }
        .log-msg.error { color: var(--danger); }
        .log-msg.warn { color: #f59e0b; }
        .log-msg.info { color: var(--text); }

        @media (max-width: 1100px) {
          .main { grid-template-columns: 300px 1fr; }
          .panel-right { display: none; }
        }
      `}</style>

      <div className="grid-bg" />
      <div className="shell">
        {/* Topbar */}
        <header className="topbar">
          <div className="logo">
            <span>GOD</span><em>MODE</em>
            <span style={{fontSize:11, fontFamily:'JetBrains Mono', fontWeight:400, marginLeft:12, color:'#555570', letterSpacing:2}}>AUTOMATION HQ</span>
          </div>
          <div className="status-pill">
            <div className={`dot ${health ? 'live' : ''}`} />
            {health ? `API LIVE · ${health.jobs} total jobs · ${health.queued} queued` : 'API OFFLINE'}
          </div>
        </header>

        <div className="main">
          {/* LEFT: Form + Stats */}
          <aside className="panel-left">
            <div className="panel-title">⚡ Launch Job</div>
            <div className="job-form">
              <div>
                <label>Job Type</label>
                <select value={form.type} onChange={e => setForm(f => ({ ...f, type: e.target.value }))}>
                  {JOB_TYPES.map(t => <option key={t}>{t}</option>)}
                </select>
              </div>
              <div>
                <label>Payload (JSON)</label>
                <textarea
                  value={form.payload}
                  onChange={e => setForm(f => ({ ...f, payload: e.target.value }))}
                  spellCheck={false}
                />
              </div>
              {error && <div className="error-msg">⚠ {error}</div>}
              <button
                className={`btn-run ${submitting ? 'loading' : ''}`}
                onClick={runJob}
                disabled={submitting}
              >
                {submitting ? 'QUEUING…' : '▶ RUN JOB'}
              </button>
            </div>

            {/* Stats */}
            <div className="stats">
              {['ALL','QUEUED','RUNNING','DONE','FAILED'].slice(0,4).map(s => {
                const count = s === 'ALL' ? jobs.length : jobs.filter(j => j.status === s).length;
                return (
                  <div className="stat" key={s}>
                    <div className="stat-val" style={{ color: STATUS_COLOR[s] || 'var(--text)' }}>{count}</div>
                    <div className="stat-label">{s}</div>
                  </div>
                );
              })}
            </div>
          </aside>

          {/* CENTER: Job List */}
          <main className="panel-center">
            <div className="filter-bar">
              {['ALL','QUEUED','RUNNING','DONE','FAILED'].map(f => (
                <button key={f} className={`filter-btn ${filter === f ? 'active' : ''}`} onClick={() => setFilter(f)}>
                  {STATUS_ICON[f] || '◎'} {f} {f !== 'ALL' && `(${jobs.filter(j=>j.status===f).length})`}
                </button>
              ))}
            </div>
            <div className="job-list">
              {filtered.length === 0 ? (
                <div className="empty-state">
                  <div className="icon">∅</div>
                  <div>No jobs {filter !== 'ALL' ? `with status ${filter}` : 'yet'}</div>
                </div>
              ) : filtered.map(job => (
                <div key={job.id} className={`job-row ${selected?.id === job.id ? 'active' : ''}`} onClick={() => setSelected(job)}>
                  <span className="status-badge" style={{ background: STATUS_COLOR[job.status] + '18', color: STATUS_COLOR[job.status] }}>
                    {STATUS_ICON[job.status]} {job.status}
                  </span>
                  <div>
                    <div className="job-id">{job.id.slice(0, 8)}…</div>
                    <div className="job-meta"><span className="job-type-tag">{job.type}</span> · {timeAgo(job.createdAt)}</div>
                  </div>
                  <div className="job-time">{job.completedAt ? timeAgo(job.completedAt) : '—'}</div>
                  {job.status === 'QUEUED' && (
                    <button className="cancel-btn" onClick={e => { e.stopPropagation(); cancelJob(job.id); }}>✕</button>
                  )}
                </div>
              ))}
            </div>
          </main>

          {/* RIGHT: Detail + Log */}
          <aside className="panel-right">
            <div className="panel-title">🔍 Job Detail</div>
            <div className="detail-box">
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
                      <div className="detail-key">{k}</div>
                      <div className="detail-val">{v}</div>
                    </div>
                  ))}
                </>
              ) : (
                <div style={{ color: 'var(--muted)', fontSize: 11, marginTop: 20, textAlign: 'center' }}>
                  Select a job to inspect
                </div>
              )}
            </div>
            <div className="panel-title" style={{ borderTop: '1px solid var(--border)' }}>📡 Activity Log</div>
            <div className="log-box">
              {log.length === 0 ? (
                <div style={{ color: 'var(--muted)', fontSize: 10 }}>Waiting for activity…</div>
              ) : [...log].reverse().map((e, i) => (
                <div key={i} className="log-entry">
                  <span className="log-ts">{e.ts}</span>
                  <span className={`log-msg ${e.type}`}>{e.msg}</span>
                </div>
              ))}
            </div>
          </aside>
        </div>
      </div>
    </>
  );
}
