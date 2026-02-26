#!/usr/bin/env node

/**
 * Monitor for new interactions on pubky.app.
 * Detects:
 *   1. Direct replies to my posts
 *   2. Replies to replies I made (thread continuation)
 *   3. Mentions of my public key in posts
 *   7. New activity in threads I participated in
 *
 * Outputs JSON array of new interactions to stdout.
 * Tracks state in ~/.config/pubky-app-cli/state.json
 */

import { Pubky, Keypair } from "@synonymdev/pubky";
import * as bip39 from "bip39";
import * as fs from "fs";
import * as path from "path";
import * as os from "os";
import { loadConfig } from "./config";

const STATE_DIR = path.join(os.homedir(), ".config", "pubky-app-cli");
const STATE_FILE = path.join(STATE_DIR, "state.json");

interface State {
  seenPostIds: string[];       // post URIs we've already processed
  myPostUris: string[];        // URIs of posts we authored
  myThreadUris: string[];      // URIs of posts we replied to (threads we're in)
  lastCheck: number;
}

interface Interaction {
  type: "reply_to_me" | "thread_activity" | "mention";
  postUri: string;
  postContent: string;
  postKind: string;
  authorPk: string;
  parentUri?: string;
  threadContext?: string;      // content of the post they replied to
}

function loadState(): State {
  if (fs.existsSync(STATE_FILE)) {
    return JSON.parse(fs.readFileSync(STATE_FILE, "utf-8"));
  }
  return { seenPostIds: [], myPostUris: [], myThreadUris: [], lastCheck: 0 };
}

function saveState(state: State): void {
  fs.mkdirSync(STATE_DIR, { recursive: true });
  // Keep state from growing unbounded: only keep last 500 entries
  state.seenPostIds = state.seenPostIds.slice(-500);
  state.myPostUris = state.myPostUris.slice(-200);
  state.myThreadUris = state.myThreadUris.slice(-200);
  fs.writeFileSync(STATE_FILE, JSON.stringify(state, null, 2));
}

async function main() {
  const config = loadConfig();
  const seed = bip39.mnemonicToSeedSync(config.seed);
  const keypair = Keypair.fromSecret(new Uint8Array(seed.subarray(0, 32)));
  const myZ32 = keypair.publicKey.z32();
  const myPkStr = keypair.publicKey.toString(); // "pubky<z32>"

  const pubky = new Pubky();
  const pub = pubky.publicStorage;
  const state = loadState();

  // Step 1: Refresh my own posts to know what URIs are mine
  try {
    const myPostEntries: string[] = await pub.list(
      `pubky${myZ32}/pub/pubky.app/posts/`,
      null, false, 50, true
    );
    for (const uri of myPostEntries) {
      if (!state.myPostUris.includes(uri)) {
        state.myPostUris.push(uri);
        // Check if this post is a reply — if so, track the thread
        try {
          const postData = await pub.getJson(uri as any);
          if (postData.parent && !state.myThreadUris.includes(postData.parent)) {
            state.myThreadUris.push(postData.parent);
          }
        } catch {}
      }
    }
  } catch (e: any) {
    console.error(`Error listing my posts: ${e.message}`);
  }

  // Step 2: Get list of followed users
  let followedUsers: string[] = [];
  try {
    const followEntries: string[] = await pub.list(
      `pubky${myZ32}/pub/pubky.app/follows/`,
      null, false, 100, true
    );
    followedUsers = followEntries.map((uri: string) => {
      const parts = uri.split("/");
      return parts[parts.length - 1];
    });
  } catch (e: any) {
    console.error(`Error listing follows: ${e.message}`);
  }

  const interactions: Interaction[] = [];

  // Step 3: Check each followed user's recent posts
  for (const userPk of followedUsers) {
    if (userPk === myZ32) continue;

    try {
      const userPosts: string[] = await pub.list(
        `pubky${userPk}/pub/pubky.app/posts/`,
        null, false, 20, true
      );

      for (const postUri of userPosts) {
        if (state.seenPostIds.includes(postUri)) continue;
        state.seenPostIds.push(postUri);

        try {
          const postData = await pub.getJson(postUri as any);
          const content = postData.content || "";

          // Check 1: Direct reply to one of my posts
          if (postData.parent && state.myPostUris.includes(postData.parent)) {
            let threadContext = "";
            try {
              const parentData = await pub.getJson(postData.parent as any);
              threadContext = parentData.content || "";
            } catch {}

            interactions.push({
              type: "reply_to_me",
              postUri,
              postContent: content,
              postKind: postData.kind,
              authorPk: userPk,
              parentUri: postData.parent,
              threadContext,
            });
            continue;
          }

          // Check 2 & 7: Reply in a thread I participated in
          if (postData.parent && state.myThreadUris.includes(postData.parent)) {
            let threadContext = "";
            try {
              const parentData = await pub.getJson(postData.parent as any);
              threadContext = parentData.content || "";
            } catch {}

            interactions.push({
              type: "thread_activity",
              postUri,
              postContent: content,
              postKind: postData.kind,
              authorPk: userPk,
              parentUri: postData.parent,
              threadContext,
            });
            continue;
          }

          // Also check if this post's parent is one of MY reply URIs (reply to my reply)
          if (postData.parent) {
            const parentIsMyPost = state.myPostUris.some(
              (myUri: string) => postData.parent === myUri
            );
            if (parentIsMyPost) {
              let threadContext = "";
              try {
                const parentData = await pub.getJson(postData.parent as any);
                threadContext = parentData.content || "";
              } catch {}

              interactions.push({
                type: "reply_to_me",
                postUri,
                postContent: content,
                postKind: postData.kind,
                authorPk: userPk,
                parentUri: postData.parent,
                threadContext,
              });
              continue;
            }
          }

          // Check 3: Mention of my public key in content
          if (content.includes(myZ32) || content.includes(myPkStr)) {
            interactions.push({
              type: "mention",
              postUri,
              postContent: content,
              postKind: postData.kind,
              authorPk: userPk,
            });
          }
        } catch {}
      }
    } catch {}
  }

  state.lastCheck = Date.now();
  saveState(state);

  // Output interactions as JSON to stdout
  console.log(JSON.stringify(interactions, null, 2));
}

main().catch((err) => {
  console.error(`Monitor error: ${err.message}`);
  process.exit(1);
});
