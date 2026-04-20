# Zoho Projects E2E Test Agent

A comprehensive end-to-end testing template for Zoho Projects web application, built on top of the GodMode automation framework using Puppeteer.

## 📋 Table of Contents

- [Overview](#overview)
- [Features](#features)
- [Installation](#installation)
- [Configuration](#configuration)
- [Usage](#usage)
- [Test Cases](#test-cases)
- [Integration with GodMode](#integration-with-godmode)
- [API Reference](#api-reference)
- [Examples](#examples)
- [Troubleshooting](#troubleshooting)

## 🎯 Overview

This agent template provides a complete framework for automating end-to-end tests for Zoho Projects. It includes:

- Pre-built test scenarios for common workflows
- Customizable test case templates
- Integration with GodMode automation backend
- Screenshot and reporting capabilities
- Configurable selectors and timeouts

## ✨ Features

- **🔐 Authentication**: Automated login to Zoho Projects
- **📊 Project Management**: Create, search, and manage projects
- **✅ Task Management**: Create and manage tasks with priorities and assignments
- **📸 Screenshots**: Capture screenshots at any point in tests
- **⚡ Performance Testing**: Measure page load and navigation times
- **🔄 Step Recording**: Execute recorded browser actions
- **📈 Reporting**: Detailed test results with pass/fail metrics
- **🎨 Customizable**: Easy to extend with new test cases

## 📦 Installation

### Prerequisites

- Node.js 16+
- npm or yarn
- Chrome/Chromium browser
- GodMode backend (optional, for API integration)

### Setup

1. **Navigate to the agents directory:**
   ```bash
   cd /home/runner/work/WEBAPI/WEBAPI/agents/zoho-projects
   ```

2. **The agent uses Puppeteer from the parent backend:**
   ```bash
   cd ../../godmode-fixed/backend
   npm install
   ```

3. **Configure environment variables:**
   ```bash
   # Create a .env file in the agents/zoho-projects directory
   cp .env.example .env

   # Edit .env and set your credentials:
   ZOHO_EMAIL=your-email@example.com
   ZOHO_PASSWORD=your-password
   HEADLESS=false
   KEEP_BROWSER_OPEN=false
   ```

## ⚙️ Configuration

### Config File (`config.json`)

The `config.json` file contains all configuration options:

```json
{
  "zohoProjects": {
    "baseUrl": "https://projects.zoho.com",
    "timeouts": {
      "navigation": 30000,
      "element": 10000
    },
    "selectors": {
      // Update these based on actual Zoho Projects UI
      "login": { ... },
      "dashboard": { ... },
      "project": { ... }
    }
  }
}
```

**Important**: The selectors in the config are placeholders. You need to update them based on the actual Zoho Projects UI elements.

### Updating Selectors

1. Open Zoho Projects in Chrome
2. Right-click elements and select "Inspect"
3. Copy the correct CSS selectors
4. Update `config.json` with actual selectors

## 🚀 Usage

### Method 1: Standalone Execution

Run tests directly using the test runner:

```bash
# Run specific test
node test-runner.js loginTest

# Run multiple tests
node test-runner.js loginTest createProjectTest

# Run all tests in a suite
TESTS=loginTest,createProjectTest,fullWorkflowTest node test-runner.js
```

### Method 2: Programmatic Usage

```javascript
import ZohoProjectsAgent from './zoho-projects-e2e-agent.js';

const agent = new ZohoProjectsAgent();

await agent.initialize({ headless: false });

await agent.login({
  email: 'your-email@example.com',
  password: 'your-password'
});

await agent.createProject({
  name: 'My Project',
  description: 'Test project'
});

const results = agent.getResults();
console.log(results);

await agent.cleanup();
```

### Method 3: Integration with GodMode Backend

Create a custom job type in the GodMode backend:

```javascript
// In godmode-fixed/backend/services/jobProcessor.js

import { executeZohoProjectsJob } from '../../agents/zoho-projects/test-runner.js';

// Add to processJob function:
if (job.type === 'ZOHO_PROJECTS_TEST') {
  const result = await executeZohoProjectsJob(job.payload);
  job.result = result;
}
```

Then submit jobs via API:

```bash
curl -X POST http://localhost:4000/run \
  -H "x-api-key: your-api-key" \
  -H "Content-Type: application/json" \
  -d '{
    "type": "ZOHO_PROJECTS_TEST",
    "payload": {
      "testCase": "fullWorkflowTest",
      "credentials": {
        "email": "your-email@example.com",
        "password": "your-password"
      }
    }
  }'
```

## 📝 Test Cases

### Available Test Cases

1. **loginTest**: Basic login functionality test
2. **createProjectTest**: Create a new project
3. **fullWorkflowTest**: Complete workflow (create project + tasks)
4. **customStepTest**: Execute custom recorded steps
5. **searchProjectTest**: Search and verify projects
6. **batchTestSuite**: Run multiple tests in sequence
7. **performanceTest**: Measure page load performance

### Creating Custom Test Cases

Create a new test in `example-test-cases.js`:

```javascript
export const myCustomTest = {
  id: 'my-custom-test',
  name: 'My Custom Test',
  description: 'Description of what this test does',
  credentials: {
    email: 'your-email@example.com',
    password: 'your-password',
  },
  steps: async (agent) => {
    // Your test logic here
    await agent.page.goto('https://projects.zoho.com/portal/...');

    // Use agent methods
    await agent.waitForElement('.my-selector');
    const text = await agent.getElementText('.my-element');

    // Log results
    agent.logResult('my_action', 'success', 'Action completed');
  },
};
```

### Recording Custom Steps

You can also define tests as step arrays compatible with the GodMode Chrome extension:

```javascript
export const recordedTest = {
  id: 'recorded-test',
  name: 'Recorded Test',
  steps: [
    { action: 'navigate', url: 'https://projects.zoho.com' },
    { action: 'click', selector: '#new-project-btn' },
    { action: 'input', selector: '#project-name', value: 'Test Project' },
    { action: 'click', selector: '#create-btn' },
    { action: 'screenshot', filename: 'result.png' }
  ]
};
```

## 🔧 API Reference

### ZohoProjectsAgent Class

#### Methods

##### `initialize(options)`
Initialize browser and page.

```javascript
await agent.initialize({
  headless: false,
  puppeteerOptions: { slowMo: 50 }
});
```

##### `login(credentials)`
Login to Zoho Projects.

```javascript
await agent.login({
  email: 'user@example.com',
  password: 'password'
});
```

##### `createProject(projectData)`
Create a new project.

```javascript
await agent.createProject({
  name: 'Project Name',
  description: 'Project Description'
});
```

##### `createTask(taskData)`
Create a new task.

```javascript
await agent.createTask({
  name: 'Task Name',
  description: 'Task Description',
  assignee: 'user@example.com',
  priority: 'High'
});
```

##### `executeSteps(steps)`
Execute an array of recorded steps.

```javascript
await agent.executeSteps([
  { action: 'click', selector: '.button' },
  { action: 'input', selector: '#field', value: 'text' }
]);
```

##### `takeScreenshot(filename)`
Capture a screenshot.

```javascript
await agent.takeScreenshot('my-screenshot.png');
```

##### `waitForElement(selector, timeout)`
Wait for an element to appear.

```javascript
await agent.waitForElement('.loading-complete', 5000);
```

##### `elementExists(selector)`
Check if an element exists.

```javascript
const exists = await agent.elementExists('.error-message');
```

##### `getElementText(selector)`
Get text content of an element.

```javascript
const text = await agent.getElementText('.page-title');
```

##### `logResult(action, status, message)`
Log a test result.

```javascript
agent.logResult('custom_action', 'success', 'Action completed successfully');
```

##### `getResults()`
Get all test results.

```javascript
const results = agent.getResults();
// { total: 5, passed: 4, failed: 1, results: [...] }
```

##### `cleanup(keepBrowserOpen)`
Close browser and cleanup.

```javascript
await agent.cleanup(false);
```

## 📚 Examples

### Example 1: Simple Login Test

```javascript
import ZohoProjectsAgent from './zoho-projects-e2e-agent.js';

const agent = new ZohoProjectsAgent();

await agent.initialize();
await agent.login({
  email: process.env.ZOHO_EMAIL,
  password: process.env.ZOHO_PASSWORD
});

await agent.takeScreenshot('logged-in.png');
await agent.cleanup();
```

### Example 2: Create Project with Tasks

```javascript
const agent = new ZohoProjectsAgent();

await agent.initialize();
await agent.login({ email: '...', password: '...' });

await agent.createProject({
  name: 'Q1 Planning',
  description: 'First quarter planning project'
});

await agent.createTask({ name: 'Task 1', priority: 'High' });
await agent.createTask({ name: 'Task 2', priority: 'Medium' });

const results = agent.getResults();
console.log(`Created ${results.passed} items successfully`);

await agent.cleanup();
```

### Example 3: Using with GodMode API

```javascript
// Submit a job to GodMode backend
const response = await fetch('http://localhost:4000/run', {
  method: 'POST',
  headers: {
    'x-api-key': 'your-api-key',
    'Content-Type': 'application/json'
  },
  body: JSON.stringify({
    type: 'ZOHO_PROJECTS_TEST',
    payload: {
      testCase: 'fullWorkflowTest',
      credentials: {
        email: 'user@example.com',
        password: 'password'
      }
    }
  })
});

const { jobId } = await response.json();

// Check job status
const statusResponse = await fetch(`http://localhost:4000/jobs/${jobId}`, {
  headers: { 'x-api-key': 'your-api-key' }
});

const job = await statusResponse.json();
console.log(job.status); // QUEUED, RUNNING, DONE, or FAILED
```

## 🐛 Troubleshooting

### Common Issues

#### 1. Selectors Not Found

**Problem**: Elements are not being found during test execution.

**Solution**:
- Update selectors in `config.json` to match actual Zoho Projects UI
- Use browser DevTools to inspect elements
- Add `await agent.page.waitForTimeout(1000)` before actions if timing issues occur

#### 2. Login Failures

**Problem**: Login is not working.

**Solution**:
- Verify credentials are correct
- Check if Zoho has changed their login flow
- Update login selectors in config
- Disable 2FA for test accounts if possible

#### 3. Tests Timing Out

**Problem**: Tests are timing out.

**Solution**:
- Increase timeouts in `config.json`
- Check network connectivity
- Use `headless: false` to see what's happening
- Add more `waitForTimeout` calls between actions

#### 4. Browser Not Launching

**Problem**: Puppeteer fails to launch browser.

**Solution**:
- Install Chrome/Chromium: `npx puppeteer browsers install chrome`
- Add `--no-sandbox` flag (already included)
- Check system dependencies

### Debug Mode

Run tests with debug output:

```bash
DEBUG=true HEADLESS=false node test-runner.js loginTest
```

## 🤝 Contributing

To add new test cases or improve the agent:

1. Add new test cases to `example-test-cases.js`
2. Update selectors in `config.json` as UI changes
3. Extend `ZohoProjectsAgent` class with new methods
4. Document your changes in this README

## 📄 License

This template is part of the WEBAPI/GodMode automation framework.

## 🔗 Related Documentation

- [GodMode Backend Documentation](../../godmode-fixed/README.md)
- [Main Project README](../../README.md)
- [Puppeteer Documentation](https://pptr.dev/)

## 💡 Tips

1. **Always verify selectors**: Zoho may update their UI, breaking selectors
2. **Use meaningful test names**: Makes debugging easier
3. **Take screenshots**: Helpful for understanding failures
4. **Keep tests isolated**: Each test should clean up after itself
5. **Use environment variables**: Don't hardcode credentials
6. **Test incrementally**: Start with simple tests, build complexity

## 📞 Support

For issues or questions:
- Check the troubleshooting section
- Review example test cases
- Inspect browser console during tests (headless: false)
- Check GodMode backend logs

---

**Happy Testing! 🚀**
