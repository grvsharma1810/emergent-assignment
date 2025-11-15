const chalk = require('chalk');
const ora = require('ora');
const { setFavoriteColor } = require('../api');
const { isLoggedIn } = require('../config');

async function setColorCommand(color) {
  if (!isLoggedIn()) {
    console.error(chalk.red('\n✗ Not authenticated. Please run "pulse login" first.\n'));
    process.exit(1);
  }

  if (!color) {
    console.error(chalk.red('\n✗ Please provide a color.'));
    console.log(chalk.dim('  Usage: pulse set-color <color>'));
    console.log(chalk.dim('  Example: pulse set-color "#FF5733" or pulse set-color blue\n'));
    process.exit(1);
  }

  const spinner = ora(`Setting favorite color to "${color}"...`).start();

  try {
    const data = await setFavoriteColor(color);
    spinner.succeed(chalk.green(`Favorite color set to "${data.favoriteColor}"`));
    console.log(chalk.green('\n✓ Your favorite color has been updated!\n'));
  } catch (error) {
    spinner.fail(chalk.red('Failed to set favorite color'));
    console.error(chalk.red(`\nError: ${error.message}\n`));
    process.exit(1);
  }
}

module.exports = setColorCommand;
