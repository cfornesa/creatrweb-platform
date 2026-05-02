import { db, ensureTables, usersTable } from "@workspace/db";

async function main() {
  await ensureTables();
  const users = await db.select().from(usersTable);

  if (users.length === 0) {
    console.log("No users found. Sign in once through Auth.js before promoting an owner.");
    return;
  }

  for (const user of users) {
    console.log(
      [
        `id=${user.id}`,
        `email=${user.email ?? ""}`,
        `name=${user.name ?? ""}`,
        `role=${user.role}`,
        `status=${user.status}`,
      ].join(" | "),
    );
  }
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
