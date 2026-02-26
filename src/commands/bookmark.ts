import { Command } from "commander";
import chalk from "chalk";
import { withSession, withPublicAccess, getPublicKeyZ32, webUrlToPubkyUri } from "../client";

export function registerBookmarkCommands(program: Command): void {
  const bookmark = program.command("bookmark").description("Manage bookmarks");

  bookmark
    .command("add")
    .description("Bookmark a resource")
    .argument("<uri>", "URI or pubky.app URL to bookmark")
    .action(async (uri: string) => {
      uri = webUrlToPubkyUri(uri);
      await withSession(async (ctx) => {
        const { bookmark, meta } = ctx.specs.createBookmark(uri);
        await ctx.session.storage.putJson(meta.path, bookmark.toJson());

        console.log(chalk.green("Bookmarked!"));
        console.log(`  URI: ${uri}`);
        console.log(`  Bookmark ID: ${meta.id}`);
      });
    });

  bookmark
    .command("list")
    .description("List your bookmarks")
    .option("--limit <n>", "Limit results", "20")
    .action(async (opts: any) => {
      const limit = parseInt(opts.limit, 10);
      const userPk = getPublicKeyZ32();

      await withPublicAccess(async ({ publicStorage }) => {
        const address = `pubky${userPk}/pub/pubky.app/bookmarks/`;
        const entries: string[] = await publicStorage.list(address, null, false, limit, true);

        if (entries.length === 0) {
          console.log("No bookmarks found.");
          return;
        }

        console.log(chalk.bold(`Bookmarks (${entries.length}):`));
        for (const entry of entries) {
          try {
            const bmData = await publicStorage.getJson(entry);
            const bmId = entry.split("/").pop();
            console.log(`  ${chalk.cyan(bmId)} -> ${bmData.uri}`);
          } catch {
            console.log(chalk.dim(`  (Could not read bookmark at ${entry})`));
          }
        }
      });
    });

  bookmark
    .command("remove")
    .description("Remove a bookmark")
    .argument("<bookmark-id>", "Bookmark ID to remove")
    .action(async (bookmarkId: string) => {
      await withSession(async (ctx) => {
        const bmPath = `/pub/pubky.app/bookmarks/${bookmarkId}`;
        await ctx.session.storage.delete(bmPath);
        console.log(chalk.green(`Bookmark ${bookmarkId} removed.`));
      });
    });
}
