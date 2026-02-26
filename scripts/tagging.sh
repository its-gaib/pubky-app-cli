#!/bin/bash
# Tag recent posts/replies (< 24h) from followed users with AI-generated tags
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
PROJECT_DIR="$(dirname "$SCRIPT_DIR")"
CLI="node $PROJECT_DIR/dist/index.js"
LOG_FILE="$HOME/.config/pubky-app-cli/tagging.log"
GMAIL_CLI="$HOME/.local/bin/gmail-cli"

export NO_COLOR=1

mkdir -p "$(dirname "$LOG_FILE")"

log() {
  echo "[$(date '+%Y-%m-%d %H:%M:%S')] $*" >> "$LOG_FILE"
}

log "=== Starting tagging run ==="

# Get followed users' public keys
log "Fetching followed users..."
mapfile -t FOLLOWS < <($CLI follow list 2>/dev/null | awk '/^  [a-z0-9]/{print $1}')

if [ ${#FOLLOWS[@]} -eq 0 ]; then
  log "No followed users found. Exiting."
  exit 0
fi
log "Found ${#FOLLOWS[@]} followed user(s)"

# Shuffle and collect posts from up to 10 random followed users
mapfile -t SHUFFLED < <(printf '%s\n' "${FOLLOWS[@]}" | shuf | head -10)
log "Sampling posts from ${#SHUFFLED[@]} random followed user(s)"

ALL_URIS=()
for pk in "${SHUFFLED[@]}"; do
  while IFS= read -r line; do
    uri=$(echo "$line" | sed 's/^[[:space:]]*URI:[[:space:]]*//')
    [ -n "$uri" ] && ALL_URIS+=("$uri")
  done < <($CLI post list --user "$pk" --limit 5 --reverse 2>/dev/null | grep "^[[:space:]]*URI:" || true)
done
log "Collected ${#ALL_URIS[@]} total post URIs"

# Filter to only posts/replies younger than 24 hours
# Post IDs come in two formats:
#   - Crockford Base32 (13 alpha chars): decoded_value / 2 = timestamp in µs
#   - Numeric (all digits): value is timestamp in ms
mapfile -t POST_URIS < <(printf '%s\n' "${ALL_URIS[@]}" | node -e "
const C='0123456789ABCDEFGHJKMNPQRSTVWXYZ';
const cutoffMs = Date.now() - 86400000;
const lines = require('fs').readFileSync('/dev/stdin','utf-8').trim().split('\n').filter(Boolean);
for (const uri of lines) {
  const id = uri.split('/').pop();
  let ms;
  if (/^\d+$/.test(id)) {
    ms = Number(id);
  } else {
    let n = 0n;
    for (const c of id.toUpperCase()) n = n * 32n + BigInt(C.indexOf(c));
    ms = Number(n / 2000n);
  }
  if (ms > cutoffMs) console.log(uri);
}
")

log "Filtered to ${#POST_URIS[@]} posts younger than 24h"

if [ ${#POST_URIS[@]} -eq 0 ]; then
  log "No recent posts (< 24h) found from followed users."
  exit 0
fi

# Get our own public key to check if we already tagged a post
MY_PK=$($CLI post list --limit 1 2>/dev/null \
  | grep "URI:" | head -1 \
  | sed -E 's|.*pubky[:/]*([a-z0-9]{52})/.*|\1|' || echo "")
log "My public key: ${MY_PK:-unknown}"

# Shuffle the candidates so we don't always try the same order
mapfile -t POST_URIS < <(printf '%s\n' "${POST_URIS[@]}" | shuf)

# Loop through candidates until we find one we haven't tagged yet
TARGET_URI=""
POST_PK=""
POST_ID=""
WEB_LINK=""
POST_CONTENT=""
EXISTING_LABELS=()

for candidate in "${POST_URIS[@]}"; do
  log "Trying candidate: $candidate"

  # Extract pk and postId
  STRIPPED=$(echo "$candidate" | sed -E 's|^pubky://||; s|^pubky||')
  CAND_PK=$(echo "$STRIPPED" | cut -d'/' -f1)
  CAND_ID=$(echo "$candidate" | rev | cut -d'/' -f1 | rev)

  # Query Nexus API for existing tags
  NEXUS_RESP=$(curl -sf "https://nexus.pubky.app/v0/post/$CAND_PK/$CAND_ID/tags" 2>/dev/null || echo "")

  # Check if we already tagged this post
  if [ -n "$NEXUS_RESP" ] && [ -n "$MY_PK" ]; then
    ALREADY_TAGGED=$(echo "$NEXUS_RESP" | node -e "
      const data = JSON.parse(require('fs').readFileSync('/dev/stdin','utf-8'));
      const me = '$MY_PK';
      const tagged = Array.isArray(data) && data.some(t => t.taggers && t.taggers.includes(me));
      console.log(tagged ? 'yes' : 'no');
    " 2>/dev/null)
    if [ "$ALREADY_TAGGED" = "yes" ]; then
      log "Already tagged this post. Skipping."
      continue
    fi
  fi

  # Read post content
  CAND_CONTENT_FULL=$($CLI post read "$candidate" 2>/dev/null || echo "")
  CAND_CONTENT=$(echo "$CAND_CONTENT_FULL" \
    | grep "Content:" | head -1 \
    | sed 's/^[[:space:]]*Content:[[:space:]]*//')

  if [ -z "$CAND_CONTENT" ]; then
    log "No text content. Skipping."
    continue
  fi

  # Found a valid candidate
  TARGET_URI="$candidate"
  POST_PK="$CAND_PK"
  POST_ID="$CAND_ID"
  WEB_LINK="https://pubky.app/post/$POST_PK/$POST_ID"
  POST_CONTENT="$CAND_CONTENT"

  # Extract existing tag labels (excluding our own)
  EXISTING_LABELS=()
  if [ -n "$NEXUS_RESP" ]; then
    mapfile -t EXISTING_LABELS < <(echo "$NEXUS_RESP" | node -e "
      const data = JSON.parse(require('fs').readFileSync('/dev/stdin','utf-8'));
      if (Array.isArray(data)) data.forEach(t => t.label && console.log(t.label));
    " 2>/dev/null)
  fi
  break
done

if [ -z "$TARGET_URI" ]; then
  log "No untagged posts with content found among ${#POST_URIS[@]} candidates."
  exit 0
fi

log "Selected post: $TARGET_URI"
log "Post content: ${POST_CONTENT:0:120}"

# Determine tags: retag existing or generate new
if [ ${#EXISTING_LABELS[@]} -gt 0 ]; then
  log "Found ${#EXISTING_LABELS[@]} existing tag(s) on this post: ${EXISTING_LABELS[*]}"
  log "Retagging existing labels instead of generating new ones"
  TAGS=("${EXISTING_LABELS[@]}")
else
  log "No existing tags found. Asking Claude to generate tags..."
  TAGS_RAW=$(claude -p --model haiku \
    "TASK: Output 1-3 tags for a social media post. STRICT FORMAT: one lowercase single-word tag per line. Nothing else.

RULES:
- Each tag MUST be a single word: no spaces, no hyphens, no hashtags, no punctuation, no numbering
- Tags should be topical and relevant to the content
- If the post contains a URL, infer the topic from the domain name or any visible context (e.g. x.com -> social, github.com -> code)
- NEVER ask questions, NEVER explain, NEVER refuse. Just output tags.

EXAMPLES:
Post: Just deployed my first Rust project to production!
rust
deployment
milestone

Post: https://arxiv.org/abs/2301.07041
research
arxiv
science

Post: Why do programmers prefer dark mode? Because light attracts bugs 🐛
humor
programming
bugs

NOW TAG THIS POST:
$POST_CONTENT" 2>>"$LOG_FILE")

  if [ -z "$TAGS_RAW" ]; then
    log "Claude returned empty response. Skipping."
    exit 1
  fi

  # Parse tags: lowercase, strip whitespace, keep only single-word lines (no spaces)
  mapfile -t TAGS < <(echo "$TAGS_RAW" | tr '[:upper:]' '[:lower:]' | sed 's/^[[:space:]]*//;s/[[:space:]]*$//' | grep -v '^$' | grep -v ' ' | head -3)
  log "Claude suggested ${#TAGS[@]} tag(s): ${TAGS[*]}"

  if [ ${#TAGS[@]} -eq 0 ]; then
    log "No valid tags parsed from Claude response."
    exit 1
  fi
fi

# Add tags
ADDED_TAGS=()
for tag in "${TAGS[@]}"; do
  log "Adding tag: $tag"
  if $CLI tag add "$TARGET_URI" "$tag" 2>>"$LOG_FILE"; then
    ADDED_TAGS+=("$tag")
    log "Successfully added tag: $tag"
  else
    log "Failed to add tag: $tag"
  fi
done

if [ ${#ADDED_TAGS[@]} -eq 0 ]; then
  log "No tags were added."
  exit 1
fi

# Format tags for email
TAG_LIST=$(printf ", %s" "${ADDED_TAGS[@]}")
TAG_LIST="${TAG_LIST:2}"

# Send email summary
$GMAIL_CLI send \
  --to gabriel.comte@gmail.com \
  --subject "[pubky] Tagged a post" \
  --body "Added tags [$TAG_LIST] to: \"${POST_CONTENT}\" — $WEB_LINK" \
  2>>"$LOG_FILE"

log "Email sent. Tagging run complete."
log "=== Tagging run finished ==="
