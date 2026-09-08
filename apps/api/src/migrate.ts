import { readFile } from 'node:fs/promises';
import postgres from 'postgres';

const databaseUrl = process.env.DATABASE_URL;
if (!databaseUrl) throw new Error('DATABASE_URL is required for migrations');

const sql = postgres(databaseUrl, { max: 1, idle_timeout: 10 });
const migrations = [
  '001_core.sql',
  '002_combat_content.sql',
  '003_progression_social.sql',
  '004_items_codex_seasons.sql',
  '005_operations.sql',
  '006_progression_triggers.sql',
  '007_gameplay_completeness.sql',
  '008_deep_progression.sql',
  '009_leveling_professions.sql',
  '010_clan_creation_credits.sql',
  '011_skill_descriptions.sql',
  '012_equipment_market_integrity.sql',
] as const;

try {
  await sql.unsafe(`
    create schema if not exists game;
    create table if not exists game.schema_migrations (
      name text primary key,
      applied_at timestamptz not null default now()
    );
  `, [], { prepare: false });

  for (const name of migrations) {
    const [applied] = await sql`select name from game.schema_migrations where name = ${name}`;
    if (applied) continue;

    const url = new URL(`../../../database/${name}`, import.meta.url);
    const source = await readFile(url, 'utf8');
    console.log(`[migration] applying ${name}`);
    await sql.unsafe(source, [], { prepare: false });
    await sql`insert into game.schema_migrations (name) values (${name}) on conflict do nothing`;
    console.log(`[migration] applied ${name}`);
  }
} finally {
  await sql.end({ timeout: 5 });
}
