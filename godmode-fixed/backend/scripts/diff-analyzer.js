#!/usr/bin/env node
/**
 * diff-analyzer.js
 *
 * Analyzes git diff between two refs (default: origin/main vs HEAD) and
 * produces a JSON impact map describing which routes and test suites are
 * affected by the changed files.
 *
 * Usage:
 *   node scripts/diff-analyzer.js [base-ref] [head-ref]
 *
 * Examples:
 *   node scripts/diff-analyzer.js                         # main vs HEAD
 *   node scripts/diff-analyzer.js main feature-branch
 *   node scripts/diff-analyzer.js abc123 def456
 *
 * Output (stdout): JSON array of impact entries, one per changed file.
 * Exit code 0 = success, 1 = error.
 */

import { execSync } from 'node:child_process';
import { writeFileSync } from 'node:fs';
import { resolve, join } from 'node:path';
import { fileURLToPath } from 'node:url';

// ─── Layer Detection ──────────────────────────────────────────────────────────

const LAYER_PATTERNS = [
  { layer: 'middleware',  pattern: /^.*\/middleware\// },
  { layer: 'services',   pattern: /^.*\/services\// },
  { layer: 'routes',     pattern: /^.*\/routes\// },
  { layer: 'dashboard',  pattern: /^.*\/dashboard\// },
  { layer: 'extension',  pattern: /^.*\/extension\// },
  { layer: 'utils',      pattern: /^.*\/utils\// },
  { layer: 'tests',      pattern: /^.*\/__tests__\// },
  { layer: 'config',     pattern: /^.*(package\.json|\.env|docker-compose\.yml|Dockerfile)/ },
];

function detectLayer(filePath) {
  for (const { layer, pattern } of LAYER_PATTERNS) {
    if (pattern.test(filePath)) return layer;
  }
  return 'other';
}

// ─── Impact Mapping Rules ─────────────────────────────────────────────────────

const IMPACT_RULES = [
  {
    match: (f) => f.includes('middleware/auth'),
    impactedRoutes: ['ALL_AUTHENTICATED'],
    impactedComponents: ['GET /jobs', 'POST /run', 'DELETE /jobs/:id', 'POST /recordings',
      'GET /recordings', 'DELETE /recordings/:id', 'POST /cases', 'GET /cases',
      'DELETE /cases/:id', 'POST /results', 'GET /results',
      'POST /credentials', 'GET /credentials', 'DELETE /credentials/:id',
      'POST /environments', 'GET /environments', 'DELETE /environments/:id'],
    testSuites: ['jobs.test.js', 'recordings.test.js', 'testCases.test.js',
      'results.test.js', 'credentials.test.js', 'environments.test.js'],
    riskLevel: 'HIGH',
  },
  {
    match: (f) => f.includes('services/jobProcessor'),
    impactedRoutes: ['POST /run', 'GET /jobs', 'GET /jobs/:id', 'DELETE /jobs/:id'],
    impactedComponents: ['job lifecycle', 'queue management', 'AUTOMATE steps', 'SCRAPE execution'],
    testSuites: ['jobs.test.js'],
    riskLevel: 'HIGH',
  },
  {
    match: (f) => f.includes('routes/jobs'),
    impactedRoutes: ['POST /run', 'GET /jobs', 'GET /jobs/:id', 'DELETE /jobs/:id', 'GET /health'],
    impactedComponents: ['job CRUD', 'job cancellation', 'job type validation'],
    testSuites: ['jobs.test.js'],
    riskLevel: 'HIGH',
  },
  {
    match: (f) => f.includes('routes/recordings'),
    impactedRoutes: ['POST /recordings', 'GET /recordings', 'DELETE /recordings/:id'],
    impactedComponents: ['recording upsert', 'recording list', 'recording delete'],
    testSuites: ['recordings.test.js'],
    riskLevel: 'MEDIUM',
  },
  {
    match: (f) => f.includes('routes/testCases'),
    impactedRoutes: ['POST /cases', 'GET /cases', 'DELETE /cases/:id',
      'POST /test-cases', 'GET /test-cases', 'DELETE /test-cases/:id'],
    impactedComponents: ['test case upsert', 'test case list', 'test case delete'],
    testSuites: ['testCases.test.js'],
    riskLevel: 'MEDIUM',
  },
  {
    match: (f) => f.includes('routes/results'),
    impactedRoutes: ['POST /results', 'GET /results'],
    impactedComponents: ['result append', 'result listing', 'result capping'],
    testSuites: ['results.test.js'],
    riskLevel: 'MEDIUM',
  },
  {
    match: (f) => f.includes('routes/credentials'),
    impactedRoutes: ['POST /credentials', 'GET /credentials', 'DELETE /credentials/:id'],
    impactedComponents: ['credential upsert', 'credential list', 'credential delete'],
    testSuites: ['credentials.test.js'],
    riskLevel: 'MEDIUM',
  },
  {
    match: (f) => f.includes('routes/environments'),
    impactedRoutes: ['POST /environments', 'GET /environments', 'DELETE /environments/:id'],
    impactedComponents: ['environment upsert', 'environment list', 'environment delete'],
    testSuites: ['environments.test.js'],
    riskLevel: 'MEDIUM',
  },
  {
    match: (f) => f.includes('dashboard/'),
    impactedRoutes: [],
    impactedComponents: ['UI: dashboard pages', 'browser automation flows'],
    testSuites: ['e2e (Chrome extension recorder)'],
    riskLevel: 'MEDIUM',
  },
  {
    match: (f) => f.includes('extension/'),
    impactedRoutes: [],
    impactedComponents: ['Chrome extension recording', 'step capture', 'background script'],
    testSuites: ['e2e (Chrome extension recorder)'],
    riskLevel: 'MEDIUM',
  },
  {
    match: (f) => f === 'index.js' || f.endsWith('/index.js'),
    impactedRoutes: ['ALL'],
    impactedComponents: ['server bootstrap', 'rate limiting', 'CORS', 'global error handler'],
    testSuites: ['jobs.test.js', 'recordings.test.js', 'testCases.test.js',
      'results.test.js', 'credentials.test.js', 'environments.test.js'],
    riskLevel: 'HIGH',
  },
  {
    match: (f) => /package\.json/.test(f),
    impactedRoutes: ['ALL'],
    impactedComponents: ['dependencies', 'scripts'],
    testSuites: ['ALL'],
    riskLevel: 'HIGH',
  },
];

function applyRules(filePath) {
  const matches = IMPACT_RULES.filter(r => r.match(filePath));
  if (matches.length === 0) {
    return {
      impactedRoutes: [],
      impactedComponents: ['unknown — manual review required'],
      testSuites: [],
      riskLevel: 'LOW',
    };
  }

  // Merge all matching rules
  const merged = {
    impactedRoutes: [...new Set(matches.flatMap(m => m.impactedRoutes))],
    impactedComponents: [...new Set(matches.flatMap(m => m.impactedComponents))],
    testSuites: [...new Set(matches.flatMap(m => m.testSuites))],
    riskLevel: matches.some(m => m.riskLevel === 'HIGH') ? 'HIGH'
      : matches.some(m => m.riskLevel === 'MEDIUM') ? 'MEDIUM' : 'LOW',
  };
  return merged;
}

// ─── Git Helpers ──────────────────────────────────────────────────────────────

function getChangedFiles(baseRef, headRef) {
  try {
    const cmd = `git diff --name-only ${baseRef}...${headRef}`;
    const output = execSync(cmd, { encoding: 'utf8', stdio: ['pipe', 'pipe', 'pipe'] });
    return output.trim().split('\n').filter(Boolean);
  } catch (err) {
    // Fallback: compare working tree vs base
    try {
      const cmd = `git diff --name-only ${baseRef}`;
      const output = execSync(cmd, { encoding: 'utf8', stdio: ['pipe', 'pipe', 'pipe'] });
      return output.trim().split('\n').filter(Boolean);
    } catch {
      console.error(`[diff-analyzer] Failed to run git diff: ${err.message}`);
      process.exit(1);
    }
  }
}

function getFileDiffStat(filePath, baseRef, headRef) {
  try {
    const cmd = `git diff --stat ${baseRef}...${headRef} -- "${filePath}"`;
    const output = execSync(cmd, { encoding: 'utf8', stdio: ['pipe', 'pipe', 'pipe'] });
    const match = output.match(/(\d+) insertion.*?(\d+) deletion/);
    return match
      ? { insertions: parseInt(match[1], 10), deletions: parseInt(match[2], 10) }
      : { insertions: 0, deletions: 0 };
  } catch {
    return { insertions: 0, deletions: 0 };
  }
}

// ─── Main ─────────────────────────────────────────────────────────────────────

const [,, baseRef = 'origin/main', headRef = 'HEAD'] = process.argv;

console.error(`[diff-analyzer] Comparing ${baseRef}...${headRef}`);

const changedFiles = getChangedFiles(baseRef, headRef);

if (changedFiles.length === 0) {
  console.error('[diff-analyzer] No changed files found.');
  console.log(JSON.stringify({ summary: { totalChanged: 0, highRisk: 0, mediumRisk: 0, lowRisk: 0 }, impactMap: [] }, null, 2));
  process.exit(0);
}

console.error(`[diff-analyzer] ${changedFiles.length} file(s) changed.`);

const impactMap = changedFiles.map(filePath => {
  const layer = detectLayer(filePath);
  const { impactedRoutes, impactedComponents, testSuites, riskLevel } = applyRules(filePath);
  const stat = getFileDiffStat(filePath, baseRef, headRef);

  return {
    changedFile: filePath,
    layer,
    stat,
    impactedRoutes,
    impactedComponents,
    testSuites,
    riskLevel,
  };
});

// Derive which test suites to run (deduplicated)
const suitesToRun = [...new Set(impactMap.flatMap(e => e.testSuites))].sort();

// Summary
const summary = {
  baseRef,
  headRef,
  totalChanged: changedFiles.length,
  highRisk: impactMap.filter(e => e.riskLevel === 'HIGH').length,
  mediumRisk: impactMap.filter(e => e.riskLevel === 'MEDIUM').length,
  lowRisk: impactMap.filter(e => e.riskLevel === 'LOW').length,
  suitesToRun,
};

const output = { summary, impactMap };

// Write to file if requested
const outFile = process.env.IMPACT_MAP_OUT;
if (outFile) {
  writeFileSync(resolve(outFile), JSON.stringify(output, null, 2));
  console.error(`[diff-analyzer] Impact map written to ${outFile}`);
}

// Always print to stdout
console.log(JSON.stringify(output, null, 2));
