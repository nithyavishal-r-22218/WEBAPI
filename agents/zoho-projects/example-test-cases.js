/**
 * Example Test Cases for Zoho Projects E2E Testing
 *
 * This file contains example test case configurations that demonstrate
 * how to use the Zoho Projects E2E Agent.
 */

/**
 * Example 1: Basic Login Test
 */
export const loginTest = {
  id: 'zoho-projects-login-test',
  name: 'Zoho Projects Login Test',
  description: 'Test login functionality for Zoho Projects',
  credentials: {
    email: 'your-email@example.com',
    password: 'your-password',
  },
  steps: async (agent) => {
    // Login is already handled by the agent
    // Add additional verification steps here
    const dashboardExists = await agent.elementExists('.dashboard-container');
    if (!dashboardExists) {
      throw new Error('Dashboard not found after login');
    }
  },
};

/**
 * Example 2: Create Project Test
 */
export const createProjectTest = {
  id: 'zoho-projects-create-project',
  name: 'Create New Project',
  description: 'Test creating a new project in Zoho Projects',
  credentials: {
    email: 'your-email@example.com',
    password: 'your-password',
  },
  steps: async (agent) => {
    await agent.createProject({
      name: `Test Project ${Date.now()}`,
      description: 'This is an automated test project',
    });
  },
};

/**
 * Example 3: Full Workflow Test - Create Project and Add Tasks
 */
export const fullWorkflowTest = {
  id: 'zoho-projects-full-workflow',
  name: 'Full Project Workflow',
  description: 'Create a project and add tasks to it',
  credentials: {
    email: 'your-email@example.com',
    password: 'your-password',
  },
  steps: async (agent) => {
    // Create project
    await agent.createProject({
      name: `E2E Test Project ${Date.now()}`,
      description: 'Automated E2E testing project',
    });

    // Wait for project to be created
    await agent.page.waitForTimeout(2000);

    // Create tasks
    await agent.createTask({
      name: 'Task 1: Setup',
      description: 'Initial setup task',
      priority: 'High',
    });

    await agent.createTask({
      name: 'Task 2: Development',
      description: 'Development phase task',
      priority: 'Medium',
    });

    await agent.createTask({
      name: 'Task 3: Testing',
      description: 'Testing phase task',
      priority: 'High',
    });

    // Take screenshot of the project
    await agent.takeScreenshot('project-with-tasks.png');
  },
};

/**
 * Example 4: Custom Step-by-Step Test
 * Using recorded actions format compatible with GodMode
 */
export const customStepTest = {
  id: 'zoho-projects-custom-steps',
  name: 'Custom Step Test',
  description: 'Execute custom recorded steps',
  credentials: {
    email: 'your-email@example.com',
    password: 'your-password',
  },
  steps: [
    {
      action: 'navigate',
      url: 'https://projects.zoho.com',
    },
    {
      action: 'click',
      selector: '#new-project-btn',
    },
    {
      action: 'input',
      selector: '#project-name',
      value: 'My New Project',
    },
    {
      action: 'input',
      selector: '#project-description',
      value: 'Project description goes here',
    },
    {
      action: 'click',
      selector: '#create-project-btn',
    },
    {
      action: 'wait',
      duration: 2000,
    },
    {
      action: 'screenshot',
      filename: 'project-created.png',
    },
  ],
};

/**
 * Example 5: Search and Verify Test
 */
export const searchProjectTest = {
  id: 'zoho-projects-search',
  name: 'Search Project Test',
  description: 'Search for a project and verify it exists',
  credentials: {
    email: 'your-email@example.com',
    password: 'your-password',
  },
  steps: async (agent) => {
    // Navigate to projects list
    await agent.page.goto(`${agent.config.baseUrl}/`, {
      waitUntil: 'networkidle2',
    });

    // Search for a project
    const searchSelector = '#project-search-input';
    if (await agent.elementExists(searchSelector)) {
      await agent.page.type(searchSelector, 'Test Project');
      await agent.page.keyboard.press('Enter');
      await agent.page.waitForTimeout(2000);

      // Verify search results
      const resultsExist = await agent.elementExists('.search-results');
      if (resultsExist) {
        agent.logResult('search', 'success', 'Search results found');
      } else {
        agent.logResult('search', 'failure', 'No search results found');
      }
    }
  },
};

/**
 * Example 6: Batch Test Suite
 * Multiple tests to run sequentially
 */
export const batchTestSuite = {
  id: 'zoho-projects-batch-suite',
  name: 'Batch Test Suite',
  description: 'Run multiple tests in sequence',
  credentials: {
    email: 'your-email@example.com',
    password: 'your-password',
  },
  tests: [
    {
      name: 'Navigate to Dashboard',
      run: async (agent) => {
        await agent.page.goto(`${agent.config.baseUrl}/`, {
          waitUntil: 'networkidle2',
        });
        agent.logResult('navigation', 'success', 'Navigated to dashboard');
      },
    },
    {
      name: 'Verify User Profile',
      run: async (agent) => {
        const profileExists = await agent.elementExists('.user-profile');
        if (profileExists) {
          agent.logResult('profile_check', 'success', 'User profile found');
        } else {
          throw new Error('User profile not found');
        }
      },
    },
    {
      name: 'Check Projects List',
      run: async (agent) => {
        const projectsList = await agent.elementExists('.projects-list');
        if (projectsList) {
          agent.logResult('projects_list', 'success', 'Projects list displayed');
        }
      },
    },
  ],
};

/**
 * Example 7: Performance Test
 * Measure page load times
 */
export const performanceTest = {
  id: 'zoho-projects-performance',
  name: 'Performance Test',
  description: 'Measure page load performance',
  credentials: {
    email: 'your-email@example.com',
    password: 'your-password',
  },
  steps: async (agent) => {
    const startTime = Date.now();

    await agent.page.goto(`${agent.config.baseUrl}/`, {
      waitUntil: 'networkidle2',
    });

    const loadTime = Date.now() - startTime;

    agent.logResult('performance', 'success', `Page loaded in ${loadTime}ms`);

    if (loadTime > 5000) {
      agent.logResult('performance', 'warning', 'Page load time exceeded 5 seconds');
    }

    // Measure navigation to project
    const navStartTime = Date.now();
    await agent.page.click('.projects-list .project-item:first-child');
    await agent.page.waitForNavigation({ waitUntil: 'networkidle2' });
    const navTime = Date.now() - navStartTime;

    agent.logResult('navigation_performance', 'success', `Navigation took ${navTime}ms`);
  },
};

/**
 * Export all test cases
 */
export const allTestCases = {
  loginTest,
  createProjectTest,
  fullWorkflowTest,
  customStepTest,
  searchProjectTest,
  batchTestSuite,
  performanceTest,
};

export default allTestCases;
