begin;

create extension if not exists pgcrypto;
create schema if not exists game;

create table if not exists game.players (
  id uuid primary key default gen_random_uuid(),
  telegram_user_id bigint not null unique,
  username text,
  display_name text not null,
  avatar_url text,
  locale text not null default 'es',
  notification_preferences jsonb not null default '{}'::jsonb,
  is_banned boolean not null default false,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists game.classes (
  id text primary key,
  name_es text not null,
  name_en text not null,
  base_stats jsonb not null,
  enabled boolean not null default true
);

create table if not exists game.realms (
  id text primary key,
  name_es text not null,
  name_en text not null,
  min_level integer not null default 1 check (min_level > 0),
  sort_order integer not null,
  visual_theme jsonb not null default '{}'::jsonb,
  enabled boolean not null default true
);

create table if not exists game.characters (
  id uuid primary key default gen_random_uuid(),
  player_id uuid not null unique references game.players(id) on delete cascade,
  class_id text not null references game.classes(id),
  current_realm_id text not null references game.realms(id),
  name text not null,
  level integer not null default 1 check (level > 0),
  experience bigint not null default 0 check (experience >= 0),
  hp integer not null,
  hp_max integer not null,
  mp integer not null,
  mp_max integer not null,
  energy integer not null,
  energy_max integer not null,
  hp_regen_anchor timestamptz not null default now(),
  mp_regen_anchor timestamptz not null default now(),
  energy_regen_anchor timestamptz not null default now(),
  power bigint not null default 0,
  appearance jsonb not null default '{}'::jsonb,
  title_id text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index if not exists characters_realm_idx on game.characters(current_realm_id);
create index if not exists characters_level_idx on game.characters(level desc);

create table if not exists game.character_stats (
  character_id uuid primary key references game.characters(id) on delete cascade,
  physical_attack integer not null default 10,
  magic_attack integer not null default 10,
  defense integer not null default 5,
  magic_resistance integer not null default 5,
  crit_chance numeric(6,3) not null default 0.05,
  crit_damage numeric(6,3) not null default 1.5,
  accuracy numeric(6,3) not null default 1.0,
  evasion numeric(6,3) not null default 0.0,
  speed integer not null default 100,
  penetration integer not null default 0,
  block_chance numeric(6,3) not null default 0.0,
  lifesteal numeric(6,3) not null default 0.0,
  regeneration integer not null default 0,
  updated_at timestamptz not null default now()
);

create table if not exists game.resources (
  character_id uuid not null references game.characters(id) on delete cascade,
  resource_code text not null,
  amount bigint not null default 0 check (amount >= 0),
  updated_at timestamptz not null default now(),
  primary key (character_id, resource_code)
);

create table if not exists game.item_definitions (
  id text primary key,
  name_es text not null,
  name_en text not null,
  item_type text not null,
  rarity text not null,
  min_level integer not null default 1,
  stack_limit integer not null default 1 check (stack_limit > 0),
  stats jsonb not null default '{}'::jsonb,
  set_id text,
  tradable boolean not null default true,
  content_version integer not null default 1,
  enabled boolean not null default true
);

create table if not exists game.inventory_items (
  id uuid primary key default gen_random_uuid(),
  character_id uuid not null references game.characters(id) on delete cascade,
  item_definition_id text not null references game.item_definitions(id),
  quantity integer not null default 1 check (quantity > 0),
  enhancement_level integer not null default 0 check (enhancement_level >= 0),
  sockets jsonb not null default '[]'::jsonb,
  bound boolean not null default false,
  acquired_at timestamptz not null default now()
);
create index if not exists inventory_character_idx on game.inventory_items(character_id, acquired_at desc);

create table if not exists game.equipment (
  character_id uuid not null references game.characters(id) on delete cascade,
  slot text not null,
  inventory_item_id uuid not null unique references game.inventory_items(id) on delete cascade,
  primary key (character_id, slot)
);

create table if not exists game.clans (
  id uuid primary key default gen_random_uuid(),
  name text not null unique,
  tag text not null unique,
  description text not null default '',
  emblem jsonb not null default '{}'::jsonb,
  level integer not null default 1,
  experience bigint not null default 0,
  created_at timestamptz not null default now()
);

create table if not exists game.clan_members (
  clan_id uuid not null references game.clans(id) on delete cascade,
  player_id uuid not null unique references game.players(id) on delete cascade,
  role text not null default 'member',
  contribution bigint not null default 0,
  joined_at timestamptz not null default now(),
  primary key (clan_id, player_id)
);

create table if not exists game.battle_pass_seasons (
  id text primary key,
  starts_at timestamptz not null,
  ends_at timestamptz not null,
  premium_price_credits integer not null default 2500,
  config jsonb not null default '{}'::jsonb,
  check (ends_at > starts_at)
);

create table if not exists game.battle_pass_progress (
  season_id text not null references game.battle_pass_seasons(id) on delete cascade,
  player_id uuid not null references game.players(id) on delete cascade,
  xp bigint not null default 0,
  level integer not null default 1,
  premium_unlocked boolean not null default false,
  updated_at timestamptz not null default now(),
  primary key (season_id, player_id)
);

create table if not exists game.referral_profiles (
  player_id uuid primary key references game.players(id) on delete cascade,
  referral_code text not null unique,
  created_at timestamptz not null default now()
);

create table if not exists game.referral_attributions (
  referred_player_id uuid primary key references game.players(id) on delete cascade,
  referrer_player_id uuid not null references game.players(id) on delete cascade,
  attributed_at timestamptz not null default now(),
  check (referred_player_id <> referrer_player_id)
);
create index if not exists referral_referrer_idx on game.referral_attributions(referrer_player_id);

create table if not exists game.earn_balances (
  player_id uuid primary key references game.players(id) on delete cascade,
  internal_credits bigint not null default 0 check (internal_credits >= 0),
  updated_at timestamptz not null default now()
);

create table if not exists game.earn_events (
  id uuid primary key default gen_random_uuid(),
  player_id uuid not null references game.players(id) on delete cascade,
  source text not null,
  amount bigint not null,
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);
create index if not exists earn_events_player_idx on game.earn_events(player_id, created_at desc);

create table if not exists game.quest_progress (
  character_id uuid not null references game.characters(id) on delete cascade,
  quest_id text not null,
  status text not null default 'active',
  progress jsonb not null default '{}'::jsonb,
  updated_at timestamptz not null default now(),
  primary key (character_id, quest_id)
);

create table if not exists game.bastion_buildings (
  character_id uuid not null references game.characters(id) on delete cascade,
  building_code text not null,
  level integer not null default 1 check (level > 0),
  upgrade_started_at timestamptz,
  upgrade_finishes_at timestamptz,
  production_stored bigint not null default 0 check (production_stored >= 0),
  production_anchor timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  primary key (character_id, building_code),
  check ((upgrade_started_at is null and upgrade_finishes_at is null) or (upgrade_started_at is not null and upgrade_finishes_at > upgrade_started_at))
);

create table if not exists game.crafting_jobs (
  id uuid primary key default gen_random_uuid(),
  character_id uuid not null references game.characters(id) on delete cascade,
  recipe_id text not null,
  quantity integer not null default 1 check (quantity > 0),
  started_at timestamptz not null default now(),
  finishes_at timestamptz not null,
  claimed_at timestamptz,
  status text not null default 'running',
  check (finishes_at > started_at)
);
create index if not exists crafting_jobs_character_idx on game.crafting_jobs(character_id, status, finishes_at);

create table if not exists game.economy_ledger (
  id uuid primary key default gen_random_uuid(),
  player_id uuid not null references game.players(id) on delete cascade,
  character_id uuid references game.characters(id) on delete set null,
  currency text not null,
  delta bigint not null,
  balance_after bigint,
  reason text not null,
  reference_id text,
  created_at timestamptz not null default now()
);
create index if not exists economy_ledger_player_idx on game.economy_ledger(player_id, created_at desc);

create table if not exists game.action_receipts (
  id uuid primary key default gen_random_uuid(),
  player_id uuid not null references game.players(id) on delete cascade,
  operation text not null,
  idempotency_key text not null,
  response jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  unique (player_id, operation, idempotency_key)
);

create table if not exists game.realm_travel_log (
  id uuid primary key default gen_random_uuid(),
  character_id uuid not null references game.characters(id) on delete cascade,
  from_realm_id text not null references game.realms(id),
  to_realm_id text not null references game.realms(id),
  travelled_at timestamptz not null default now()
);

create table if not exists game.player_notifications (
  id uuid primary key default gen_random_uuid(),
  player_id uuid not null references game.players(id) on delete cascade,
  kind text not null,
  payload jsonb not null default '{}'::jsonb,
  deliver_after timestamptz not null default now(),
  delivered_at timestamptz,
  created_at timestamptz not null default now()
);
create index if not exists notifications_delivery_idx on game.player_notifications(delivered_at, deliver_after);

insert into game.classes (id, name_es, name_en, base_stats) values
  ('warrior','Guerrero','Warrior','{"hp":140,"mp":70,"energy":100,"physical_attack":16,"magic_attack":5,"defense":14,"magic_resistance":8,"speed":90}'::jsonb),
  ('mage','Mago','Mage','{"hp":90,"mp":160,"energy":100,"physical_attack":5,"magic_attack":19,"defense":7,"magic_resistance":14,"speed":95}'::jsonb),
  ('archer','Arquero','Archer','{"hp":105,"mp":100,"energy":110,"physical_attack":15,"magic_attack":7,"defense":8,"magic_resistance":8,"speed":120}'::jsonb),
  ('assassin','Asesino','Assassin','{"hp":95,"mp":105,"energy":120,"physical_attack":17,"magic_attack":6,"defense":7,"magic_resistance":7,"speed":130}'::jsonb)
on conflict (id) do update set base_stats = excluded.base_stats;

insert into game.realms (id, name_es, name_en, min_level, sort_order, visual_theme) values
  ('ashen-frontier','Frontera de Ceniza','Ashen Frontier',1,1,'{"palette":"obsidian-gold","biome":"forest_ruins"}'::jsonb),
  ('cursed-grove','Bosque Maldito','Cursed Grove',6,2,'{"palette":"violet-green","biome":"corrupted_forest"}'::jsonb),
  ('ironpeaks','Montañas de Hierro','Iron Peaks',12,3,'{"palette":"iron-ember","biome":"mountain_mines"}'::jsonb),
  ('spectral-marsh','Pantano Espectral','Spectral Marsh',18,4,'{"palette":"teal-violet","biome":"haunted_swamp"}'::jsonb),
  ('crimson-wastes','Desierto Carmesí','Crimson Wastes',25,5,'{"palette":"crimson-bronze","biome":"ancient_desert"}'::jsonb),
  ('frostbound','Tierras Heladas','Frostbound',32,6,'{"palette":"ice-blue","biome":"frozen_realm"}'::jsonb),
  ('abyss','El Abismo','The Abyss',40,7,'{"palette":"black-red","biome":"demonic_abyss"}'::jsonb),
  ('celestial','Reino Celestial','Celestial Realm',50,8,'{"palette":"gold-arcane","biome":"celestial"}'::jsonb),
  ('chaos','Reino del Caos','Realm of Chaos',60,9,'{"palette":"void-prismatic","biome":"chaos_endgame"}'::jsonb)
on conflict (id) do nothing;

commit;
