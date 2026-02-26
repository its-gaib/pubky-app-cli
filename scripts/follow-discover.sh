#!/bin/bash
# Follow a popular user (most followed by people you follow) every 3 days
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
PROJECT_DIR="$(dirname "$SCRIPT_DIR")"
CLI="node $PROJECT_DIR/dist/index.js"
LOG_FILE="$HOME/.config/pubky-app-cli/follow-discover.log"
GMAIL_CLI="$HOME/.local/bin/gmail-cli"

export NO_COLOR=1

mkdir -p "$(dirname "$LOG_FILE")"

log() {
  echo "[$(date '+%Y-%m-%d %H:%M:%S')] $*" >> "$LOG_FILE"
}

log "=== Starting follow discovery ==="

# Get my followed users
log "Fetching current follow list..."
mapfile -t MY_FOLLOWS < <($CLI follow list 2>/dev/null | awk '/^  [a-z0-9]/{print $1}')

if [ ${#MY_FOLLOWS[@]} -eq 0 ]; then
  log "No followed users found. Exiting."
  log "=== Follow discovery finished ==="
  exit 0
fi
log "Currently following ${#MY_FOLLOWS[@]} user(s)"

# Build exclusion set (my current follows + myself)
EXCLUDE_FILE=$(mktemp)
printf '%s\n' "${MY_FOLLOWS[@]}" > "$EXCLUDE_FILE"

MY_PK=$($CLI post list --limit 1 2>/dev/null \
  | grep "URI:" | head -1 \
  | sed -E 's|.*pubky[:/]*([a-z0-9]{52})/.*|\1|' || echo "")
[ -n "$MY_PK" ] && echo "$MY_PK" >> "$EXCLUDE_FILE"
log "My public key: ${MY_PK:-unknown}"

log "Scanning 2nd-degree connections from ${#MY_FOLLOWS[@]} followed users..."

# Collect all 2nd-degree follows
CANDIDATES_FILE=$(mktemp)
SCANNED=0
for pk in "${MY_FOLLOWS[@]}"; do
  $CLI follow list --user "$pk" --limit 50 2>/dev/null \
    | awk '/^  [a-z0-9]/{print $1}' >> "$CANDIDATES_FILE" || true
  SCANNED=$((SCANNED + 1))
done
TOTAL_CANDIDATES=$(wc -l < "$CANDIDATES_FILE")
log "Scanned $SCANNED users, found $TOTAL_CANDIDATES 2nd-degree follow entries"

if [ ! -s "$CANDIDATES_FILE" ]; then
  log "No 2nd-degree connections found. Exiting."
  rm -f "$EXCLUDE_FILE" "$CANDIDATES_FILE"
  log "=== Follow discovery finished ==="
  exit 0
fi

# Find most popular candidate not already followed
CANDIDATE=""
CANDIDATE_COUNT=0
CHECKED=0
while IFS= read -r line; do
  count=$(echo "$line" | awk '{print $1}')
  pk=$(echo "$line" | awk '{print $2}')
  CHECKED=$((CHECKED + 1))
  if ! grep -qF "$pk" "$EXCLUDE_FILE"; then
    CANDIDATE="$pk"
    CANDIDATE_COUNT="$count"
    break
  fi
done < <(sort "$CANDIDATES_FILE" | uniq -c | sort -rn)
UNIQUE_CANDIDATES=$(sort "$CANDIDATES_FILE" | uniq | wc -l)
log "Found $UNIQUE_CANDIDATES unique 2nd-degree users, checked $CHECKED before finding candidate"

rm -f "$EXCLUDE_FILE" "$CANDIDATES_FILE"

if [ -z "$CANDIDATE" ]; then
  log "No new users to follow (all candidates already followed)."
  log "=== Follow discovery finished ==="
  exit 0
fi

log "Selected candidate: $CANDIDATE (followed by $CANDIDATE_COUNT of my follows)"

# Follow the user
log "Following $CANDIDATE..."
$CLI follow add "$CANDIDATE" 2>>"$LOG_FILE"
log "Successfully followed $CANDIDATE"

PROFILE_LINK="https://pubky.app/profile/$CANDIDATE"

# Send email
$GMAIL_CLI send \
  --to gabriel.comte@gmail.com \
  --subject "[pubky] Followed a new user" \
  --body "Followed $CANDIDATE (popular among ${CANDIDATE_COUNT} of your follows) — $PROFILE_LINK" \
  2>>"$LOG_FILE"

log "Email notification sent."
log "=== Follow discovery finished ==="
