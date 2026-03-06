// ─── Logger ──────────────────────────────────────────────────────────────────
export function log(level, msg, data = {}) {
  const entry = { ts: new Date().toISOString(), level, msg, ...data };
  console.log(JSON.stringify(entry));
}
