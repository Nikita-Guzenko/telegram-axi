# telegram-axi

> **Agent eXperience Interface (AXI)** for the **Telegram Bot API**. High-density, token-efficient CLI built specifically for autonomous AI agents.

[![AXI Compliant](https://img.shields.io/badge/AXI-Compliant-success?style=flat-square)](https://axi.md)
[![Twitter Follow](https://img.shields.io/badge/X-@NikGuzenko-black?style=flat-square&logo=x)](https://x.com/NikGuzenko)
[![License: MIT](https://img.shields.io/badge/License-MIT-blue.svg?style=flat-square)](LICENSE)

Traditional CLIs and heavy MCP schemas dump massive JSON responses and interactive prompt traps that waste model context windows and cause agent execution loops. `telegram-axi` adheres to the **10 AXI Principles**:

1. **TOON Output on `stdout`**: Tabular, high-density Token-Oriented Object Notation saving ~40% tokens over JSON.
2. **Content First**: Running `telegram-axi` with no flags prints live bot status and webhook state immediately.
3. **Definitive Empty States**: Clear non-ambiguous messages (e.g. `updates: 0 updates found`) avoiding exploratory retries.
4. **Structured Errors & Actionable Next Steps**: Errors return on stdout with `help:` suggestions naming the exact command to fix the issue.
5. **No Interactive Prompts**: All commands are 100% automated flag-driven.
6. **Built-in Fast-Path**: `--version` resolves in milliseconds before heavy modules load.
7. **Complete 130+ Method Coverage**: First-class commands for high-frequency operations (`send`, `msg`, `chat`, `webhook`, `updates`, `commands`) plus a universal `api` command for any Telegram Bot API method.

---

## Quick Start

### Installation

```bash
# Run on-demand without installing
npx -y telegram-axi

# Or install globally
npm install -g telegram-axi
```

### Authentication

Set your Telegram bot token via environment variable:
```bash
export TELEGRAM_BOT_TOKEN="123456:ABC-DEF1234ghIkl-zyx57W2v1u123ew11"
```

Or store it persistently in `~/.config/telegram-axi/config.json`:
```bash
telegram-axi configure set --token "123456:ABC-DEF1234ghIkl-zyx57W2v1u123ew11"
```

---

## Live Dashboard

Running `telegram-axi` with no arguments prints live bot identity and webhook health:

```text
$ telegram-axi
bin: ~/.local/bin/telegram-axi
description: Agent eXperience Interface for Telegram Bot API. Compact token-efficient CLI for AI agents.
bot:
  id: 8674001019
  username: @stella_polaris_ping_bot
  first_name: STELLA POLARIS · Pings
  can_join_groups: true
  can_read_all_group_messages: false
  supports_inline: false
webhook:
  has_webhook: false
  url: "(none, long-polling ready)"
  pending_updates: 0
  last_error: null
help[4]:
  Run `telegram-axi catalog` to browse all Telegram Bot API categories and methods
  Run `telegram-axi send --chat <id> --text "..."` to send a message
  Run `telegram-axi updates` to read incoming updates in TOON format
  Run `telegram-axi inspect <method>` to inspect any Telegram Bot API method
```

---

## Capabilities Discovery (`catalog` & `inspect`)

Agents can discover Telegram Bot API capabilities without scraping or context window pollution:

```bash
# 1. Browse all 11 API categories
telegram-axi catalog

# 2. Browse methods in a category
telegram-axi catalog messages
telegram-axi catalog payments
telegram-axi catalog webhooks

# 3. Deep inspect parameter specifications for any method
telegram-axi inspect sendMessage
telegram-axi inspect sendInvoice
```

---

## Command Surface

### 1. Messaging (`send` & `msg`)

```bash
# Send text message
telegram-axi send --chat 123456789 --text "Deploy completed successfully" [--format HTML|MarkdownV2] [--silent]

# Send photo (local file path or remote URL)
telegram-axi send photo --chat 123456789 --photo ./chart.png --caption "Daily Analytics"

# Send document / file
telegram-axi send doc --chat 123456789 --file ./report.pdf --caption "Monthly Report"

# Edit sent message
telegram-axi msg edit --chat 123456789 --msg 42 --text "Updated status: Resolved"

# React to message
telegram-axi msg react --chat 123456789 --msg 42 --emoji "👍"

# Pin / unpin message
telegram-axi msg pin --chat 123456789 --msg 42 [--silent]
telegram-axi msg unpin --chat 123456789 --msg 42

# Delete message
telegram-axi msg delete --chat 123456789 --msg 42

# Forward message
telegram-axi msg forward --to 987654321 --from 123456789 --msg 42
```

### 2. Chat & Member Moderation (`chat`)

```bash
# Inspect chat metadata & member count
telegram-axi chat info <chat_id>

# List administrators in TOON table
telegram-axi chat admins <chat_id>

# Get member count
telegram-axi chat count <chat_id>

# Export invite link
telegram-axi chat link <chat_id>

# Ban / unban user
telegram-axi chat ban <chat_id> --user <user_id>
telegram-axi chat unban <chat_id> --user <user_id>
```

### 3. Webhook Management (`webhook`)

```bash
# Check webhook status, pending updates count, and last error
telegram-axi webhook info

# Set webhook URL
telegram-axi webhook set https://api.myproject.com/tg-webhook [--secret <token>]

# Delete webhook (switch back to polling)
telegram-axi webhook delete [--drop-pending]
```

### 4. Updates Polling (`updates`)

```bash
# Fetch incoming updates (returns TOON table)
telegram-axi updates [--limit 10]

# Acknowledge and fetch next batch
telegram-axi updates --offset <next_offset>
```

### 5. Bot Menu Commands (`commands`)

```bash
# List configured commands
telegram-axi commands list

# Set bot menu commands
telegram-axi commands set --commands '[{"command":"start","description":"Start bot"},{"command":"help","description":"Usage info"}]'
```

### 6. Universal Raw API Fallback (`api`)

Execute **any of the 130+ Telegram Bot API methods** with automatic TOON formatting and error handling:

```bash
# Call getMe
telegram-axi api getMe

# Call sendChatAction
telegram-axi api sendChatAction --chat_id 123456789 --action typing

# Call sendInvoice (Telegram Stars)
telegram-axi api sendInvoice \
  --chat_id 123456789 \
  --title "Premium Access" \
  --description "1 Month Subscription" \
  --payload "order_123" \
  --currency "XTR" \
  --prices '[{"label":"1 Month","amount":100}]'
```

---

## Agent Ambient Context Integration

Install `SessionStart` hooks so Claude Code, Codex, and OpenCode load `telegram-axi` context automatically:

```bash
telegram-axi setup hooks
```

---

## Author & License

Created by **Nikita Guzenko** ([@NikGuzenko on X](https://x.com/NikGuzenko) / [GitHub @Nikita-Guzenko](https://github.com/Nikita-Guzenko)).

Licensed under the [MIT License](LICENSE).
