import { db, ensureTables, eq, usersTable } from "@workspace/db";

type Args = {
  email?: string;
  id?: string;
};

function parseArgs(argv: string[]): Args {
  const args: Args = {};

  for (let i = 0; i < argv.length; i += 1) {
    const value = argv[i];
    const next = argv[i + 1];

    if (value === "--email" && next) {
      args.email = next;
      i += 1;
      continue;
    }

    if (value === "--id" && next) {
      args.id = next;
      i += 1;
    }
  }

  return args;
}

async function main() {
  await ensureTables();
  const args = parseArgs(process.argv.slice(2));

  if (!args.email && !args.id) {
    console.error("Usage: npm run promote-owner --workspace=@workspace/scripts -- --email you@example.com");
    console.error("   or: npm run promote-owner --workspace=@workspace/scripts -- --id <user-id>");
    process.exit(1);
  }

  const user = args.email
    ? await db.select().from(usersTable).where(eq(usersTable.email, args.email)).limit(1)
    : await db.select().from(usersTable).where(eq(usersTable.id, args.id!)).limit(1);

  const target = user[0];

  if (!target) {
    console.error("No matching user found. Run the list-users script after signing in once.");
    process.exit(1);
  }

  await db
    .update(usersTable)
    .set({
      role: "owner",
      updatedAt: new Date().toISOString(),
    })
    .where(eq(usersTable.id, target.id));

  console.log(`Promoted ${target.email ?? target.id} to owner.`);
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
