import * as fs from "fs";
import * as path from "path";
import * as os from "os";

export interface Config {
  seed: string;
  homeserver: string;
}

const CONFIG_DIR = path.join(os.homedir(), ".config", "pubky-app-cli");
const CONFIG_FILE = path.join(CONFIG_DIR, "config.json");

export function getConfigPath(): string {
  return CONFIG_FILE;
}

let configOverrides: Partial<Config> = {};

export function setConfigOverrides(overrides: Partial<Config>): void {
  configOverrides = overrides;
}

export function loadConfig(): Config {
  let fileConfig: Partial<Config> = {};

  if (fs.existsSync(CONFIG_FILE)) {
    const raw = fs.readFileSync(CONFIG_FILE, "utf-8");
    fileConfig = JSON.parse(raw);
  } else if (Object.keys(configOverrides).length === 0) {
    console.error(
      `No config found. Run: pubky-app config set --seed "your seed phrase" --homeserver "homeserver_pk"`
    );
    process.exit(1);
  }

  return { ...fileConfig, ...configOverrides } as Config;
}

export function saveConfig(config: Partial<Config>): void {
  fs.mkdirSync(CONFIG_DIR, { recursive: true });

  let existing: Partial<Config> = {};
  if (fs.existsSync(CONFIG_FILE)) {
    existing = JSON.parse(fs.readFileSync(CONFIG_FILE, "utf-8"));
  }

  const merged = { ...existing, ...config };
  fs.writeFileSync(CONFIG_FILE, JSON.stringify(merged, null, 2));
}

export function showConfig(): void {
  if (!fs.existsSync(CONFIG_FILE)) {
    console.log("No config file found.");
    return;
  }
  const config = loadConfig();
  console.log(`Config file: ${CONFIG_FILE}`);
  console.log(`  Seed: ${config.seed ? config.seed.split(" ").slice(0, 3).join(" ") + " ..." : "(not set)"}`);
  console.log(`  Homeserver: ${config.homeserver || "(not set)"}`);
}
