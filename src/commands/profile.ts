import { Command } from "commander";
import chalk from "chalk";
import { withSession, withPublicAccess, getPublicKeyZ32 } from "../client";

export function registerProfileCommands(program: Command): void {
  const profile = program.command("profile").description("Manage user profile");

  profile
    .command("get")
    .description("Get a user profile")
    .argument("[user-pk]", "User public key (z32). Defaults to your own.")
    .action(async (userPk?: string) => {
      const pk = userPk || getPublicKeyZ32();

      await withPublicAccess(async ({ publicStorage }) => {
        const address = `pubky${pk}/pub/pubky.app/profile.json`;
        try {
          const profileData = await publicStorage.getJson(address);
          console.log(chalk.bold("Profile:"));
          console.log(`  Name: ${profileData.name}`);
          if (profileData.bio) console.log(`  Bio: ${profileData.bio}`);
          if (profileData.image) console.log(`  Image: ${profileData.image}`);
          if (profileData.status) console.log(`  Status: ${profileData.status}`);
          if (profileData.links?.length) {
            console.log("  Links:");
            for (const link of profileData.links) {
              console.log(`    - ${link.title}: ${link.url}`);
            }
          }
          console.log(`  Public Key: ${pk}`);
        } catch (e: any) {
          console.log("No profile found for this user.");
        }
      });
    });

  profile
    .command("set")
    .description("Update your profile")
    .requiredOption("--name <name>", "Display name (3-50 chars)")
    .option("--bio <bio>", "Bio (max 160 chars)")
    .option("--image <url>", "Profile image URL")
    .option("--status <status>", "Status message (max 50 chars)")
    .option("--link <links...>", "Links in 'title=url' format (max 5)")
    .action(async (opts: any) => {
      await withSession(async (ctx) => {
        let links = null;
        if (opts.link) {
          links = opts.link.map((l: string) => {
            const [title, ...urlParts] = l.split("=");
            return { title, url: urlParts.join("=") };
          });
        }

        const { user, meta } = ctx.specs.createUser(
          opts.name,
          opts.bio || null,
          opts.image || null,
          links,
          opts.status || null
        );
        await ctx.session.storage.putJson(meta.path, user.toJson());

        console.log(chalk.green("Profile updated!"));
        console.log(`  Name: ${opts.name}`);
        if (opts.bio) console.log(`  Bio: ${opts.bio}`);
        if (opts.image) console.log(`  Image: ${opts.image}`);
        if (opts.status) console.log(`  Status: ${opts.status}`);
      });
    });
}
