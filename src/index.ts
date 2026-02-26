#!/usr/bin/env node

import { Command } from "commander";
import chalk from "chalk";
import { saveConfig, showConfig, setConfigOverrides } from "./config";
import { stripPubkyPrefix } from "./client";
import { registerPostCommands } from "./commands/post";
import { registerProfileCommands } from "./commands/profile";
import { registerTagCommands } from "./commands/tag";
import { registerFollowCommands } from "./commands/follow";
import { registerBookmarkCommands } from "./commands/bookmark";
import { registerFileCommands } from "./commands/file";

const program = new Command();

program
  .name("pubky-app")
  .description("CLI tool for pubky.app - decentralized social networking")
  .version("1.0.0")
  .option("--seed <phrase>", "BIP39 seed phrase (overrides config file)")
  .option("--homeserver <pk>", "Homeserver public key (overrides config file)");

// Config commands
const config = program.command("config").description("Manage configuration");

config
  .command("set")
  .description("Set configuration values")
  .option("--seed <phrase>", "BIP39 seed phrase")
  .option("--homeserver <pk>", "Homeserver public key")
  .action((opts: any) => {
    const updates: any = {};
    if (opts.seed) updates.seed = opts.seed;
    if (opts.homeserver) updates.homeserver = stripPubkyPrefix(opts.homeserver);

    if (Object.keys(updates).length === 0) {
      console.error("Provide at least one of: --seed, --homeserver");
      process.exit(1);
    }

    saveConfig(updates);
    console.log(chalk.green("Config saved!"));
    showConfig();
  });

config
  .command("show")
  .description("Show current configuration")
  .action(() => {
    showConfig();
  });

// Register all command groups
registerPostCommands(program);
registerProfileCommands(program);
registerTagCommands(program);
registerFollowCommands(program);
registerBookmarkCommands(program);
registerFileCommands(program);

// Apply CLI flag overrides before any command runs
program.hook("preAction", () => {
  const opts = program.opts();
  const overrides: any = {};
  if (opts.seed) overrides.seed = opts.seed;
  if (opts.homeserver) overrides.homeserver = stripPubkyPrefix(opts.homeserver);
  if (Object.keys(overrides).length > 0) {
    setConfigOverrides(overrides);
  }
});

program.parseAsync(process.argv).catch((err) => {
  console.error(chalk.red(`Error: ${err.message}`));
  process.exit(1);
});
