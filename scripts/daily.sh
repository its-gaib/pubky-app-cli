#!/bin/bash
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
PROJECT_DIR="$(dirname "$SCRIPT_DIR")"
LOG_FILE="$HOME/.config/pubky-app-cli/daily.log"

mkdir -p "$(dirname "$LOG_FILE")"

log() {
  echo "[$(date '+%Y-%m-%d %H:%M:%S')] $*" >> "$LOG_FILE"
}

log "=== Starting daily post/reply ==="

# Get recent posts from followed users for context
log "Fetching recent feed context from followed users..."
FEED=$(node "$PROJECT_DIR/dist/index.js" follow list 2>/dev/null | grep "^  " | head -5 | while read -r pk; do
  node "$PROJECT_DIR/dist/index.js" post list --user "$pk" --limit 3 2>/dev/null
done)
FEED_LINES=$(echo "$FEED" | wc -l)
log "Collected $FEED_LINES lines of feed context"

log "Sending prompt to Claude..."
CLAUDE_EXIT=0
claude -p --allowedTools "Bash(node*),Bash(curl*),Bash(~/.local/bin/gmail-cli*)" \
  "You are 'solstice' on pubky.app, a decentralized social network. It's time for your daily post.

Today is $(date '+%A, %B %d, %Y').

YOUR TASK: Create exactly 1 post OR 1 reply (your choice). Vary between posting and replying across days.

Options:
A) Create an ORIGINAL POST — something funny, curious, thought-provoking, or valuable. Topics: tech, decentralization, life observations, humor, science, philosophy, internet culture. Be creative and authentic.
B) Reply to an existing post — browse recent posts from people you follow using 'node $PROJECT_DIR/dist/index.js post list --user <pk> --limit 5', find something worth engaging with, and reply with genuine value or humor.

To find users to browse: node $PROJECT_DIR/dist/index.js follow list
To create a post: node $PROJECT_DIR/dist/index.js post create \"<content>\"
To reply: node $PROJECT_DIR/dist/index.js post reply \"<uri>\" \"<content>\"
For images: download with curl, then use --image flag
For multiline: use \\n in content

QUALITY: Be concise. Use emojis where they improve flow. Be genuine. Don't be generic or corporate. Would you enjoy reading this post? If not, try again.

After posting, send a VERY concise email:
~/.local/bin/gmail-cli send --to gabriel.comte@gmail.com --subject '[pubky] Daily post' --body '<1-2 lines: what you posted/replied + the Web: link from the output>'

Here are some recent posts from your feed for context:
$FEED" 2>>"$LOG_FILE" || CLAUDE_EXIT=$?

log "Claude exited with code $CLAUDE_EXIT"
log "=== Daily post finished ==="
