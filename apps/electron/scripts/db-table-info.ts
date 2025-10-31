#!/usr/bin/env tsx
import { drizzle } from "drizzle-orm/libsql";
import { createClient } from "@libsql/client";
import { sql } from "drizzle-orm";

async function main() {
  const table = process.argv[2] || "video_transcripts";
  const dbUrl = process.env.DATABASE_URL ?? "file:local.db";
  const client = createClient({ url: dbUrl, authToken: "" });
  const db = drizzle(client);

  // Check table exists
  const existsRows = await db.all(sql`SELECT name FROM sqlite_master WHERE type='table' AND name=${table}`);
  const exists = existsRows.length > 0;

  let rowCount = 0;
  let columns: Array<{ name: string; type: string }> = [];

  if (exists) {
    try {
      const countRows = await db.all(sql`SELECT COUNT(*) as c FROM ${sql.identifier(table)}`);
      rowCount = ((countRows[0] as any)?.c as number) || 0;
    } catch {}
    const pragma = await db.all(sql`PRAGMA table_info(${sql.identifier(table)})`);
    columns = pragma.map((r: any) => ({ name: r.name as string, type: r.type as string }));
  }

  console.log(`Table: ${table}`);
  console.log("Exists:", exists ? "✅" : "❌");
  console.log("Row count:", rowCount);
  console.log("Columns:");
  for (const c of columns) {
    console.log(` - ${c.name} (${c.type})`);
  }

  client.close();
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
