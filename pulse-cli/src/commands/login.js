const open = require('open');
const chalk = require('chalk');
const ora = require('ora');
const { initiateDeviceAuth, pollForToken } = require('../api');
const { saveSessionToken } = require('../config');

async function loginCommand() {
  console.log(chalk.blue('\n🔐 Pulse CLI Login\n'));

  const spinner = ora('Initiating authentication...').start();

  try {
    // Step 1: Initiate device authorization
    const authData = await initiateDeviceAuth();
    spinner.stop();

    // Step 2: Display user code and verification URL
    console.log(chalk.green('✓ Authentication initiated\n'));
    console.log(chalk.bold('Please complete authentication in your browser:\n'));
    console.log(chalk.cyan(`  Verification URL: ${authData.verificationUrl}`));
    console.log(chalk.yellow(`  User Code: ${chalk.bold(authData.userCode)}\n`));
    console.log(chalk.dim('Opening browser...'));

    // Open browser
    await open(authData.verificationUrl);

    // Step 3: Poll for completion
    console.log(chalk.dim('\nWaiting for authentication...'));
    const pollSpinner = ora('Checking authorization status...').start();

    let attempts = 0;
    const maxAttempts = 60; // 5 minutes with 5-second intervals
    let token = null;
    let expiresAt = null;

    while (attempts < maxAttempts) {
      await sleep(5000); // Wait 5 seconds between polls

      try {
        const result = await pollForToken(authData.deviceCode);

        if (result.pending) {
          attempts++;
          continue;
        }

        if (result.token) {
          token = result.token;
          expiresAt = result.expiresAt;
          break;
        }
      } catch (error) {
        pollSpinner.fail(chalk.red('Authentication failed'));
        console.error(chalk.red(`Error: ${error.message}`));
        process.exit(1);
      }
    }

    if (!token) {
      pollSpinner.fail(chalk.red('Authentication timeout'));
      console.error(
        chalk.red('\nAuthentication timed out. Please try again.')
      );
      process.exit(1);
    }

    // Step 4: Save token with expiration
    saveSessionToken(token, expiresAt);
    pollSpinner.succeed(chalk.green('Authentication successful!'));

    // Show expiration info
    const daysUntilExpiry = Math.floor((expiresAt - Date.now()) / (24 * 60 * 60 * 1000));
    console.log(chalk.green('\n✓ You are now logged in to Pulse CLI'));
    // console.log(chalk.dim(`  Token expires in: ${daysUntilExpiry} days\n`));
  } catch (error) {
    spinner.fail(chalk.red('Authentication failed'));
    console.error(chalk.red(`\nError: ${error.message}\n`));
    process.exit(1);
  }
}

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

module.exports = loginCommand;
