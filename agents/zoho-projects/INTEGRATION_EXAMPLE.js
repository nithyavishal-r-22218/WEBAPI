/**
 * GodMode Backend Integration Example
 *
 * This file demonstrates how to integrate the Zoho Projects agent
 * with the GodMode backend for API-driven test execution.
 */

/**
 * Step 1: Add the import to jobProcessor.js
 *
 * Add this at the top of godmode-fixed/backend/services/jobProcessor.js:
 */

// import { executeZohoProjectsJob } from '../../agents/zoho-projects/test-runner.js';

/**
 * Step 2: Add the job type handler
 *
 * In the processJob function, add this case:
 */

/*
async function processJob(job) {
  job.status = JobStatus.RUNNING;
  job.startedAt = new Date().toISOString();
  log('info', 'job_started', { jobId: job.id, type: job.type });

  try {
    // ... existing job types ...

    // Add this new case for Zoho Projects tests
    if (job.type === 'ZOHO_PROJECTS_TEST') {
      const result = await executeZohoProjectsJob(job.payload);
      job.result = result;
    } else {
      // ... existing default case ...
    }

    job.status = JobStatus.DONE;
    job.completedAt = new Date().toISOString();
    log('info', 'job_done', { jobId: job.id });
  } catch (err) {
    job.status = JobStatus.FAILED;
    job.error = err.message;
    job.completedAt = new Date().toISOString();
    log('error', 'job_failed', { jobId: job.id, error: err.message });
  }
}
*/

/**
 * Step 3: Update VALID_JOB_TYPES
 *
 * In godmode-fixed/backend/routes/jobs.js, add the new type:
 */

// const VALID_JOB_TYPES = ['SCRAPE', 'AUTOMATE', 'SCHEDULE', 'CUSTOM', 'ZOHO_PROJECTS_TEST'];

/**
 * Step 4: Example API Usage
 */

// Example 1: Submit a login test
const loginTestPayload = {
  type: 'ZOHO_PROJECTS_TEST',
  payload: {
    testCase: 'loginTest',
    credentials: {
      email: 'your-email@example.com',
      password: 'your-password'
    }
  }
};

// Example 2: Submit a full workflow test
const workflowTestPayload = {
  type: 'ZOHO_PROJECTS_TEST',
  payload: {
    testCase: 'fullWorkflowTest',
    credentials: {
      email: 'your-email@example.com',
      password: 'your-password'
    },
    options: {
      headless: true,
      keepBrowserOpen: false
    }
  }
};

// Example 3: Submit custom steps
const customStepsPayload = {
  type: 'ZOHO_PROJECTS_TEST',
  payload: {
    testCase: 'customStepTest',
    credentials: {
      email: 'your-email@example.com',
      password: 'your-password'
    }
  }
};

/**
 * Step 5: API Request Examples
 */

// Using curl:
/*
curl -X POST http://localhost:4000/run \
  -H "x-api-key: your-api-key" \
  -H "Content-Type: application/json" \
  -d '{
    "type": "ZOHO_PROJECTS_TEST",
    "payload": {
      "testCase": "loginTest",
      "credentials": {
        "email": "your-email@example.com",
        "password": "your-password"
      }
    }
  }'
*/

// Using JavaScript fetch:
/*
async function runZohoProjectsTest(testCase, credentials) {
  const response = await fetch('http://localhost:4000/run', {
    method: 'POST',
    headers: {
      'x-api-key': 'your-api-key',
      'Content-Type': 'application/json'
    },
    body: JSON.stringify({
      type: 'ZOHO_PROJECTS_TEST',
      payload: {
        testCase,
        credentials
      }
    })
  });

  const { jobId } = await response.json();
  console.log('Job created:', jobId);

  // Poll for completion
  while (true) {
    await new Promise(r => setTimeout(r, 2000));

    const statusResponse = await fetch(`http://localhost:4000/jobs/${jobId}`, {
      headers: { 'x-api-key': 'your-api-key' }
    });

    const job = await statusResponse.json();

    if (job.status === 'DONE' || job.status === 'FAILED') {
      console.log('Test completed:', job);
      return job;
    }
  }
}

// Usage
await runZohoProjectsTest('loginTest', {
  email: 'your-email@example.com',
  password: 'your-password'
});
*/

/**
 * Step 6: Dashboard Integration
 *
 * In the Next.js dashboard, you can create a UI for triggering Zoho tests:
 */

/*
// In godmode-fixed/dashboard/pages/zoho-projects.js

export default function ZohoProjectsPage() {
  const [testCase, setTestCase] = useState('loginTest');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [result, setResult] = useState(null);

  const runTest = async () => {
    const response = await fetch(`${process.env.NEXT_PUBLIC_API_URL}/run`, {
      method: 'POST',
      headers: {
        'x-api-key': process.env.NEXT_PUBLIC_API_KEY,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({
        type: 'ZOHO_PROJECTS_TEST',
        payload: {
          testCase,
          credentials: { email, password }
        }
      })
    });

    const { jobId } = await response.json();

    // Poll for result...
    const finalJob = await pollJobStatus(jobId);
    setResult(finalJob.result);
  };

  return (
    <div>
      <h1>Zoho Projects E2E Tests</h1>
      <select value={testCase} onChange={e => setTestCase(e.target.value)}>
        <option value="loginTest">Login Test</option>
        <option value="createProjectTest">Create Project</option>
        <option value="fullWorkflowTest">Full Workflow</option>
      </select>
      <input type="email" value={email} onChange={e => setEmail(e.target.value)} />
      <input type="password" value={password} onChange={e => setPassword(e.target.value)} />
      <button onClick={runTest}>Run Test</button>
      {result && <pre>{JSON.stringify(result, null, 2)}</pre>}
    </div>
  );
}
*/

/**
 * Step 7: Scheduled Tests
 *
 * You can schedule regular Zoho Projects tests:
 */

/*
// Run tests every day at 9 AM
const scheduledTestPayload = {
  type: 'SCHEDULE',
  payload: {
    cron: '0 9 * * *',
    jobType: 'ZOHO_PROJECTS_TEST',
    jobPayload: {
      testCase: 'fullWorkflowTest',
      credentials: {
        email: process.env.ZOHO_EMAIL,
        password: process.env.ZOHO_PASSWORD
      }
    }
  }
};
*/

export default {
  loginTestPayload,
  workflowTestPayload,
  customStepsPayload
};
