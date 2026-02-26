import { Command } from "commander";
import * as fs from "fs";
import * as path from "path";
import chalk from "chalk";
import { withSession, withPublicAccess, getPublicKeyZ32, stripPubkyPrefix } from "../client";

export function registerFileCommands(program: Command): void {
  const file = program.command("file").description("Manage files");

  file
    .command("upload")
    .description("Upload a file")
    .argument("<path>", "Local file path to upload")
    .action(async (filePath: string) => {
      const absPath = path.resolve(filePath);
      if (!fs.existsSync(absPath)) {
        console.error(`File not found: ${absPath}`);
        process.exit(1);
      }

      const data = fs.readFileSync(absPath);
      const fileName = path.basename(absPath);
      const ext = path.extname(absPath).toLowerCase();

      const mimeMap: Record<string, string> = {
        ".jpg": "image/jpeg",
        ".jpeg": "image/jpeg",
        ".png": "image/png",
        ".gif": "image/gif",
        ".webp": "image/webp",
        ".svg": "image/svg+xml",
        ".mp4": "video/mp4",
        ".webm": "video/webm",
        ".pdf": "application/pdf",
        ".txt": "text/plain",
        ".json": "application/json",
      };
      const contentType = mimeMap[ext] || "application/octet-stream";

      await withSession(async (ctx) => {
        // Upload blob
        const blobResult = ctx.specs.createBlob(Array.from(new Uint8Array(data)));
        await ctx.session.storage.putBytes(blobResult.meta.path, new Uint8Array(data));
        console.log(chalk.dim(`Blob uploaded: ${blobResult.meta.url}`));

        // Create file metadata
        const fileResult = ctx.specs.createFile(
          fileName,
          blobResult.meta.url,
          contentType,
          data.length
        );
        await ctx.session.storage.putJson(fileResult.meta.path, fileResult.file.toJson());

        console.log(chalk.green("File uploaded!"));
        console.log(`  Name: ${fileName}`);
        console.log(`  Size: ${data.length} bytes`);
        console.log(`  Type: ${contentType}`);
        console.log(`  File ID: ${fileResult.meta.id}`);
        console.log(`  File URI: ${fileResult.meta.url}`);
        console.log(`  Blob URI: ${blobResult.meta.url}`);
      });
    });

  file
    .command("list")
    .description("List uploaded files")
    .option("--user <pk>", "User public key (z32). Defaults to your own.")
    .option("--limit <n>", "Limit results", "20")
    .action(async (opts: any) => {
      const userPk = opts.user ? stripPubkyPrefix(opts.user) : getPublicKeyZ32();
      const limit = parseInt(opts.limit, 10);

      await withPublicAccess(async ({ publicStorage }) => {
        const address = `pubky${userPk}/pub/pubky.app/files/`;
        const entries: string[] = await publicStorage.list(address, null, false, limit, true);

        if (entries.length === 0) {
          console.log("No files found.");
          return;
        }

        console.log(chalk.bold(`Files (${entries.length}):`));
        for (const entry of entries) {
          try {
            const fileData = await publicStorage.getJson(entry);
            const fileId = entry.split("/").pop();
            console.log(
              `  ${chalk.cyan(fileId)} | ${fileData.name} | ${fileData.content_type} | ${fileData.size} bytes`
            );
          } catch {
            console.log(chalk.dim(`  (Could not read file at ${entry})`));
          }
        }
      });
    });

  file
    .command("delete")
    .description("Delete a file")
    .argument("<file-id>", "File ID to delete")
    .action(async (fileId: string) => {
      await withSession(async (ctx) => {
        // Try to get the file metadata first to find the blob
        try {
          const filePath = `/pub/pubky.app/files/${fileId}`;
          const fileData = await ctx.session.storage.getJson(filePath);
          // Delete the blob if we can parse the src
          if (fileData.src) {
            const blobPath = fileData.src.split("/pub/")[1];
            if (blobPath) {
              await ctx.session.storage.delete(`/pub/${blobPath}`);
              console.log(chalk.dim("  Blob deleted."));
            }
          }
        } catch {
          // ignore - just delete the file entry
        }

        await ctx.session.storage.delete(`/pub/pubky.app/files/${fileId}`);
        console.log(chalk.green(`File ${fileId} deleted.`));
      });
    });
}
