import { Command } from "commander";
import chalk from "chalk";
import { withSession, withPublicAccess, getPublicKeyZ32, stripPubkyPrefix } from "../client";

export function registerFollowCommands(program: Command): void {
  const follow = program.command("follow").description("Follow/unfollow users");

  follow
    .command("add")
    .description("Follow a user")
    .argument("<user-pk>", "Public key (z32) of the user to follow")
    .action(async (rawPk: string) => {
      const userPk = stripPubkyPrefix(rawPk);
      await withSession(async (ctx) => {
        const { follow, meta } = ctx.specs.createFollow(userPk);
        await ctx.session.storage.putJson(meta.path, follow.toJson());

        console.log(chalk.green(`Now following ${userPk}`));
      });
    });

  follow
    .command("remove")
    .description("Unfollow a user")
    .argument("<user-pk>", "Public key (z32) of the user to unfollow")
    .action(async (rawPk: string) => {
      const userPk = stripPubkyPrefix(rawPk);
      await withSession(async (ctx) => {
        const followPath = `/pub/pubky.app/follows/${userPk}`;
        await ctx.session.storage.delete(followPath);
        console.log(chalk.green(`Unfollowed ${userPk}`));
      });
    });

  follow
    .command("list")
    .description("List who a user follows")
    .option("--user <pk>", "User public key (z32). Defaults to your own.")
    .option("--limit <n>", "Limit results", "50")
    .action(async (opts: any) => {
      const userPk = opts.user ? stripPubkyPrefix(opts.user) : getPublicKeyZ32();
      const limit = parseInt(opts.limit, 10);

      await withPublicAccess(async ({ publicStorage }) => {
        const address = `pubky${userPk}/pub/pubky.app/follows/`;
        const entries: string[] = await publicStorage.list(address, null, false, limit, true);

        if (entries.length === 0) {
          console.log("Not following anyone.");
          return;
        }

        console.log(chalk.bold(`Following (${entries.length}):`));
        for (const entry of entries) {
          const followedPk = entry.split("/").pop();
          console.log(`  ${followedPk}`);
        }
      });
    });
}
