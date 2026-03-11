/**
 * Zoho Projects Test Runner
 *
 * This script runs Zoho Projects E2E tests and integrates with the GodMode backend.
 * It can be used standalone or integrated into the automation framework.
 */

import ZohoProjectsAgent from './zoho-projects-e2e-agent.js';
import * as testCases from './example-test-cases.js';

/**
 * Test Runner Configuration
 */
const config = {
  // Load credentials from environment variables or config
  credentials: {
    email: process.env.ZOHO_EMAIL || 'your-email@example.com',
    password: process.env.ZOHO_PASSWORD || 'your-password',
  },

  // Agent options
  agentOptions: {
    headless: process.env.HEADLESS === 'true',
    keepBrowserOpen: process.env.KEEP_BROWSER_OPEN === 'true',
  },

  // Which tests to run (if not specified via CLI)
  testsToRun: process.env.TESTS ? process.env.TESTS.split(',') : ['loginTest'],
};

/**
 * Run a single test case
 */
async function runTestCase(testCase, credentials, options = {}) {
  const agent = new ZohoProjectsAgent(options.config);

  try {
    console.log(`\n${'='.repeat(60)}`);
    console.log(`Running Test: ${testCase.name}`);
    console.log(`Description: ${testCase.description}`);
    console.log('='.repeat(60));

    // Initialize agent
    await agent.initialize(options);

    // Login
    console.log('\nLogging in...');
    await agent.login(credentials);

    // Execute test steps
    console.log('\nExecuting test steps...');
    if (typeof testCase.steps === 'function') {
      await testCase.steps(agent);
    } else if (Array.isArray(testCase.steps)) {
      await agent.executeSteps(testCase.steps);
    } else if (testCase.tests && Array.isArray(testCase.tests)) {
      // Batch test suite
      for (const test of testCase.tests) {
        console.log(`\n  Running: ${test.name}`);
        await test.run(agent);
      }
    }

    // Get results
    const results = agent.getResults();

    console.log('\n' + '-'.repeat(60));
    console.log('Test Results:');
    console.log(`  Total: ${results.total}`);
    console.log(`  Passed: ${results.passed}`);
    console.log(`  Failed: ${results.failed}`);
    console.log('-'.repeat(60));

    // Cleanup
    await agent.cleanup(options.keepBrowserOpen);

    return {
      testId: testCase.id,
      testName: testCase.name,
      success: results.failed === 0,
      results,
    };
  } catch (error) {
    console.error(`\n❌ Test failed with error: ${error.message}`);
    await agent.cleanup(false);

    return {
      testId: testCase.id,
      testName: testCase.name,
      success: false,
      error: error.message,
      results: agent.getResults(),
    };
  }
}

/**
 * Run multiple test cases
 */
async function runMultipleTests(testNames, credentials, options = {}) {
  const results = [];

  for (const testName of testNames) {
    const testCase = testCases[testName];

    if (!testCase) {
      console.error(`⚠️  Test case "${testName}" not found. Skipping...`);
      continue;
    }

    const result = await runTestCase(
      testCase,
      credentials || testCase.credentials,
      options
    );

    results.push(result);
  }

  return results;
}

/**
 * Main execution function
 */
async function main() {
  console.log('🚀 Zoho Projects E2E Test Runner');
  console.log('='.repeat(60));

  const args = process.argv.slice(2);
  const testsToRun = args.length > 0 ? args : config.testsToRun;

  console.log(`\nTests to run: ${testsToRun.join(', ')}`);

  const allResults = await runMultipleTests(
    testsToRun,
    config.credentials,
    config.agentOptions
  );

  // Summary
  console.log('\n' + '='.repeat(60));
  console.log('FINAL SUMMARY');
  console.log('='.repeat(60));

  const totalTests = allResults.length;
  const passedTests = allResults.filter(r => r.success).length;
  const failedTests = totalTests - passedTests;

  console.log(`\nTotal Tests: ${totalTests}`);
  console.log(`Passed: ${passedTests} ✅`);
  console.log(`Failed: ${failedTests} ❌`);

  if (failedTests > 0) {
    console.log('\nFailed Tests:');
    allResults
      .filter(r => !r.success)
      .forEach(r => {
        console.log(`  - ${r.testName}: ${r.error || 'See details above'}`);
      });
  }

  console.log('\n' + '='.repeat(60));

  // Exit with appropriate code
  process.exit(failedTests > 0 ? 1 : 0);
}

/**
 * Export for use in GodMode backend
 */
export async function executeZohoProjectsJob(jobPayload) {
  const {
    testCase,
    credentials,
    options = {},
  } = jobPayload;

  if (!testCase) {
    throw new Error('testCase is required in job payload');
  }

  // Find test case by ID or name
  let test = testCases[testCase];
  if (!test) {
    test = Object.values(testCases).find(
      t => t.id === testCase || t.name === testCase
    );
  }

  if (!test) {
    throw new Error(`Test case "${testCase}" not found`);
  }

  return await runTestCase(test, credentials || config.credentials, options);
}

// Run if executed directly
if (import.meta.url === `file://${process.argv[1]}`) {
  main().catch(error => {
    console.error('Fatal error:', error);
    process.exit(1);
  });
}

export { runTestCase, runMultipleTests };
