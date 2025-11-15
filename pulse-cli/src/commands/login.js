const open = require("open");
const chalk = require("chalk");
const ora = require("ora");
const readline = require("readline");
const {
  initiateDeviceAuth,
  pollForToken,
  exchangeForSession,
} = require("../api");
const { saveSessionToken } = require("../config");

async function loginCommand() {
  console.log(chalk.blue("\n🔐 Pulse CLI Login\n"));

  const spinner = ora("Initiating authentication...").start();

  try {
    // Step 1: Initiate device authorization with WorkOS
    const authData = await initiateDeviceAuth();
    spinner.stop();

    // Step 2: Display user code and verification URL
    console.log(chalk.green("✓ Authentication initiated\n"));
    console.log(
      chalk.bold("Please complete authentication in your browser:\n")
    );
    console.log(chalk.cyan(`  Verification URL: ${authData.verificationUrl}`));
    console.log(
      chalk.yellow(`  User Code: ${chalk.bold(authData.userCode)}\n`)
    );

    // Wait for user to press Enter
    console.log(
      chalk.dim("Press <ENTER> to open the verification URL in your browser.")
    );
    await waitForEnter();

    // Try to open browser with complete verification URL
    try {
      console.log(chalk.dim("Opening browser..."));
      await open(authData.verificationUrlComplete);
    } catch (error) {
      // Browser opening failed - that's okay, user can manually open the URL
      console.log(chalk.dim("Could not open browser automatically."));
      console.log(chalk.dim("Please open the URL above manually.\n"));
    }

    // Step 3: Poll for completion using WorkOS recommended approach
    console.log(chalk.dim("\nWaiting for authentication..."));
    const pollSpinner = ora("Checking authorization status...").start();

    try {
      const result = await pollForToken({
        deviceCode: authData.deviceCode,
        expiresIn: authData.expiresIn,
        interval: authData.interval,
      });

      pollSpinner.text = "Exchanging tokens for session...";

      // Step 4: Exchange refresh token for sealed session from backend
      const sessionData = await exchangeForSession(result.refresh_token);

      console.log(chalk.dim("\nSession Data:"), sessionData);

      pollSpinner.succeed(chalk.green("Authentication successful!"));

      // Step 5: Save sealed session token
      saveSessionToken(sessionData.sessionToken);

      console.log(chalk.green(`\n✓ Welcome ${sessionData.user.firstName}!`));
      console.log(chalk.green("✓ You are now logged in to Pulse CLI\n"));
    } catch (error) {
      pollSpinner.fail(chalk.red("Authentication failed"));
      console.error(chalk.red(`Error: ${error.message}`));
      process.exit(1);
    }
  } catch (error) {
    spinner.fail(chalk.red("Authentication failed"));
    console.error(chalk.red(`\nError: ${error.message}\n`));
    process.exit(1);
  }
}

function waitForEnter() {
  return new Promise((resolve) => {
    const rl = readline.createInterface({
      input: process.stdin,
      output: process.stdout,
    });

    rl.question("", () => {
      rl.close();
      resolve();
    });
  });
}

module.exports = loginCommand;
