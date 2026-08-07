/**
 * Run once to create the default admin user.
 * Usage: node -e with DATABASE_URL and ADMIN_USERNAME/ADMIN_PASSWORD set
 *
 * The admin password must be provided via ADMIN_PASSWORD env var.
 * No default password is set to prevent insecure deployments.
 */
import { db } from "@workspace/db";
import { adminUsersTable } from "@workspace/db";
import { hashPassword } from "../lib/password";

const DEFAULT_USERNAME = process.env.ADMIN_USERNAME || "admin";
const ADMIN_PASSWORD = process.env.ADMIN_PASSWORD;

async function main() {
  if (!ADMIN_PASSWORD) {
    console.error("❌ ADMIN_PASSWORD environment variable is required.");
    console.error("   Usage: ADMIN_PASSWORD=yourpassword node seed-admin.js");
    process.exit(1);
  }

  try {
    const existing = await db.select().from(adminUsersTable);
    if (existing.length > 0) {
      console.log("Admin user already exists. Skipping seed.");
      process.exit(0);
    }

    const passwordHash = await hashPassword(ADMIN_PASSWORD);

    await db.insert(adminUsersTable).values({
      username: DEFAULT_USERNAME,
      passwordHash,
    });

    console.log(`✅ Admin user created: ${DEFAULT_USERNAME}`);
    process.exit(0);
  } catch (err) {
    console.error("❌ Failed to seed admin:", err);
    process.exit(1);
  }
}

main();
