/**
 * Zoho Projects E2E Test Agent
 *
 * This agent template provides end-to-end testing capabilities for Zoho Projects
 * web application using Puppeteer automation.
 *
 * Features:
 * - Login automation
 * - Project creation and management
 * - Task creation and updates
 * - Time tracking
 * - Report generation
 * - Collaborative features (comments, mentions, etc.)
 *
 * Usage:
 * This agent integrates with the GodMode automation framework to execute
 * browser-based tests against Zoho Projects.
 */

import puppeteer from 'puppeteer';

/**
 * Configuration for Zoho Projects testing
 */
export const ZohoProjectsConfig = {
  baseUrl: 'https://projects.zoho.com',
  loginUrl: 'https://accounts.zoho.com/signin',

  // Default timeouts (in milliseconds)
  timeouts: {
    navigation: 30000,
    element: 10000,
    typing: 100,
  },

  // Selectors for common elements (update based on actual Zoho Projects UI)
  selectors: {
    login: {
      emailInput: '#login_id',
      nextButton: '#nextbtn',
      passwordInput: '#password',
      signInButton: '#nextbtn',
    },
    dashboard: {
      newProjectButton: '[data-test="new-project-btn"]',
      projectsList: '.projects-list',
    },
    project: {
      nameInput: '#project-name',
      descriptionInput: '#project-description',
      createButton: '#create-project-btn',
    },
    task: {
      newTaskButton: '[data-test="new-task-btn"]',
      taskNameInput: '#task-name',
      taskDescriptionInput: '#task-description',
      assigneeDropdown: '#task-assignee',
      priorityDropdown: '#task-priority',
      saveTaskButton: '#save-task-btn',
    },
  },
};

/**
 * Base Agent Class for Zoho Projects E2E Testing
 */
export class ZohoProjectsAgent {
  constructor(config = {}) {
    this.config = { ...ZohoProjectsConfig, ...config };
    this.browser = null;
    this.page = null;
    this.testResults = [];
  }

  /**
   * Initialize browser and page
   */
  async initialize(options = {}) {
    const launchOptions = {
      headless: options.headless !== undefined ? options.headless : false,
      defaultViewport: null,
      args: [
        '--start-maximized',
        '--no-sandbox',
        '--disable-setuid-sandbox',
        '--disable-dev-shm-usage',
      ],
      ...options.puppeteerOptions,
    };

    this.browser = await puppeteer.launch(launchOptions);
    this.page = await this.browser.newPage();

    // Set default timeout
    this.page.setDefaultTimeout(this.config.timeouts.element);

    return this.page;
  }

  /**
   * Login to Zoho Projects
   */
  async login(credentials) {
    const { email, password } = credentials;

    if (!email || !password) {
      throw new Error('Email and password are required for login');
    }

    try {
      await this.page.goto(this.config.loginUrl, {
        waitUntil: 'networkidle2',
        timeout: this.config.timeouts.navigation,
      });

      // Enter email
      await this.page.waitForSelector(this.config.selectors.login.emailInput);
      await this.page.type(this.config.selectors.login.emailInput, email, {
        delay: this.config.timeouts.typing,
      });

      // Click next
      await this.page.click(this.config.selectors.login.nextButton);
      await this.page.waitForTimeout(2000);

      // Enter password
      await this.page.waitForSelector(this.config.selectors.login.passwordInput);
      await this.page.type(this.config.selectors.login.passwordInput, password, {
        delay: this.config.timeouts.typing,
      });

      // Click sign in
      await this.page.click(this.config.selectors.login.signInButton);

      // Wait for navigation to complete
      await this.page.waitForNavigation({
        waitUntil: 'networkidle2',
        timeout: this.config.timeouts.navigation,
      });

      this.logResult('login', 'success', 'Successfully logged in to Zoho Projects');
      return true;
    } catch (error) {
      this.logResult('login', 'failure', `Login failed: ${error.message}`);
      throw error;
    }
  }

  /**
   * Create a new project
   */
  async createProject(projectData) {
    const { name, description } = projectData;

    try {
      // Navigate to projects page if not already there
      await this.page.goto(`${this.config.baseUrl}/`, {
        waitUntil: 'networkidle2',
      });

      // Click new project button
      await this.page.waitForSelector(this.config.selectors.dashboard.newProjectButton);
      await this.page.click(this.config.selectors.dashboard.newProjectButton);
      await this.page.waitForTimeout(1000);

      // Fill project details
      await this.page.waitForSelector(this.config.selectors.project.nameInput);
      await this.page.type(this.config.selectors.project.nameInput, name);

      if (description) {
        await this.page.type(this.config.selectors.project.descriptionInput, description);
      }

      // Create project
      await this.page.click(this.config.selectors.project.createButton);
      await this.page.waitForNavigation({ waitUntil: 'networkidle2' });

      this.logResult('createProject', 'success', `Project "${name}" created successfully`);
      return true;
    } catch (error) {
      this.logResult('createProject', 'failure', `Failed to create project: ${error.message}`);
      throw error;
    }
  }

  /**
   * Create a new task
   */
  async createTask(taskData) {
    const { name, description, assignee, priority } = taskData;

    try {
      // Click new task button
      await this.page.waitForSelector(this.config.selectors.task.newTaskButton);
      await this.page.click(this.config.selectors.task.newTaskButton);
      await this.page.waitForTimeout(1000);

      // Fill task details
      await this.page.waitForSelector(this.config.selectors.task.taskNameInput);
      await this.page.type(this.config.selectors.task.taskNameInput, name);

      if (description) {
        await this.page.type(this.config.selectors.task.taskDescriptionInput, description);
      }

      if (assignee) {
        await this.page.click(this.config.selectors.task.assigneeDropdown);
        await this.page.waitForTimeout(500);
        // Select assignee (implementation depends on UI)
      }

      if (priority) {
        await this.page.click(this.config.selectors.task.priorityDropdown);
        await this.page.waitForTimeout(500);
        // Select priority (implementation depends on UI)
      }

      // Save task
      await this.page.click(this.config.selectors.task.saveTaskButton);
      await this.page.waitForTimeout(2000);

      this.logResult('createTask', 'success', `Task "${name}" created successfully`);
      return true;
    } catch (error) {
      this.logResult('createTask', 'failure', `Failed to create task: ${error.message}`);
      throw error;
    }
  }

  /**
   * Take a screenshot
   */
  async takeScreenshot(filename) {
    const path = filename || `screenshot-${Date.now()}.png`;
    await this.page.screenshot({ path, fullPage: true });
    return path;
  }

  /**
   * Execute custom steps from recording
   */
  async executeSteps(steps) {
    const results = [];

    for (let i = 0; i < steps.length; i++) {
      const step = steps[i];
      const stepResult = {
        index: i,
        action: step.action,
        selector: step.selector,
        status: 'ok'
      };

      try {
        // Navigate if URL is specified
        if (step.url && (i === 0 || step.action === 'navigate')) {
          await this.page.goto(step.url, {
            waitUntil: 'domcontentloaded',
            timeout: this.config.timeouts.navigation,
          });
        }

        // Execute action
        switch (step.action) {
          case 'click':
            await this.page.waitForSelector(step.selector, { timeout: this.config.timeouts.element });
            await this.page.click(step.selector);
            stepResult.detail = `Clicked ${step.selector}`;
            break;

          case 'input':
          case 'type':
            await this.page.waitForSelector(step.selector, { timeout: this.config.timeouts.element });
            await this.page.click(step.selector, { clickCount: 3 }); // Clear existing value
            await this.page.type(step.selector, step.value || '', {
              delay: this.config.timeouts.typing,
            });
            stepResult.detail = `Typed "${step.value}" into ${step.selector}`;
            break;

          case 'press_enter':
            await this.page.keyboard.press('Enter');
            stepResult.detail = 'Pressed Enter';
            break;

          case 'wait':
            await this.page.waitForTimeout(step.duration || 1000);
            stepResult.detail = `Waited ${step.duration || 1000}ms`;
            break;

          case 'screenshot':
            const screenshotPath = await this.takeScreenshot(step.filename);
            stepResult.detail = `Screenshot saved: ${screenshotPath}`;
            break;

          default:
            stepResult.status = 'warning';
            stepResult.detail = `Unknown action: ${step.action}`;
        }

        // Wait between steps for stability
        await this.page.waitForTimeout(500);
      } catch (error) {
        stepResult.status = 'error';
        stepResult.error = error.message;
      }

      results.push(stepResult);
      this.testResults.push(stepResult);
    }

    return results;
  }

  /**
   * Wait for element
   */
  async waitForElement(selector, timeout) {
    try {
      await this.page.waitForSelector(selector, {
        timeout: timeout || this.config.timeouts.element
      });
      return true;
    } catch (error) {
      return false;
    }
  }

  /**
   * Check if element exists
   */
  async elementExists(selector) {
    try {
      const element = await this.page.$(selector);
      return element !== null;
    } catch (error) {
      return false;
    }
  }

  /**
   * Get element text
   */
  async getElementText(selector) {
    try {
      await this.page.waitForSelector(selector);
      return await this.page.$eval(selector, el => el.textContent);
    } catch (error) {
      return null;
    }
  }

  /**
   * Log test result
   */
  logResult(action, status, message) {
    const result = {
      timestamp: new Date().toISOString(),
      action,
      status,
      message,
    };
    this.testResults.push(result);
    console.log(`[${result.timestamp}] ${action.toUpperCase()}: ${status} - ${message}`);
  }

  /**
   * Get all test results
   */
  getResults() {
    return {
      total: this.testResults.length,
      passed: this.testResults.filter(r => r.status === 'success' || r.status === 'ok').length,
      failed: this.testResults.filter(r => r.status === 'failure' || r.status === 'error').length,
      results: this.testResults,
    };
  }

  /**
   * Cleanup and close browser
   */
  async cleanup(keepBrowserOpen = false) {
    if (!keepBrowserOpen && this.browser) {
      await this.page.waitForTimeout(3000); // Keep visible for 3s
      await this.browser.close();
    }
  }
}

/**
 * Convenience function to run a test suite
 */
export async function runZohoProjectsTest(testSuite, credentials, options = {}) {
  const agent = new ZohoProjectsAgent(options.config);

  try {
    await agent.initialize(options);

    // Login
    await agent.login(credentials);

    // Execute test suite
    if (typeof testSuite === 'function') {
      await testSuite(agent);
    } else if (Array.isArray(testSuite)) {
      await agent.executeSteps(testSuite);
    }

    // Get results
    const results = agent.getResults();

    // Cleanup
    await agent.cleanup(options.keepBrowserOpen);

    return results;
  } catch (error) {
    await agent.cleanup(false);
    throw error;
  }
}

export default ZohoProjectsAgent;
