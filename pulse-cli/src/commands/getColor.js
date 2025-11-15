const chalk = require('chalk');
const ora = require('ora');
const { getFavoriteColor } = require('../api');
const { isLoggedIn } = require('../config');

async function getColorCommand() {
  if (!isLoggedIn()) {
    console.error(chalk.red('\n✗ Not authenticated. Please run "pulse login" first.\n'));
    process.exit(1);
  }

  const spinner = ora('Fetching favorite color...').start();

  try {
    const data = await getFavoriteColor();
    spinner.stop();

    if (data.favoriteColor) {
      console.log(chalk.green('\n✓ Favorite Color:\n'));
      console.log(chalk.bold(`  ${data.favoriteColor}\n`));
    } else {
      console.log(chalk.yellow('\n⚠ No favorite color set yet.'));
      console.log(chalk.dim('  Use "pulse set-color <color>" to set one.\n'));
    }
  } catch (error) {
    spinner.fail(chalk.red('Failed to fetch favorite color'));
    console.error(chalk.red(`\nError: ${error.message}\n`));
    process.exit(1);
  }
}

module.exports = getColorCommand;
