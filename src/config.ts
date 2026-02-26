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

export function loadConfig(): Config {
  if (!fs.existsSync(CONFIG_FILE)) {
    console.error(
      `No config found. Run: pubky-app config set --seed "your seed phrase" --homeserver "homeserver_pk"`
    );
    process.exit(1);
  }
  const raw = fs.readFileSync(CONFIG_FILE, "utf-8");
  return JSON.parse(raw) as Config;
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
