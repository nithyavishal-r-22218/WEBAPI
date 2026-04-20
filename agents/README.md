# Web Application Testing Agents

This directory contains testing agents for automating end-to-end tests for various web applications using the GodMode automation framework.

## 📁 Directory Structure

```
agents/
└── zoho-projects/          # Zoho Projects E2E testing agent
    ├── README.md           # Detailed documentation
    ├── QUICKSTART.md       # Quick start guide
    ├── zoho-projects-e2e-agent.js   # Main agent class
    ├── example-test-cases.js        # Pre-built test cases
    ├── test-runner.js      # Test execution runner
    ├── config.json         # Configuration file
    ├── package.json        # NPM package configuration
    ├── .env.example        # Environment variables template
    └── .gitignore          # Git ignore rules
```

## 🎯 Available Agents

### Zoho Projects E2E Agent

A comprehensive testing agent for Zoho Projects web application.

**Features:**
- Authentication automation
- Project and task management testing
- Performance testing
- Custom step recording
- Screenshot capture
- Integration with GodMode API

**Quick Start:**
```bash
cd agents/zoho-projects
cat QUICKSTART.md  # Read the quick start guide
```

**Documentation:**
- [Full README](./zoho-projects/README.md)
- [Quick Start Guide](./zoho-projects/QUICKSTART.md)

## 🚀 Getting Started

1. Choose an agent (e.g., `zoho-projects`)
2. Navigate to the agent directory
3. Follow the QUICKSTART.md guide
4. Configure your credentials
5. Run your first test

## 🔧 Creating New Agents

To create a new agent for a different web application:

1. Create a new directory: `agents/your-app-name/`
2. Use the Zoho Projects agent as a template
3. Create the following files:
   - `your-app-e2e-agent.js` - Main agent class
   - `example-test-cases.js` - Test cases
   - `test-runner.js` - Test runner
   - `config.json` - Configuration
   - `README.md` - Documentation
   - `.env.example` - Environment template

### Agent Template Structure

```javascript
// your-app-e2e-agent.js
import puppeteer from 'puppeteer';

export class YourAppAgent {
  constructor(config = {}) {
    this.config = config;
    this.browser = null;
    this.page = null;
    this.testResults = [];
  }

  async initialize(options = {}) {
    this.browser = await puppeteer.launch(options);
    this.page = await this.browser.newPage();
  }

  async login(credentials) {
    // Implement login logic
  }

  // Add your custom methods

  async executeSteps(steps) {
    // Execute recorded steps
  }

  logResult(action, status, message) {
    this.testResults.push({ action, status, message });
  }

  getResults() {
    return this.testResults;
  }

  async cleanup() {
    if (this.browser) {
      await this.browser.close();
    }
  }
}
```

## 🔗 Integration with GodMode

All agents can be integrated with the GodMode backend API:

```javascript
// In godmode-fixed/backend/services/jobProcessor.js
import { executeYourAppJob } from '../../agents/your-app/test-runner.js';

if (job.type === 'YOUR_APP_TEST') {
  const result = await executeYourAppJob(job.payload);
  job.result = result;
}
```

Then submit jobs via API:

```bash
curl -X POST http://localhost:4000/run \
  -H "x-api-key: your-api-key" \
  -H "Content-Type: application/json" \
  -d '{
    "type": "YOUR_APP_TEST",
    "payload": {
      "testCase": "testName",
      "credentials": { "email": "...", "password": "..." }
    }
  }'
```

## 📦 Dependencies

Agents use Puppeteer from the GodMode backend:

```bash
cd ../../godmode-fixed/backend
npm install
```

## 🧪 Testing

Each agent can be tested independently:

```bash
cd agents/zoho-projects
node test-runner.js loginTest
```

Or using npm scripts:

```bash
npm run test:login
```

## 📚 Resources

- [GodMode Backend](../godmode-fixed/backend/README.md)
- [GodMode Dashboard](../godmode-fixed/dashboard/README.md)
- [Puppeteer Documentation](https://pptr.dev/)
- [Main Project README](../README.md)

## 🤝 Contributing

To add a new agent or improve existing ones:

1. Create the agent following the template structure
2. Include comprehensive documentation
3. Add example test cases
4. Test thoroughly before committing

## 📝 Best Practices

1. **Never commit credentials** - Use `.env` files (gitignored)
2. **Keep selectors configurable** - Use `config.json`
3. **Add meaningful logs** - Help with debugging
4. **Take screenshots** - Especially on failures
5. **Handle errors gracefully** - Don't crash on single step failures
6. **Write isolated tests** - Each test should be independent
7. **Document everything** - README, comments, examples

## 🐛 Troubleshooting

Common issues across all agents:

- **Selectors not found**: Update in config.json
- **Browser won't launch**: `npx puppeteer browsers install chrome`
- **Timeout errors**: Increase timeouts in config
- **Module errors**: `cd ../../godmode-fixed/backend && npm install`

## 📄 License

Part of the WEBAPI/GodMode automation framework.

---

**Start automating your web application tests today! 🚀**
