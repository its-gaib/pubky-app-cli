import { Command } from "commander";
import chalk from "chalk";
import { withSession, withPublicAccess, getPublicKeyZ32, stripPubkyPrefix } from "../client";

export function registerTagCommands(program: Command): void {
  const tag = program.command("tag").description("Manage tags");

  tag
    .command("add")
    .description("Tag a resource")
    .argument("<uri>", "URI of the resource to tag")
    .argument("<label>", "Tag label (1-20 chars, lowercase, no commas/colons)")
    .action(async (uri: string, label: string) => {
      await withSession(async (ctx) => {
        const { tag, meta } = ctx.specs.createTag(uri, label);
        await ctx.session.storage.putJson(meta.path, tag.toJson());

        console.log(chalk.green(`Tagged!`));
        console.log(`  URI: ${uri}`);
        console.log(`  Label: ${label}`);
        console.log(`  Tag ID: ${meta.id}`);
      });
    });

  tag
    .command("list")
    .description("List your tags")
    .option("--user <pk>", "User public key (z32). Defaults to your own.")
    .option("--limit <n>", "Limit results", "20")
    .action(async (opts: any) => {
      const userPk = opts.user ? stripPubkyPrefix(opts.user) : getPublicKeyZ32();
      const limit = parseInt(opts.limit, 10);

      await withPublicAccess(async ({ publicStorage }) => {
        const address = `pubky${userPk}/pub/pubky.app/tags/`;
        const entries: string[] = await publicStorage.list(address, null, false, limit, true);

        if (entries.length === 0) {
          console.log("No tags found.");
          return;
        }

        for (const entry of entries) {
          try {
            const tagData = await publicStorage.getJson(entry);
            const tagId = entry.split("/").pop();
            console.log(`  ${chalk.cyan(tagData.label)} -> ${tagData.uri}  (id: ${tagId})`);
          } catch {
            console.log(chalk.dim(`  (Could not read tag at ${entry})`));
          }
        }
      });
    });

  tag
    .command("remove")
    .description("Remove a tag")
    .argument("<tag-id>", "Tag ID to remove")
    .action(async (tagId: string) => {
      await withSession(async (ctx) => {
        const tagPath = `/pub/pubky.app/tags/${tagId}`;
        await ctx.session.storage.delete(tagPath);
        console.log(chalk.green(`Tag ${tagId} removed.`));
      });
    });
}
