#!/usr/bin/env node

const { Command } = require("commander");
const chalk = require("chalk");
const ora = require("ora");
const loginCommand = require("./commands/login");
const getColorCommand = require("./commands/getColor");
const setColorCommand = require("./commands/setColor");
const { isLoggedIn, clearSession } = require("./config");
const { validateSession } = require("./api");

const program = new Command();

program
  .name("pulse")
  .description("Pulse CLI - Manage your authentication and favorite color")
  .version("1.0.0");

// Login command
program
  .command("login")
  .description("Authenticate with Pulse using WorkOS")
  .action(async () => {
    try {
      await loginCommand();
    } catch (error) {
      console.error(chalk.red(`Error: ${error.message}`));
      process.exit(1);
    }
  });

// Logout command
program
  .command("logout")
  .description("Clear your authentication session")
  .action(() => {
    if (!isLoggedIn()) {
      console.log(chalk.yellow("\n⚠ You are not logged in.\n"));
      return;
    }
    clearSession();
    console.log(chalk.green("\n✓ Successfully logged out.\n"));
  });

// Get color command
program
  .command("get-color")
  .description("Get your favorite color")
  .action(async () => {
    try {
      await getColorCommand();
    } catch (error) {
      console.error(chalk.red(`Error: ${error.message}`));
      process.exit(1);
    }
  });

// Set color command
program
  .command("set-color <color>")
  .description("Set your favorite color")
  .action(async (color) => {
    try {
      await setColorCommand(color);
    } catch (error) {
      console.error(chalk.red(`Error: ${error.message}`));
      process.exit(1);
    }
  });

// Status command
program
  .command("status")
  .description("Check authentication status")
  .action(async () => {
    const spinner = ora("Checking authentication status...").start();

    try {
      // First check if token exists locally
      if (!isLoggedIn()) {
        spinner.warn(chalk.yellow("Not authenticated"));
        console.log(chalk.dim('  Run "pulse login" to authenticate.\n'));
        return;
      }

      // Validate with server
      const result = await validateSession();

      if (result.valid) {
        spinner.succeed(chalk.green("Authenticated"));

        // Show user info
        if (result.email) {
          console.log(chalk.dim(`  Logged in as: ${result.email}`));
        }

        console.log("");
      } else {
        spinner.fail(chalk.red("Session invalid or expired"));
        // console.log(chalk.yellow(`  ${result.mescsage || result.error}`));
        console.log(chalk.dim('  Run "pulse login" to authenticate again.\n'));

        // Clear invalid session
        clearSession();
      }
    } catch (error) {
      spinner.fail(chalk.red("Failed to check status"));
      console.error(chalk.red(`  Error: ${error.message}\n`));
      process.exit(1);
    }
  });

program.parse(process.argv);

// Show help if no command provided
if (!process.argv.slice(2).length) {
  program.outputHelp();
}
