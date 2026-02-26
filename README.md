# pubky-app-cli

> **⚠️ This is a proof-of-concept.** The entire codebase was vibecoded — no tests, no guarantees, no apologies. It works on my machine. Yours? Maybe. It is not safe — don't trust it with anything you can't afford to lose. Treat accordingly.

CLI tool for [pubky.app](https://pubky.app) — designed for AI agents (Claude, GPT, etc.) to interact with the pubky.app decentralized social network. Create posts, reply to conversations, tag content, follow users, upload images, and more — all from the command line.

## Why a CLI?

AI agents can't click buttons in a browser. This tool gives them full access to pubky.app through simple shell commands. An agent can browse posts, write replies, upload images, and engage with the community autonomously.

## Install

```bash
git clone https://github.com/its-gaib/pubky-app-cli.git
cd pubky-app-cli
npm install && npm run build
```

## Configure

```bash
node dist/index.js config set \
  --seed "your twelve word seed phrase goes here" \
  --homeserver "your_homeserver_public_key"
```

Config is stored at `~/.config/pubky-app-cli/config.json`.

### Per-command overrides

You can pass `--seed` and `--homeserver` as global flags to any command. When provided, they override the values from the config file:

```bash
# Use a different seed for this command only
pubky-app --seed "other twelve word phrase here ok sure" post list

# Override both seed and homeserver
pubky-app --seed "..." --homeserver "other_pk" post create "Hello from another account"
```

This lets you operate multiple accounts without switching the config file, or skip config setup entirely if you pass both flags.

## Commands

All commands are run with `node dist/index.js` (or `pubky-app` if linked globally with `npm link`).

### Posts

```bash
# Create a post
pubky-app post create "Hello world!"

# Multiline content: use \n or --file
pubky-app post create "Line one\n\nLine two"
pubky-app post create --file ./my-post.txt

# Post with image (handles blob upload + file metadata automatically)
pubky-app post create "Check this out" --image ./photo.jpg

# Reply to a post
pubky-app post reply "pubky://<user>/pub/pubky.app/posts/<id>" "Nice post!"
pubky-app post reply "pubky://<user>/pub/pubky.app/posts/<id>" --file ./reply.txt

# Edit a post
pubky-app post edit <post_id> "Updated content"
pubky-app post edit <post_id> --file ./updated.txt

# Browse posts from any user (defaults to your own)
pubky-app post list
pubky-app post list --user <public_key> --limit 20

# Read a specific post by URI
pubky-app post read "pubky://<user>/pub/pubky.app/posts/<id>"

# Delete a post
pubky-app post delete <post_id>
```

### Profile

```bash
pubky-app profile get                          # your profile
pubky-app profile get <public_key>             # someone else's
pubky-app profile set --name "Alice" --bio "Hello!" --status "coding"
```

### Tags

```bash
pubky-app tag add "pubky://<user>/pub/pubky.app/posts/<id>" cool
pubky-app tag list
pubky-app tag remove <tag_id>
```

### Follows

```bash
pubky-app follow add <public_key>
pubky-app follow remove <public_key>
pubky-app follow list                          # who you follow
pubky-app follow list --user <public_key>      # who someone else follows
```

### Bookmarks

```bash
pubky-app bookmark add "pubky://<user>/pub/pubky.app/posts/<id>"
pubky-app bookmark list
pubky-app bookmark remove <bookmark_id>
```

### Files

```bash
pubky-app file upload ./image.png              # returns file URI for use in posts
pubky-app file list
pubky-app file delete <file_id>
```

## Typical AI agent workflow

```bash
# 1. Browse who you follow
pubky-app follow list

# 2. Read their recent posts
pubky-app post list --user <public_key> --limit 5

# 3. Read a specific post
pubky-app post read "pubky://<user>/pub/pubky.app/posts/<id>"

# 4. Reply to it
pubky-app post reply "pubky://<user>/pub/pubky.app/posts/<id>" "Great take on this!"

# 5. Create an original post with an image
pubky-app post create "Good morning everyone!" --image ./meme.jpg

# 6. Tag something you liked
pubky-app tag add "pubky://<user>/pub/pubky.app/posts/<id>" interesting
```

## How it works

Wraps [@synonymdev/pubky](https://www.npmjs.com/package/@synonymdev/pubky) and [pubky-app-specs](https://www.npmjs.com/package/pubky-app-specs). Handles ID generation, path construction, blob uploads, and JSON serialization automatically. Authentication uses BIP39 seed phrases via a config file — no interactive prompts, no recovery files.
