import { homedir } from "node:os";
import {
  AxiError,
  installSessionStartHooks,
  runAxiCli,
  type AxiCliCommand,
} from "axi-sdk-js";
import { TelegramClient } from "./client.js";
import { CATEGORIES, METHODS } from "./catalog-data.js";
import { loadConfig, saveConfig } from "./config.js";
import { VERSION } from "./version.js";

function collapseHomeDirectory(path: string, home = homedir()): string {
  if (!path.startsWith(home)) return path;
  return `~${path.slice(home.length)}`;
}

export function parseArgs(args: string[]): {
  positionals: string[];
  flags: Record<string, string | boolean>;
} {
  const positionals: string[] = [];
  const flags: Record<string, string | boolean> = {};

  for (let i = 0; i < args.length; i++) {
    const arg = args[i];
    if (arg.startsWith("--")) {
      const key = arg.slice(2);
      if (key.includes("=")) {
        const [k, v] = key.split("=", 2);
        flags[k] = v;
      } else if (i + 1 < args.length && !args[i + 1].startsWith("-")) {
        flags[key] = args[i + 1];
        i++;
      } else {
        flags[key] = true;
      }
    } else if (arg.startsWith("-")) {
      const key = arg.slice(1);
      if (i + 1 < args.length && !args[i + 1].startsWith("-")) {
        flags[key] = args[i + 1];
        i++;
      } else {
        flags[key] = true;
      }
    } else {
      positionals.push(arg);
    }
  }

  return { positionals, flags };
}

export const TOP_LEVEL_HELP = `telegram-axi — High-density Agent eXperience Interface for Telegram Bot API

Usage:
  telegram-axi                             Show live bot status & webhook info
  telegram-axi catalog [category]          Explore all Telegram Bot API capabilities & methods
  telegram-axi inspect <method>            Inspect method parameters, return types, and usage
  telegram-axi me                          Bot identity, description, rights, and commands
  telegram-axi send [flags]                Send text message, photo, or document
  telegram-axi msg <subcommand> [flags]    Message actions (edit, delete, pin, react, forward)
  telegram-axi chat <subcommand> <id>      Chat actions (info, admins, count, link, ban)
  telegram-axi webhook <subcommand>        Manage webhooks (info, set, delete)
  telegram-axi updates [flags]             Fetch incoming updates via long-polling (getUpdates)
  telegram-axi commands [list|set]         Manage bot menu commands
  telegram-axi api <method> [flags]        Directly call ANY Telegram Bot API method
  telegram-axi configure [show|set]        Manage stored credentials (~/.config/telegram-axi/)
  telegram-axi setup hooks                 Install agent ambient context hooks (Claude/Codex/OpenCode)
  telegram-axi update [--check]            Check or install latest version of telegram-axi

Global flags:
  --help, -h       Show help for command
  --version, -v    Show version (${VERSION})
`;

// 1. Home Command
const homeCommand: AxiCliCommand<undefined> = async () => {
  const client = new TelegramClient();
  const [me, webhook] = await Promise.all([
    client.call("getMe"),
    client.call("getWebhookInfo").catch(() => null),
  ]);

  const output: Record<string, any> = {
    bin: collapseHomeDirectory(process.argv[1] ?? ""),
    description: "Agent eXperience Interface for Telegram Bot API",
    bot: {
      id: me.id,
      username: `@${me.username}`,
      first_name: me.first_name,
      can_join_groups: me.can_join_groups ?? false,
      can_read_all_group_messages: me.can_read_all_group_messages ?? false,
      supports_inline: me.supports_inline_queries ?? false,
    },
  };

  if (webhook) {
    output.webhook = {
      has_webhook: Boolean(webhook.url),
      url: webhook.url || "(none, long-polling ready)",
      pending_updates: webhook.pending_update_count,
      last_error: webhook.last_error_message || undefined,
    };
  }

  output.help = [
    "Run `telegram-axi catalog` to browse all Telegram Bot API categories and methods",
    "Run `telegram-axi send --chat <id> --text \"...\"` to send a message",
    "Run `telegram-axi updates` to read incoming updates in TOON format",
    "Run `telegram-axi inspect <method>` to inspect any Telegram Bot API method",
  ];

  return output;
};

// 2. Catalog Command
const catalogCommand: AxiCliCommand<undefined> = async (args) => {
  const { positionals } = parseArgs(args);
  const targetCategory = positionals[0]?.toLowerCase();

  if (!targetCategory) {
    const list = Object.values(CATEGORIES).map((cat) => ({
      category: cat.id,
      title: cat.title,
      methods: cat.methods.length,
      description: cat.description,
    }));

    return {
      total_categories: list.length,
      total_methods: Object.keys(METHODS).length,
      categories: list,
      help: [
        "Run `telegram-axi catalog <category>` to view methods in that category",
        "Run `telegram-axi inspect <method>` for exact required/optional parameters",
      ],
    };
  }

  const category = CATEGORIES[targetCategory];
  if (!category) {
    const valid = Object.keys(CATEGORIES).join(", ");
    throw new AxiError(
      `Unknown category '${targetCategory}'`,
      "INVALID_CATEGORY",
      [`Valid categories are: ${valid}`],
    );
  }

  const methodsList = category.methods.map((methodName) => {
    const spec = METHODS[methodName];
    return {
      method: methodName,
      summary: spec ? spec.summary : "Telegram Bot API method",
      required: spec ? spec.required.join(",") || "none" : "none",
    };
  });

  return {
    category: category.id,
    title: category.title,
    count: methodsList.length,
    methods: methodsList,
    help: [
      `Run 'telegram-axi inspect <method>' to see parameter details for any method`,
      `Run 'telegram-axi catalog' to return to category list`,
    ],
  };
};

// 3. Inspect Command
const inspectCommand: AxiCliCommand<undefined> = async (args) => {
  const { positionals } = parseArgs(args);
  const methodName = positionals[0];

  if (!methodName) {
    throw new AxiError(
      "Method name is required for inspection",
      "METHOD_REQUIRED",
      [
        "Run `telegram-axi inspect <method>` (e.g. `telegram-axi inspect sendMessage`)",
        "Run `telegram-axi catalog` to list all known methods",
      ],
    );
  }

  const spec = METHODS[methodName];
  if (!spec) {
    return {
      method: methodName,
      note: "Standard Telegram Bot API method (callable directly via 'telegram-axi api')",
      docs_url: `https://core.telegram.org/bots/api#${methodName.toLowerCase()}`,
      help: [`Run \`telegram-axi api ${methodName} [--data '{...}']\` to call this method`],
    };
  }

  return {
    method: spec.name,
    category: spec.category,
    summary: spec.summary,
    required_parameters: spec.required.length > 0 ? spec.required : ["none"],
    optional_parameters: spec.optional.length > 0 ? spec.optional : ["none"],
    example: spec.example,
    docs_url: `https://core.telegram.org/bots/api#${spec.name.toLowerCase()}`,
    help: [`Execute: ${spec.example}`],
  };
};

// 4. Me Command
const meCommand: AxiCliCommand<undefined> = async () => {
  const client = new TelegramClient();
  const [me, commands, desc, shortDesc, rights] = await Promise.all([
    client.call("getMe"),
    client.call("getMyCommands").catch(() => []),
    client.call("getMyDescription").catch(() => ({ description: "" })),
    client.call("getMyShortDescription").catch(() => ({ short_description: "" })),
    client.call("getMyDefaultAdministratorRights").catch(() => null),
  ]);

  return {
    identity: {
      id: me.id,
      username: `@${me.username}`,
      first_name: me.first_name,
      is_bot: me.is_bot,
    },
    capabilities: {
      can_join_groups: me.can_join_groups ?? false,
      can_read_all_group_messages: me.can_read_all_group_messages ?? false,
      supports_inline: me.supports_inline_queries ?? false,
      can_connect_to_business: me.can_connect_to_business ?? false,
    },
    descriptions: {
      empty_chat_desc: desc.description || "(none)",
      short_desc: shortDesc.short_description || "(none)",
    },
    commands_count: commands.length,
    commands: commands.map((c: any) => ({
      command: `/${c.command}`,
      description: c.description,
    })),
    default_admin_rights: rights || undefined,
    help: [
      "Run `telegram-axi commands set --commands '[{\"command\":\"help\",\"description\":\"Show help\"}]'` to update commands",
      "Run `telegram-axi send --chat <id> --text \"...\"` to send a message",
    ],
  };
};

// 5. Send Command
const sendCommand: AxiCliCommand<undefined> = async (args) => {
  const { positionals, flags } = parseArgs(args);
  const client = new TelegramClient();

  const sub = positionals[0]?.toLowerCase();

  // Photo
  if (sub === "photo") {
    const chatId = (flags.chat || flags["chat-id"] || flags.c) as string;
    const photo = (flags.photo || flags.file || flags.p) as string;
    const caption = (flags.caption || "") as string;

    if (!chatId || !photo) {
      throw new AxiError(
        "Missing required flags for sending photo",
        "INVALID_ARGS",
        ["Usage: telegram-axi send photo --chat <id> --photo <path_or_url> [--caption '...']"],
      );
    }

    const res = await client.call("sendPhoto", {
      chat_id: chatId,
      photo,
      caption: caption || undefined,
    });

    return {
      status: "sent",
      type: "photo",
      chat_id: res.chat?.id,
      message_id: res.message_id,
      date: new Date(res.date * 1000).toISOString(),
    };
  }

  // Document / file
  if (sub === "doc" || sub === "document" || sub === "file") {
    const chatId = (flags.chat || flags["chat-id"] || flags.c) as string;
    const doc = (flags.file || flags.doc || flags.document || flags.d) as string;
    const caption = (flags.caption || "") as string;

    if (!chatId || !doc) {
      throw new AxiError(
        "Missing required flags for sending document",
        "INVALID_ARGS",
        ["Usage: telegram-axi send doc --chat <id> --file <path_or_url> [--caption '...']"],
      );
    }

    const res = await client.call("sendDocument", {
      chat_id: chatId,
      document: doc,
      caption: caption || undefined,
    });

    return {
      status: "sent",
      type: "document",
      chat_id: res.chat?.id,
      message_id: res.message_id,
      date: new Date(res.date * 1000).toISOString(),
    };
  }

  // Default: text message
  const chatId = (flags.chat || flags["chat-id"] || flags.c) as string;
  const text = (flags.text || flags.message || flags.m) as string;
  const parseMode = (flags.format || flags["parse-mode"]) as string;
  const silent = Boolean(flags.silent || flags["disable-notification"]);
  const replyTo = (flags.reply || flags["reply-to"]) as string;

  if (!chatId || !text) {
    throw new AxiError(
      "Missing --chat or --text",
      "INVALID_ARGS",
      [
        "Usage: telegram-axi send --chat <id> --text 'Your message' [--format HTML|MarkdownV2] [--silent]",
        "Example: telegram-axi send --chat 123456789 --text 'Hello world'",
      ],
    );
  }

  const params: Record<string, any> = {
    chat_id: chatId,
    text,
    disable_notification: silent || undefined,
  };

  if (parseMode) params.parse_mode = parseMode;
  if (replyTo) params.reply_parameters = { message_id: Number(replyTo) };

  const res = await client.call("sendMessage", params);

  return {
    status: "sent",
    chat_id: res.chat?.id,
    message_id: res.message_id,
    date: new Date(res.date * 1000).toISOString(),
    help: [
      `Run \`telegram-axi msg edit --chat ${chatId} --msg ${res.message_id} --text "..."\` to edit`,
      `Run \`telegram-axi msg delete --chat ${chatId} --msg ${res.message_id}\` to delete`,
    ],
  };
};

// 6. Message Command (msg)
const msgCommand: AxiCliCommand<undefined> = async (args) => {
  const { positionals, flags } = parseArgs(args);
  const action = positionals[0]?.toLowerCase();
  const client = new TelegramClient();

  if (!action) {
    throw new AxiError(
      "Subcommand required for 'msg'",
      "SUBCOMMAND_REQUIRED",
      ["Available subcommands: edit, delete, pin, unpin, react, forward"],
    );
  }

  const chatId = (flags.chat || flags["chat-id"] || flags.c) as string;
  const msgId = (flags.msg || flags["message-id"] || flags.m) as string;

  if (action === "edit") {
    const text = flags.text as string;
    if (!chatId || !msgId || !text) {
      throw new AxiError(
        "Missing required flags for msg edit",
        "INVALID_ARGS",
        ["Usage: telegram-axi msg edit --chat <id> --msg <id> --text 'New text'"],
      );
    }

    const res = await client.call("editMessageText", {
      chat_id: chatId,
      message_id: Number(msgId),
      text,
    });

    return {
      status: "edited",
      chat_id: res.chat?.id,
      message_id: res.message_id,
    };
  }

  if (action === "delete") {
    if (!chatId || !msgId) {
      throw new AxiError(
        "Missing --chat or --msg for delete",
        "INVALID_ARGS",
        ["Usage: telegram-axi msg delete --chat <id> --msg <id>"],
      );
    }

    await client.call("deleteMessage", {
      chat_id: chatId,
      message_id: Number(msgId),
    });

    return {
      status: "deleted",
      chat_id: chatId,
      message_id: Number(msgId),
    };
  }

  if (action === "pin") {
    if (!chatId || !msgId) {
      throw new AxiError(
        "Missing --chat or --msg for pin",
        "INVALID_ARGS",
        ["Usage: telegram-axi msg pin --chat <id> --msg <id> [--silent]"],
      );
    }

    await client.call("pinChatMessage", {
      chat_id: chatId,
      message_id: Number(msgId),
      disable_notification: Boolean(flags.silent),
    });

    return {
      status: "pinned",
      chat_id: chatId,
      message_id: Number(msgId),
    };
  }

  if (action === "unpin") {
    if (!chatId) {
      throw new AxiError(
        "Missing --chat for unpin",
        "INVALID_ARGS",
        ["Usage: telegram-axi msg unpin --chat <id> [--msg <id>]"],
      );
    }

    if (msgId) {
      await client.call("unpinChatMessage", {
        chat_id: chatId,
        message_id: Number(msgId),
      });
      return { status: "unpinned", chat_id: chatId, message_id: Number(msgId) };
    } else {
      await client.call("unpinAllChatMessages", { chat_id: chatId });
      return { status: "unpinned_all", chat_id: chatId };
    }
  }

  if (action === "react") {
    const emoji = (flags.emoji || flags.e) as string;
    if (!chatId || !msgId || !emoji) {
      throw new AxiError(
        "Missing required flags for react",
        "INVALID_ARGS",
        ["Usage: telegram-axi msg react --chat <id> --msg <id> --emoji '👍'"],
      );
    }

    await client.call("setMessageReaction", {
      chat_id: chatId,
      message_id: Number(msgId),
      reaction: [{ type: "emoji", emoji }],
    });

    return {
      status: "reacted",
      chat_id: chatId,
      message_id: Number(msgId),
      emoji,
    };
  }

  if (action === "forward") {
    const toChat = (flags.to || flags["to-chat"]) as string;
    const fromChat = (flags.from || flags["from-chat"]) as string;
    if (!toChat || !fromChat || !msgId) {
      throw new AxiError(
        "Missing required flags for forward",
        "INVALID_ARGS",
        ["Usage: telegram-axi msg forward --to <chat_id> --from <chat_id> --msg <id>"],
      );
    }

    const res = await client.call("forwardMessage", {
      chat_id: toChat,
      from_chat_id: fromChat,
      message_id: Number(msgId),
    });

    return {
      status: "forwarded",
      to_chat: res.chat?.id,
      message_id: res.message_id,
    };
  }

  throw new AxiError(
    `Unknown msg subcommand '${action}'`,
    "UNKNOWN_SUBCOMMAND",
    ["Valid subcommands: edit, delete, pin, unpin, react, forward"],
  );
};

// 7. Chat Command
const chatCommand: AxiCliCommand<undefined> = async (args) => {
  const { positionals, flags } = parseArgs(args);
  const action = positionals[0]?.toLowerCase() || "info";
  const targetId = positionals[1] || (flags.chat as string) || (flags.id as string);
  const client = new TelegramClient();

  if (!targetId) {
    throw new AxiError(
      "Chat ID or username required",
      "CHAT_REQUIRED",
      [
        "Usage: telegram-axi chat info <chat_id>",
        "Usage: telegram-axi chat admins <chat_id>",
      ],
    );
  }

  if (action === "info") {
    const chat = await client.call("getChat", { chat_id: targetId });
    const count = await client.call("getChatMemberCount", { chat_id: targetId }).catch(() => null);

    return {
      id: chat.id,
      title: chat.title || chat.first_name || chat.username,
      type: chat.type,
      username: chat.username ? `@${chat.username}` : undefined,
      description: chat.description || undefined,
      member_count: count !== null ? count : undefined,
      invite_link: chat.invite_link || undefined,
      permissions: chat.permissions || undefined,
    };
  }

  if (action === "admins") {
    const admins = await client.call("getChatAdministrators", { chat_id: targetId });

    return {
      chat_id: targetId,
      count: admins.length,
      administrators: admins.map((a: any) => ({
        user_id: a.user.id,
        username: a.user.username ? `@${a.user.username}` : a.user.first_name,
        status: a.status,
        custom_title: a.custom_title || undefined,
      })),
    };
  }

  if (action === "count") {
    const count = await client.call("getChatMemberCount", { chat_id: targetId });
    return { chat_id: targetId, member_count: count };
  }

  if (action === "link") {
    const link = await client.call("exportChatInviteLink", { chat_id: targetId });
    return { chat_id: targetId, invite_link: link };
  }

  if (action === "ban") {
    const userId = (flags.user || flags["user-id"]) as string;
    if (!userId) {
      throw new AxiError("User ID required for ban", "USER_REQUIRED", [
        "Usage: telegram-axi chat ban <chat_id> --user <user_id>",
      ]);
    }
    await client.call("banChatMember", { chat_id: targetId, user_id: Number(userId) });
    return { status: "banned", chat_id: targetId, user_id: Number(userId) };
  }

  if (action === "unban") {
    const userId = (flags.user || flags["user-id"]) as string;
    if (!userId) {
      throw new AxiError("User ID required for unban", "USER_REQUIRED", [
        "Usage: telegram-axi chat unban <chat_id> --user <user_id>",
      ]);
    }
    await client.call("unbanChatMember", { chat_id: targetId, user_id: Number(userId) });
    return { status: "unbanned", chat_id: targetId, user_id: Number(userId) };
  }

  throw new AxiError(
    `Unknown chat subcommand '${action}'`,
    "UNKNOWN_SUBCOMMAND",
    ["Valid subcommands: info, admins, count, link, ban, unban"],
  );
};

// 8. Webhook Command
const webhookCommand: AxiCliCommand<undefined> = async (args) => {
  const { positionals, flags } = parseArgs(args);
  const action = positionals[0]?.toLowerCase() || "info";
  const client = new TelegramClient();

  if (action === "info") {
    const info = await client.call("getWebhookInfo");
    return {
      has_webhook: Boolean(info.url),
      url: info.url || "(none, ready for polling)",
      pending_updates: info.pending_update_count,
      last_error_date: info.last_error_date ? new Date(info.last_error_date * 1000).toISOString() : undefined,
      last_error_message: info.last_error_message || undefined,
      max_connections: info.max_connections || undefined,
      allowed_updates: info.allowed_updates || undefined,
      help: info.url
        ? ["Run `telegram-axi webhook delete` to remove webhook and use polling"]
        : ["Run `telegram-axi webhook set <url>` to configure incoming webhook"],
    };
  }

  if (action === "set") {
    const url = positionals[1] || (flags.url as string);
    if (!url) {
      throw new AxiError(
        "Webhook URL is required",
        "URL_REQUIRED",
        ["Usage: telegram-axi webhook set https://example.com/tg-webhook [--secret <token>]"],
      );
    }

    const params: Record<string, any> = { url };
    if (flags.secret || flags["secret-token"]) {
      params.secret_token = flags.secret || flags["secret-token"];
    }
    if (flags["max-conn"] || flags["max-connections"]) {
      params.max_connections = Number(flags["max-conn"] || flags["max-connections"]);
    }
    if (flags["drop-pending"]) {
      params.drop_pending_updates = true;
    }

    await client.call("setWebhook", params);
    return {
      status: "webhook_set",
      url,
      secret_token_configured: Boolean(params.secret_token),
      help: ["Run `telegram-axi webhook info` to verify status"],
    };
  }

  if (action === "delete") {
    const dropPending = Boolean(flags["drop-pending"] || flags["drop-pending-updates"]);
    await client.call("deleteWebhook", { drop_pending_updates: dropPending });
    return {
      status: "webhook_deleted",
      dropped_pending_updates: dropPending,
      mode: "long-polling ready",
      help: ["Run `telegram-axi updates` to read incoming updates"],
    };
  }

  throw new AxiError(
    `Unknown webhook subcommand '${action}'`,
    "UNKNOWN_SUBCOMMAND",
    ["Valid subcommands: info, set, delete"],
  );
};

// 9. Updates Command (getUpdates polling)
const updatesCommand: AxiCliCommand<undefined> = async (args) => {
  const { flags } = parseArgs(args);
  const client = new TelegramClient();

  const limit = flags.limit ? Number(flags.limit) : 10;
  const offset = flags.offset ? Number(flags.offset) : undefined;
  const timeout = flags.timeout ? Number(flags.timeout) : 0;

  const updates = await client.call("getUpdates", {
    limit,
    offset,
    timeout,
  });

  if (!Array.isArray(updates) || updates.length === 0) {
    return {
      updates: "0 updates found",
      help: ["Send a message to your bot in Telegram and re-run `telegram-axi updates`"],
    };
  }

  const formatted = updates.map((u: any) => {
    let type = "unknown";
    let sender = "unknown";
    let chatId = "";
    let preview = "";

    if (u.message) {
      type = "message";
      sender = u.message.from ? `@${u.message.from.username || u.message.from.first_name}` : "unknown";
      chatId = String(u.message.chat?.id || "");
      preview = u.message.text || u.message.caption || "[attachment]";
    } else if (u.callback_query) {
      type = "callback";
      sender = u.callback_query.from ? `@${u.callback_query.from.username || u.callback_query.from.first_name}` : "unknown";
      chatId = String(u.callback_query.message?.chat?.id || "");
      preview = u.callback_query.data || "[callback]";
    } else if (u.channel_post) {
      type = "channel_post";
      sender = "channel";
      chatId = String(u.channel_post.chat?.id || "");
      preview = u.channel_post.text || "[post]";
    }

    return {
      update_id: u.update_id,
      type,
      sender,
      chat_id: chatId,
      preview: preview.length > 50 ? `${preview.slice(0, 47)}...` : preview,
    };
  });

  const nextOffset = updates[updates.length - 1].update_id + 1;

  return {
    count: updates.length,
    next_offset: nextOffset,
    updates: formatted,
    help: [
      `Run \`telegram-axi updates --offset ${nextOffset}\` to acknowledge and fetch next updates`,
      "Run `telegram-axi send --chat <id> --text \"...\"` to reply to a user",
    ],
  };
};

// 10. Commands Command
const commandsCommand: AxiCliCommand<undefined> = async (args) => {
  const { positionals, flags } = parseArgs(args);
  const action = positionals[0]?.toLowerCase() || "list";
  const client = new TelegramClient();

  if (action === "list") {
    const list = await client.call("getMyCommands");
    if (!list || list.length === 0) {
      return {
        commands: "0 commands configured in menu",
        help: ["Run `telegram-axi commands set --commands '[{\"command\":\"start\",\"description\":\"Start bot\"}]'`"],
      };
    }
    return {
      count: list.length,
      commands: list.map((c: any) => ({
        command: `/${c.command}`,
        description: c.description,
      })),
    };
  }

  if (action === "set") {
    const raw = (flags.commands || positionals[1]) as string;
    if (!raw) {
      throw new AxiError(
        "Missing commands JSON",
        "COMMANDS_REQUIRED",
        [
          "Usage: telegram-axi commands set --commands '[{\"command\":\"start\",\"description\":\"Start\"}]'",
        ],
      );
    }

    let parsed: any;
    try {
      parsed = JSON.parse(raw);
    } catch {
      throw new AxiError("Invalid JSON for commands", "JSON_PARSE_ERROR", [
        "Provide valid JSON array of { command, description }",
      ]);
    }

    await client.call("setMyCommands", { commands: parsed });
    return {
      status: "commands_updated",
      count: parsed.length,
      help: ["Run `telegram-axi commands list` to verify updated commands"],
    };
  }

  throw new AxiError(
    `Unknown commands subcommand '${action}'`,
    "UNKNOWN_SUBCOMMAND",
    ["Valid subcommands: list, set"],
  );
};

// 11. API Command (Arbitrary method invoker)
const apiCommand: AxiCliCommand<undefined> = async (args) => {
  const { positionals, flags } = parseArgs(args);
  const method = positionals[0];

  if (!method) {
    throw new AxiError(
      "Method name required for api call",
      "METHOD_REQUIRED",
      [
        "Usage: telegram-axi api <method> [--data '<json>'] [--param value...]",
        "Example: telegram-axi api getMe",
        "Example: telegram-axi api sendMessage --chat_id 123456 --text 'Hi'",
      ],
    );
  }

  const client = new TelegramClient();
  let params: Record<string, any> = {};

  if (flags.data) {
    try {
      params = JSON.parse(flags.data as string);
    } catch {
      throw new AxiError("Invalid JSON in --data flag", "JSON_PARSE_ERROR", [
        "Ensure --data contains valid JSON string",
      ]);
    }
  }

  for (const [k, v] of Object.entries(flags)) {
    if (k !== "data" && k !== "help" && k !== "h") {
      try {
        params[k] = JSON.parse(String(v));
      } catch {
        params[k] = v;
      }
    }
  }

  const result = await client.call(method, params);

  return {
    method,
    status: "ok",
    result,
  };
};

// 12. Configure Command
const configureCommand: AxiCliCommand<undefined> = async (args) => {
  const { positionals, flags } = parseArgs(args);
  const action = positionals[0]?.toLowerCase() || "show";

  if (action === "show") {
    const config = loadConfig();
    const client = config.token ? new TelegramClient(config.token) : null;
    return {
      token_configured: Boolean(config.token),
      token_masked: client ? client.getTokenMasked() : "(none)",
      default_chat_id: config.defaultChatId || "(none)",
      config_path: "~/.config/telegram-axi/config.json",
      env_override: Boolean(process.env.TELEGRAM_BOT_TOKEN),
    };
  }

  if (action === "set") {
    const token = (flags.token || flags.t) as string;
    const chat = (flags.chat || flags.c) as string;

    if (!token && !chat) {
      throw new AxiError("Provide --token or --chat to configure", "PARAMS_REQUIRED", [
        "Usage: telegram-axi configure set --token <token> [--chat <id>]",
      ]);
    }

    const updates: Record<string, string> = {};
    if (token) updates.token = token;
    if (chat) updates.defaultChatId = chat;

    saveConfig(updates);

    return {
      status: "configuration_saved",
      path: "~/.config/telegram-axi/config.json",
      help: ["Run `telegram-axi` to verify bot connectivity"],
    };
  }

  throw new AxiError(
    `Unknown configure subcommand '${action}'`,
    "UNKNOWN_SUBCOMMAND",
    ["Valid subcommands: show, set"],
  );
};

// 13. Setup Command (ambient hooks)
const setupCommand: AxiCliCommand<undefined> = async (args) => {
  const { positionals } = parseArgs(args);
  const target = positionals[0]?.toLowerCase() || "hooks";

  if (target !== "hooks") {
    throw new AxiError(
      `Unknown setup target '${target}'`,
      "INVALID_SETUP_TARGET",
      ["Usage: telegram-axi setup hooks"],
    );
  }

  await installSessionStartHooks({
    marker: "telegram-axi",
    binaryNames: ["telegram-axi"],
  });

  return {
    setup: "hooks installed or already up to date",
    scope: "user",
    agents: ["Claude Code (~/.claude/settings.json)", "Codex (~/.codex/hooks.json)", "OpenCode (~/.config/opencode/plugins/)"],
    help: ["Future agent sessions will receive telegram-axi context on session start automatically"],
  };
};

export async function main() {
  await runAxiCli({
    description: "Agent eXperience Interface for Telegram Bot API. Compact token-efficient CLI for AI agents.",
    version: VERSION,
    argv: process.argv.slice(2),
    topLevelHelp: TOP_LEVEL_HELP,
    home: homeCommand,
    commands: {
      catalog: catalogCommand,
      capabilities: catalogCommand,
      inspect: inspectCommand,
      me: meCommand,
      send: sendCommand,
      msg: msgCommand,
      message: msgCommand,
      chat: chatCommand,
      webhook: webhookCommand,
      updates: updatesCommand,
      commands: commandsCommand,
      api: apiCommand,
      call: apiCommand,
      configure: configureCommand,
      setup: setupCommand,
    },
  });
}
