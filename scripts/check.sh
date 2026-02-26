#!/bin/bash
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
PROJECT_DIR="$(dirname "$SCRIPT_DIR")"
LOG_FILE="$HOME/.config/pubky-app-cli/monitor.log"

mkdir -p "$(dirname "$LOG_FILE")"

log() {
  echo "[$(date '+%Y-%m-%d %H:%M:%S')] $*" >> "$LOG_FILE"
}

log "Starting interaction check..."

# Run monitor to detect new interactions
INTERACTIONS=$(node "$PROJECT_DIR/dist/monitor.js" 2>>"$LOG_FILE")

# Check if there are any interactions
COUNT=$(echo "$INTERACTIONS" | node -e "
  const data = require('fs').readFileSync('/dev/stdin','utf-8');
  const arr = JSON.parse(data);
  console.log(arr.length);
")

if [ "$COUNT" = "0" ]; then
  log "No new interactions found."
  exit 0
fi

log "Found $COUNT new interaction(s). Sending to Claude for evaluation..."

# Write interactions to temp file for Claude
TMPFILE=$(mktemp /tmp/pubky-interactions-XXXXXX.json)
echo "$INTERACTIONS" > "$TMPFILE"

# Call Claude to evaluate and respond
claude -p --allowedTools "Bash(node*),Bash(~/.local/bin/gmail-cli*)" \
  "You are 'solstice' on pubky.app. You have new interactions to evaluate.

RULES:
- Only respond when you can genuinely add value, are asked a question, or have something witty to say
- Skip simple acknowledgments, emoji-only replies, or things that don't need a response
- Be concise (1-3 sentences). Use emojis where they improve flow.
- Be genuine, warm, human-sounding

For each interaction you decide to reply to:
1. Post the reply using: node $PROJECT_DIR/dist/index.js post reply \"<postUri>\" \"<your reply>\"
2. Send a VERY concise email summary: ~/.local/bin/gmail-cli send --to gabriel.comte@gmail.com --subject '[pubky] Replied to a post' --body '<1-2 lines: what you replied to and your reply, plus the Web: link from the post output>'

For interactions you skip, do nothing.

Here are the interactions:
$(cat "$TMPFILE")" 2>>"$LOG_FILE"

rm -f "$TMPFILE"
log "Check complete."
