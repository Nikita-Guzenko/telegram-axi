import { existsSync, createReadStream } from "node:fs";
import { AxiError } from "axi-sdk-js";
import { loadConfig } from "./config.js";

export interface TelegramResponse<T = any> {
  ok: boolean;
  result?: T;
  error_code?: number;
  description?: string;
  parameters?: {
    migrate_to_chat_id?: number;
    retry_after?: number;
  };
}

export class TelegramClient {
  private token: string;
  private baseUrl: string;

  constructor(tokenOverride?: string) {
    const config = loadConfig();
    const token = tokenOverride || config.token;

    if (!token) {
      throw new AxiError(
        "Telegram bot token not found",
        "AUTH_REQUIRED",
        [
          "Set TELEGRAM_BOT_TOKEN environment variable",
          "Or run `telegram-axi configure set --token <token>`",
          "Get a token from @BotFather on Telegram",
        ],
      );
    }

    this.token = token.trim();
    this.baseUrl = `https://api.telegram.org/bot${this.token}`;
  }

  public getTokenMasked(): string {
    if (this.token.length < 10) return "***";
    const parts = this.token.split(":");
    if (parts.length === 2) {
      return `${parts[0]}:***${parts[1].slice(-4)}`;
    }
    return `${this.token.slice(0, 4)}***${this.token.slice(-4)}`;
  }

  async call<T = any>(
    method: string,
    params: Record<string, any> = {},
  ): Promise<T> {
    const url = `${this.baseUrl}/${method}`;

    // Detect if any parameter is a local file path needing multipart/form-data
    const fileKeys = ["photo", "document", "audio", "video", "voice", "video_note", "sticker", "file"];
    let hasLocalFile = false;
    for (const key of fileKeys) {
      if (params[key] && typeof params[key] === "string" && existsSync(params[key])) {
        hasLocalFile = true;
        break;
      }
    }

    let response: Response;

    try {
      if (hasLocalFile) {
        const formData = new FormData();
        for (const [key, value] of Object.entries(params)) {
          if (value === undefined || value === null) continue;

          if (fileKeys.includes(key) && typeof value === "string" && existsSync(value)) {
            const fileData = await import("node:fs/promises").then((fs) => fs.readFile(value));
            const fileName = value.split("/").pop() || "upload.bin";
            formData.append(key, new Blob([fileData]), fileName);
          } else if (typeof value === "object") {
            formData.append(key, JSON.stringify(value));
          } else {
            formData.append(key, String(value));
          }
        }

        response = await fetch(url, {
          method: "POST",
          body: formData,
        });
      } else {
        response = await fetch(url, {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
          },
          body: JSON.stringify(params),
        });
      }
    } catch (err: any) {
      throw new AxiError(
        `Failed to reach Telegram API: ${err.message || String(err)}`,
        "NETWORK_ERROR",
        [
          "Check your internet connection",
          "Ensure api.telegram.org is reachable",
        ],
      );
    }

    const data = (await response.json()) as TelegramResponse<T>;

    if (!data.ok) {
      const code = data.error_code || response.status;
      const desc = data.description || "Unknown Telegram error";

      const suggestions: string[] = [];

      if (code === 401) {
        suggestions.push("Check that your bot token from @BotFather is active and valid");
        suggestions.push("Run `telegram-axi configure set --token <token>`");
      } else if (code === 400 && desc.includes("chat not found")) {
        suggestions.push("Verify the chat ID; for private chats the user must message the bot first");
        suggestions.push("For public channels, use '@channelusername' as the chat ID");
      } else if (code === 403) {
        suggestions.push("The bot may have been blocked by the user or lacks admin privileges in the chat");
      } else if (code === 429) {
        const wait = data.parameters?.retry_after ?? 5;
        suggestions.push(`Rate limit reached: wait ${wait} seconds before repeating this request`);
      } else {
        suggestions.push(`Check method '${method}' parameters against Telegram Bot API documentation`);
        suggestions.push(`Run 'telegram-axi inspect ${method}' to see parameter specification`);
      }

      throw new AxiError(`Telegram API ${code}: ${desc}`, `TG_${code}`, suggestions);
    }

    return data.result as T;
  }
}
