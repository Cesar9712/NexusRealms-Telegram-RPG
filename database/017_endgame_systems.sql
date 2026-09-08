begin;

create table if not exists game.dungeon_definitions (
  id text primary key,
  realm_id text not null references game.realms(id),
  name_es text not null,
  name_en text not null,
  difficulty text not null check (difficulty in ('normal','hard','heroic','nightmare')),
  min_level integer not null check (min_level > 0),
  energy_cost integer not null default 2 check (energy_cost between 1 and 20),
  room_count integer not null default 5 check (room_count between 3 and 12),
  daily_limit integer not null default 3 check (daily_limit between 1 and 20),
  power_multiplier numeric(7,3) not null default 1,
  rewards jsonb not null default '{}'::jsonb,
  enabled boolean not null default true
);
create index if not exists dungeon_realm_level_idx on game.dungeon_definitions(realm_id,min_level,difficulty);

create table if not exists game.dungeon_runs (
  id uuid primary key default gen_random_uuid(),
  player_id uuid not null references game.players(id) on delete cascade,
  character_id uuid not null references game.characters(id) on delete cascade,
  dungeon_id text not null references game.dungeon_definitions(id),
  state text not null default 'active' check (state in ('active','completed','failed','claimed','abandoned')),
  room_index integer not null default 0 check (room_index >= 0),
  score bigint not null default 0 check (score >= 0),
  started_at timestamptz not null default now(),
  completed_at timestamptz,
  claimed_at timestamptz,
  result jsonb not null default '{}'::jsonb
);
create unique index if not exists dungeon_one_active_per_character_idx on game.dungeon_runs(character_id) where state='active';
create index if not exists dungeon_runs_player_idx on game.dungeon_runs(player_id,started_at desc);

create table if not exists game.tower_progress (
  character_id uuid primary key references game.characters(id) on delete cascade,
  current_floor integer not null default 1 check (current_floor > 0),
  best_floor integer not null default 0 check (best_floor >= 0),
  checkpoint_floor integer not null default 1 check (checkpoint_floor > 0),
  attempts_today integer not null default 0 check (attempts_today >= 0),
  attempts_date date not null default current_date,
  updated_at timestamptz not null default now()
);
create table if not exists game.tower_floor_claims (
  character_id uuid not null references game.characters(id) on delete cascade,
  floor integer not null check (floor > 0),
  reward jsonb not null default '{}'::jsonb,
  claimed_at timestamptz not null default now(),
  primary key(character_id,floor)
);

create table if not exists game.expedition_definitions (
  id text primary key,
  name_es text not null,
  name_en text not null,
  min_level integer not null default 1 check (min_level > 0),
  duration_seconds integer not null check (duration_seconds between 60 and 86400),
  energy_cost integer not null default 1 check (energy_cost between 0 and 20),
  rewards jsonb not null default '{}'::jsonb,
  enabled boolean not null default true
);
create table if not exists game.expeditions (
  id uuid primary key default gen_random_uuid(),
  character_id uuid not null references game.characters(id) on delete cascade,
  expedition_id text not null references game.expedition_definitions(id),
  status text not null default 'running' check (status in ('running','claimed','cancelled')),
  started_at timestamptz not null default now(),
  finishes_at timestamptz not null,
  claimed_at timestamptz,
  result jsonb not null default '{}'::jsonb,
  check (finishes_at > started_at)
);
create index if not exists expeditions_character_status_idx on game.expeditions(character_id,status,finishes_at);

create table if not exists game.boss_encounters (
  id uuid primary key default gen_random_uuid(),
  player_id uuid not null references game.players(id) on delete cascade,
  character_id uuid not null references game.characters(id) on delete cascade,
  boss_id text not null references game.boss_definitions(id),
  won boolean not null,
  player_power bigint not null,
  required_power bigint not null,
  phase_log jsonb not null default '[]'::jsonb,
  reward jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);
create index if not exists boss_encounters_player_idx on game.boss_encounters(player_id,created_at desc);

-- Exclusive boss relics give the endgame a recognizable collection chase without flooding inventory.
insert into game.item_definitions(id,name_es,name_en,item_type,rarity,min_level,stack_limit,stats,tradable) values
 ('boss-relic-ashen','Emblema del Titán de Ceniza','Ash Titan Emblem','artifact','epic',5,1,'{"power":110,"defense":5}'::jsonb,true),
 ('boss-relic-grove','Corazón de la Arboleda','Heart of the Grove','artifact','epic',10,1,'{"power":145,"magic_resistance":6}'::jsonb,true),
 ('boss-relic-iron','Núcleo de Hierro Eterno','Eternal Iron Core','artifact','legendary',16,1,'{"power":190,"physical_attack":7}'::jsonb,true),
 ('boss-relic-spectral','Ojo del Pantano Espectral','Spectral Marsh Eye','artifact','legendary',22,1,'{"power":235,"evasion":0.018}'::jsonb,true),
 ('boss-relic-crimson','Sello Carmesí','Crimson Seal','artifact','legendary',29,1,'{"power":285,"crit_chance":0.025}'::jsonb,true),
 ('boss-relic-frost','Corona de Escarcha Antigua','Ancient Frost Crown','artifact','mythic',36,1,'{"power":345,"speed":10}'::jsonb,false),
 ('boss-relic-abyss','Fragmento del Abismo','Abyss Fragment','artifact','mythic',44,1,'{"power":430,"crit_damage":0.10}'::jsonb,false),
 ('boss-relic-celestial','Halo Celestial','Celestial Halo','artifact','mythic',54,1,'{"power":540,"magic_attack":12}'::jsonb,false),
 ('boss-relic-chaos','Núcleo del Caos','Chaos Core','artifact','mythic',64,1,'{"power":700,"physical_attack":10,"magic_attack":10}'::jsonb,false)
on conflict(id) do nothing;

insert into game.dungeon_definitions(id,realm_id,name_es,name_en,difficulty,min_level,energy_cost,room_count,daily_limit,power_multiplier,rewards) values
 ('dungeon-ashen-normal','ashen-frontier','Catacumbas de Ceniza','Ash Catacombs','normal',3,2,5,4,0.85,'{"gold":120,"xp":90,"resources":{"ore":3}}'),
 ('dungeon-ashen-hard','ashen-frontier','Catacumbas de Ceniza: Difícil','Ash Catacombs: Hard','hard',6,3,6,3,1.05,'{"gold":210,"xp":150,"resources":{"ore":5,"arcane_dust":1}}'),
 ('dungeon-grove-normal','cursed-grove','Santuario Marchito','Withered Sanctuary','normal',8,2,5,4,0.95,'{"gold":180,"xp":135,"resources":{"herbs":5}}'),
 ('dungeon-grove-heroic','cursed-grove','Santuario Marchito: Heroico','Withered Sanctuary: Heroic','heroic',13,4,7,2,1.28,'{"gold":360,"xp":260,"resources":{"herbs":8,"arcane_dust":2}}'),
 ('dungeon-iron-hard','ironpeaks','Forja Sepultada','Buried Forge','hard',15,3,6,3,1.10,'{"gold":300,"xp":220,"resources":{"ore":9}}'),
 ('dungeon-spectral-heroic','spectral-marsh','Cripta de la Niebla','Mist Crypt','heroic',22,4,7,2,1.32,'{"gold":470,"xp":340,"resources":{"arcane_dust":4}}'),
 ('dungeon-crimson-hard','crimson-wastes','Templo de Sangre Solar','Sunblood Temple','hard',28,4,6,3,1.22,'{"gold":520,"xp":390,"resources":{"ore":8,"crystals":1}}'),
 ('dungeon-frost-heroic','frostbound','Bóveda Glacial','Glacial Vault','heroic',36,5,8,2,1.46,'{"gold":760,"xp":560,"resources":{"crystals":2,"arcane_dust":5}}'),
 ('dungeon-abyss-nightmare','abyss','Fosa de los Sin Nombre','Pit of the Nameless','nightmare',45,6,9,1,1.70,'{"gold":1100,"xp":820,"resources":{"crystals":3,"arcane_dust":8}}'),
 ('dungeon-celestial-nightmare','celestial','Palacio del Firmamento','Firmament Palace','nightmare',55,7,10,1,1.88,'{"gold":1500,"xp":1100,"resources":{"crystals":5,"arcane_dust":10}}'),
 ('dungeon-chaos-nightmare','chaos','Laberinto del Fin','End Labyrinth','nightmare',65,8,10,1,2.15,'{"gold":2200,"xp":1600,"resources":{"crystals":8,"arcane_dust":14}}')
on conflict(id) do nothing;

insert into game.expedition_definitions(id,name_es,name_en,min_level,duration_seconds,energy_cost,rewards) values
 ('exp-scout','Exploración de Frontera','Frontier Scouting',2,600,1,'{"gold":45,"resources":{"wood":2}}'),
 ('exp-mine','Prospección Profunda','Deep Prospecting',8,1800,2,'{"gold":90,"resources":{"ore":5}}'),
 ('exp-herbs','Recolecta Nocturna','Night Herb Run',10,2400,2,'{"gold":80,"resources":{"herbs":6}}'),
 ('exp-arcane','Rastreo Arcano','Arcane Survey',18,3600,2,'{"gold":150,"resources":{"arcane_dust":3}}'),
 ('exp-bounty','Cacería de Élite','Elite Bounty',25,5400,3,'{"gold":260,"xp":160,"resources":{"crystals":1}}'),
 ('exp-relic','Búsqueda de Reliquias','Relic Search',40,10800,4,'{"gold":430,"xp":280,"resources":{"arcane_dust":5,"crystals":2}}'),
 ('exp-abyss','Incursión del Abismo','Abyss Incursion',50,18000,5,'{"gold":700,"xp":450,"resources":{"crystals":3}}'),
 ('exp-chaos','Cartografía del Caos','Chaos Cartography',60,28800,6,'{"gold":1100,"xp":700,"resources":{"crystals":5,"arcane_dust":8}}')
on conflict(id) do nothing;

commit;
