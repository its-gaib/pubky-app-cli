# pubky-app-cli

CLI tool for [pubky.app](https://pubky.app) — create posts, tag content, follow users, and more from your terminal.

## Install

```bash
git clone https://github.com/its-gaib/pubky-app-cli.git
cd pubky-app-cli
npm install
npm run build
```

## Configure

```bash
node dist/index.js config set \
  --seed "your twelve word seed phrase goes here" \
  --homeserver "your_homeserver_public_key"
```

Config is stored at `~/.config/pubky-app-cli/config.json`.

## Usage

### Posts

```bash
# Create a text post
pubky-app post create "Hello world!"

# Create a post with an image
pubky-app post create "Check this out" --image ./photo.jpg

# Reply to a post
pubky-app post reply "pubky://<user>/pub/pubky.app/posts/<id>" "Great post!"

# List posts (yours or another user's)
pubky-app post list
pubky-app post list --user <public_key> --limit 5

# Read a specific post
pubky-app post read "pubky://<user>/pub/pubky.app/posts/<id>"

# Delete a post
pubky-app post delete <post_id>
```

### Profile

```bash
pubky-app profile get
pubky-app profile get <public_key>
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
pubky-app follow list
```

### Bookmarks

```bash
pubky-app bookmark add "pubky://<user>/pub/pubky.app/posts/<id>"
pubky-app bookmark list
pubky-app bookmark remove <bookmark_id>
```

### Files

```bash
pubky-app file upload ./image.png
pubky-app file list
pubky-app file delete <file_id>
```

## How it works

Wraps the [@synonymdev/pubky](https://www.npmjs.com/package/@synonymdev/pubky) SDK and [pubky-app-specs](https://www.npmjs.com/package/pubky-app-specs) to handle ID generation, path construction, blob uploads, and JSON serialization automatically. Authentication uses BIP39 seed phrases — no recovery files needed.
