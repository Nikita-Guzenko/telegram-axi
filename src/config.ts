import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { homedir } from "node:os";
import { join } from "node:path";

export const CONFIG_DIR = join(homedir(), ".config", "telegram-axi");
export const CONFIG_FILE = join(CONFIG_DIR, "config.json");

export interface TelegramAxiConfig {
  token?: string;
  defaultChatId?: string;
}

export function loadConfig(): TelegramAxiConfig {
  const config: TelegramAxiConfig = {};

  // 1. Direct config file (configured via `telegram-axi configure set`)
  try {
    if (existsSync(CONFIG_FILE)) {
      const parsed = JSON.parse(readFileSync(CONFIG_FILE, "utf-8"));
      if (parsed.token) config.token = parsed.token;
      if (parsed.defaultChatId) config.defaultChatId = parsed.defaultChatId;
    }
  } catch {}

  // 2. If not explicitly set in config file, check environment variables
  if (!config.token) {
    if (process.env.TELEGRAM_AXI_TOKEN) {
      config.token = process.env.TELEGRAM_AXI_TOKEN;
    } else if (process.env.TELEGRAM_BOT_TOKEN) {
      config.token = process.env.TELEGRAM_BOT_TOKEN;
    }
  }

  if (process.env.TELEGRAM_CHAT_ID && !config.defaultChatId) {
    config.defaultChatId = process.env.TELEGRAM_CHAT_ID;
  }

  // 3. Fallbacks to existing system bot files if still not found
  if (!config.token) {
    const fallbackPaths = [
      join(homedir(), ".config", "firstmate", "telegram.env"),
      join(homedir(), ".config", "fb-scout", "telegram-bot.env"),
    ];

    for (const fpath of fallbackPaths) {
      if (existsSync(fpath)) {
        try {
          const content = readFileSync(fpath, "utf-8");
          const mToken = content.match(/(?:FM_TG_TOKEN|TELEGRAM_BOT_TOKEN)=([^\r\n]+)/);
          if (mToken && mToken[1]) {
            config.token = mToken[1].trim().replace(/['"]/g, "");
            break;
          }
        } catch {}
      }
    }
  }

  return config;
}

export function saveConfig(updates: Partial<TelegramAxiConfig>): TelegramAxiConfig {
  const current = loadConfig();
  const merged: TelegramAxiConfig = { ...current, ...updates };

  if (!existsSync(CONFIG_DIR)) {
    mkdirSync(CONFIG_DIR, { recursive: true, mode: 0o700 });
  }

  writeFileSync(CONFIG_FILE, JSON.stringify(merged, null, 2), {
    encoding: "utf-8",
    mode: 0o600,
  });

  return merged;
}
