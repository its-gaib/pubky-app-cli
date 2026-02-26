import { Command } from "commander";
import { PubkyAppPostKind, PubkyAppPost } from "pubky-app-specs";
import * as fs from "fs";
import * as path from "path";
import chalk from "chalk";
import { withSession, withPublicAccess, getPublicKeyZ32 } from "../client";

function resolveContent(content: string | undefined, fileOpt: string | undefined): string {
  if (fileOpt) {
    const absPath = path.resolve(fileOpt);
    return fs.readFileSync(absPath, "utf-8").trimEnd();
  }
  if (!content) {
    console.error("Provide content as an argument or use --file <path>");
    process.exit(1);
  }
  // Process escape sequences so users can write \n for newlines
  return content.replace(/\\n/g, "\n");
}

export function registerPostCommands(program: Command): void {
  const post = program.command("post").description("Manage posts");

  post
    .command("create")
    .description("Create a new post")
    .argument("[content]", "Post content (supports \\n for newlines)")
    .option("-f, --file <path>", "Read content from a file instead")
    .option("--long", "Create a long-form post")
    .option("--image <paths...>", "Attach images (local file paths)")
    .option("--link", "Create a link post")
    .action(async (content: string | undefined, opts: any) => {
      const body = resolveContent(content, opts.file);

      await withSession(async (ctx) => {
        let kind = PubkyAppPostKind.Short;
        let attachments: string[] | null = null;

        if (opts.long) kind = PubkyAppPostKind.Long;
        if (opts.link) kind = PubkyAppPostKind.Link;

        if (opts.image) {
          kind = PubkyAppPostKind.Image;
          attachments = [];

          for (const imgPath of opts.image) {
            const absPath = path.resolve(imgPath);
            const data = fs.readFileSync(absPath);
            const ext = path.extname(absPath).toLowerCase();
            const mimeMap: Record<string, string> = {
              ".jpg": "image/jpeg",
              ".jpeg": "image/jpeg",
              ".png": "image/png",
              ".gif": "image/gif",
              ".webp": "image/webp",
              ".svg": "image/svg+xml",
            };
            const contentType = mimeMap[ext] || "application/octet-stream";
            const fileName = path.basename(absPath);

            // Upload blob
            const blobResult = ctx.specs.createBlob(Array.from(new Uint8Array(data)));
            await ctx.session.storage.putBytes(blobResult.meta.path, new Uint8Array(data));
            console.log(chalk.dim(`  Blob uploaded: ${blobResult.meta.url}`));

            // Create file entry
            const fileResult = ctx.specs.createFile(
              fileName,
              blobResult.meta.url,
              contentType,
              data.length
            );
            await ctx.session.storage.putJson(fileResult.meta.path, fileResult.file.toJson());
            console.log(chalk.dim(`  File created: ${fileResult.meta.url}`));

            attachments.push(fileResult.meta.url);
          }
        }

        const { post, meta } = ctx.specs.createPost(
          body,
          kind,
          null,
          null,
          attachments
        );
        await ctx.session.storage.putJson(meta.path, post.toJson());

        console.log(chalk.green("Post created!"));
        console.log(`  ID: ${meta.id}`);
        console.log(`  URI: ${meta.url}`);
      });
    });

  post
    .command("reply")
    .description("Reply to a post")
    .argument("<post-uri>", "URI of the post to reply to")
    .argument("[content]", "Reply content (supports \\n for newlines)")
    .option("-f, --file <path>", "Read content from a file instead")
    .action(async (postUri: string, content: string | undefined, opts: any) => {
      const body = resolveContent(content, opts.file);

      await withSession(async (ctx) => {
        const { post, meta } = ctx.specs.createPost(
          body,
          PubkyAppPostKind.Short,
          postUri,
          null,
          null
        );
        await ctx.session.storage.putJson(meta.path, post.toJson());

        console.log(chalk.green("Reply posted!"));
        console.log(`  ID: ${meta.id}`);
        console.log(`  URI: ${meta.url}`);
        console.log(`  In reply to: ${postUri}`);
      });
    });

  post
    .command("edit")
    .description("Edit an existing post's content")
    .argument("<post-id>", "ID of the post to edit")
    .argument("[content]", "New content (supports \\n for newlines)")
    .option("-f, --file <path>", "Read new content from a file instead")
    .action(async (postId: string, content: string | undefined, opts: any) => {
      const newContent = resolveContent(content, opts.file);

      await withSession(async (ctx) => {
        const postPath = `/pub/pubky.app/posts/${postId}`;
        const existing = await ctx.session.storage.getJson(postPath);
        const originalPost = PubkyAppPost.fromJson(existing);

        const { post, meta } = ctx.specs.editPost(originalPost, postId, newContent);
        await ctx.session.storage.putJson(meta.path, post.toJson());

        console.log(chalk.green("Post edited!"));
        console.log(`  ID: ${meta.id}`);
        console.log(`  URI: ${meta.url}`);
      });
    });

  post
    .command("list")
    .description("List posts from a user")
    .option("--user <pk>", "User public key (z32). Defaults to your own.")
    .option("--limit <n>", "Limit number of results", "10")
    .option("--reverse", "Reverse order (oldest first)")
    .action(async (opts: any) => {
      const userPk = opts.user || getPublicKeyZ32();
      const limit = parseInt(opts.limit, 10);

      await withPublicAccess(async ({ publicStorage }) => {
        const address = `pubky${userPk}/pub/pubky.app/posts/`;
        const entries: string[] = await publicStorage.list(
          address,
          null,
          opts.reverse || false,
          limit,
          true
        );

        if (entries.length === 0) {
          console.log("No posts found.");
          return;
        }

        for (const entry of entries) {
          try {
            const postData = await publicStorage.getJson(entry);
            const postId = entry.split("/").pop();
            console.log(chalk.bold(`--- Post ${postId} ---`));
            console.log(`  Kind: ${postData.kind}`);
            console.log(`  Content: ${postData.content?.substring(0, 200)}`);
            if (postData.parent) console.log(`  Reply to: ${postData.parent}`);
            if (postData.attachments?.length) {
              console.log(`  Attachments: ${postData.attachments.length}`);
            }
            console.log(`  URI: ${entry}`);
            console.log();
          } catch (e: any) {
            console.log(chalk.dim(`  (Could not read post at ${entry})`));
          }
        }
      });
    });

  post
    .command("read")
    .description("Read a specific post")
    .argument("<uri>", "Post URI (pubky://...)")
    .action(async (uri: string) => {
      await withPublicAccess(async ({ publicStorage }) => {
        // Convert pubky:// URI to address format
        const address = uri.replace("pubky://", "pubky");
        const postData = await publicStorage.getJson(address);

        console.log(chalk.bold("Post:"));
        console.log(`  Kind: ${postData.kind}`);
        console.log(`  Content: ${postData.content}`);
        if (postData.parent) console.log(`  Reply to: ${postData.parent}`);
        if (postData.embed) {
          console.log(`  Embed: ${postData.embed.uri} (${postData.embed.kind})`);
        }
        if (postData.attachments?.length) {
          console.log(`  Attachments:`);
          for (const att of postData.attachments) {
            console.log(`    - ${att}`);
          }
        }
      });
    });

  post
    .command("delete")
    .description("Delete a post")
    .argument("<post-id>", "Post ID to delete")
    .action(async (postId: string) => {
      await withSession(async (ctx) => {
        const postPath = `/pub/pubky.app/posts/${postId}`;
        await ctx.session.storage.delete(postPath);
        console.log(chalk.green(`Post ${postId} deleted.`));
      });
    });
}
