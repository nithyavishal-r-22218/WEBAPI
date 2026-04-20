# Quick Start Guide - Zoho Projects E2E Testing Agent

This guide will help you get started with testing Zoho Projects in under 5 minutes.

## Prerequisites

✅ Node.js 16+ installed
✅ Chrome browser installed
✅ Zoho Projects account (for testing)

## Step 1: Configure Your Credentials

1. Navigate to the agent directory:
   ```bash
   cd agents/zoho-projects
   ```

2. Copy the environment template:
   ```bash
   cp .env.example .env
   ```

3. Edit `.env` and add your Zoho credentials:
   ```bash
   ZOHO_EMAIL=your-email@example.com
   ZOHO_PASSWORD=your-password
   ```

## Step 2: Update Selectors (IMPORTANT!)

The template includes placeholder selectors. You need to update them:

1. Open Zoho Projects in Chrome: https://projects.zoho.com
2. Login to your account
3. Open Chrome DevTools (F12)
4. Inspect elements and find actual selectors
5. Update `config.json` with the correct selectors

**Example:** Finding the "New Project" button selector:
- Right-click the button → Inspect
- Look for `id`, `class`, or `data-*` attributes
- Update in config.json:
  ```json
  "newProjectButton": "#actual-button-id"
  ```

## Step 3: Install Dependencies

The agent uses Puppeteer from the GodMode backend:

```bash
cd ../../godmode-fixed/backend
npm install
cd ../../agents/zoho-projects
```

## Step 4: Run Your First Test

### Option A: Run a simple login test

```bash
node test-runner.js loginTest
```

This will:
1. Launch a Chrome browser
2. Navigate to Zoho login page
3. Enter your credentials
4. Login to Zoho Projects
5. Verify successful login
6. Show results

### Option B: Use npm scripts

```bash
npm run test:login
```

### Option C: Run multiple tests

```bash
node test-runner.js loginTest searchProjectTest
```

## Step 5: Create Your First Custom Test

Edit `example-test-cases.js` and add:

```javascript
export const myFirstTest = {
  id: 'my-first-test',
  name: 'My First Test',
  description: 'Testing project dashboard',
  credentials: {
    email: process.env.ZOHO_EMAIL,
    password: process.env.ZOHO_PASSWORD,
  },
  steps: async (agent) => {
    // Navigate to dashboard
    await agent.page.goto('https://projects.zoho.com/', {
      waitUntil: 'networkidle2',
    });

    // Take a screenshot
    await agent.takeScreenshot('dashboard.png');

    // Verify an element exists
    const projectsListExists = await agent.elementExists('.projects-list');

    if (projectsListExists) {
      agent.logResult('dashboard_check', 'success', 'Dashboard loaded successfully');
    } else {
      agent.logResult('dashboard_check', 'failure', 'Projects list not found');
    }
  },
};
```

Then run it:
```bash
node test-runner.js myFirstTest
```

## Common Commands

```bash
# Run specific test
node test-runner.js loginTest

# Run multiple tests
node test-runner.js loginTest createProjectTest

# Run with environment variables
HEADLESS=true node test-runner.js loginTest

# Keep browser open after test
KEEP_BROWSER_OPEN=true node test-runner.js loginTest
```

## Troubleshooting First Run

### Issue: "Element not found"
**Solution:** Update selectors in `config.json` to match actual Zoho UI

### Issue: "Login failed"
**Solution:**
- Verify credentials in `.env`
- Check if 2FA is enabled (disable for test accounts)
- Update login selectors in config

### Issue: "Browser won't launch"
**Solution:**
```bash
# Install Chrome for Puppeteer
npx puppeteer browsers install chrome
```

### Issue: "Module not found"
**Solution:**
```bash
cd ../../godmode-fixed/backend
npm install
```

## Next Steps

1. ✅ Review `README.md` for detailed documentation
2. ✅ Explore `example-test-cases.js` for more examples
3. ✅ Create your own test cases
4. ✅ Integrate with GodMode API (see README.md)

## Getting Help

- 📖 Read the full [README.md](./README.md)
- 🔍 Check the [Troubleshooting section](./README.md#troubleshooting)
- 💻 Run tests with `HEADLESS=false` to see what's happening
- 📸 Take screenshots to debug: `await agent.takeScreenshot('debug.png')`

---

**You're all set! Happy testing! 🚀**
