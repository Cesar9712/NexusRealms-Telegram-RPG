begin;

-- Content-driven quests
create table if not exists game.quest_definitions (
  id text primary key,
  category text not null,
  realm_id text references game.realms(id),
  min_level integer not null default 1 check (min_level > 0),
  title_es text not null,
  title_en text not null,
  description_es text not null,
  description_en text not null,
  objectives jsonb not null default '[]'::jsonb,
  rewards jsonb not null default '{}'::jsonb,
  repeat_policy text not null default 'once',
  prerequisite_ids jsonb not null default '[]'::jsonb,
  enabled boolean not null default true,
  content_version integer not null default 1
);
create index if not exists quest_definitions_category_idx on game.quest_definitions(category, min_level);

-- Crafting / professions
create table if not exists game.profession_definitions (
  id text primary key,
  name_es text not null,
  name_en text not null,
  gathering boolean not null default false,
  max_level integer not null default 100,
  enabled boolean not null default true
);
create table if not exists game.profession_progress (
  character_id uuid not null references game.characters(id) on delete cascade,
  profession_id text not null references game.profession_definitions(id),
  level integer not null default 1 check (level > 0),
  experience bigint not null default 0 check (experience >= 0),
  specialization text,
  updated_at timestamptz not null default now(),
  primary key (character_id, profession_id)
);
create table if not exists game.crafting_recipes (
  id text primary key,
  profession_id text not null references game.profession_definitions(id),
  category text not null,
  name_es text not null,
  name_en text not null,
  min_profession_level integer not null default 1,
  duration_seconds integer not null default 30 check (duration_seconds > 0),
  gold_cost integer not null default 0 check (gold_cost >= 0),
  ingredients jsonb not null default '[]'::jsonb,
  outputs jsonb not null default '[]'::jsonb,
  enabled boolean not null default true
);
create index if not exists crafting_recipes_profession_idx on game.crafting_recipes(profession_id, min_profession_level);

-- Equipment sets and upgrades
create table if not exists game.item_sets (
  id text primary key,
  name_es text not null,
  name_en text not null,
  theme text not null,
  bonuses jsonb not null,
  enabled boolean not null default true
);
create table if not exists game.equipment_upgrade_log (
  id uuid primary key default gen_random_uuid(),
  character_id uuid not null references game.characters(id) on delete cascade,
  inventory_item_id uuid references game.inventory_items(id) on delete set null,
  operation text not null,
  before_state jsonb not null default '{}'::jsonb,
  after_state jsonb not null default '{}'::jsonb,
  resource_cost jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);

-- Achievements, titles and collection
create table if not exists game.achievement_definitions (
  id text primary key,
  category text not null,
  name_es text not null,
  name_en text not null,
  description_es text not null,
  description_en text not null,
  target bigint not null check (target > 0),
  metric text not null,
  rewards jsonb not null default '{}'::jsonb,
  secret boolean not null default false,
  enabled boolean not null default true
);
create table if not exists game.character_achievements (
  character_id uuid not null references game.characters(id) on delete cascade,
  achievement_id text not null references game.achievement_definitions(id),
  progress bigint not null default 0 check (progress >= 0),
  completed_at timestamptz,
  claimed_at timestamptz,
  primary key (character_id, achievement_id)
);
create table if not exists game.title_definitions (
  id text primary key,
  name_es text not null,
  name_en text not null,
  source text not null,
  rarity text not null default 'rare',
  enabled boolean not null default true
);
create table if not exists game.character_titles (
  character_id uuid not null references game.characters(id) on delete cascade,
  title_id text not null references game.title_definitions(id),
  unlocked_at timestamptz not null default now(),
  primary key (character_id, title_id)
);
create table if not exists game.codex_entries (
  id text primary key,
  category text not null,
  name_es text not null,
  name_en text not null,
  lore_es text not null,
  lore_en text not null,
  metadata jsonb not null default '{}'::jsonb
);
create table if not exists game.character_codex (
  character_id uuid not null references game.characters(id) on delete cascade,
  codex_id text not null references game.codex_entries(id),
  progress integer not null default 1 check (progress >= 0),
  discovered_at timestamptz not null default now(),
  primary key (character_id, codex_id)
);

-- Bastion 2.0 definitions and bounded stockpile
create table if not exists game.bastion_building_definitions (
  code text primary key,
  name_es text not null,
  name_en text not null,
  max_level integer not null default 30,
  base_upgrade_seconds integer not null check (base_upgrade_seconds > 0),
  base_gold_cost integer not null check (base_gold_cost >= 0),
  production_resource text,
  base_production_per_hour integer not null default 0 check (base_production_per_hour >= 0),
  base_capacity integer not null default 0 check (base_capacity >= 0),
  benefits jsonb not null default '{}'::jsonb,
  enabled boolean not null default true
);
create table if not exists game.bastion_stockpile (
  character_id uuid not null references game.characters(id) on delete cascade,
  resource_code text not null,
  amount bigint not null default 0 check (amount >= 0),
  capacity bigint not null default 100 check (capacity >= 0),
  updated_at timestamptz not null default now(),
  primary key (character_id, resource_code),
  check (amount <= capacity)
);
create table if not exists game.bastion_buffs (
  id uuid primary key default gen_random_uuid(),
  character_id uuid not null references game.characters(id) on delete cascade,
  source_building text not null,
  buff_code text not null,
  magnitude numeric not null default 0,
  starts_at timestamptz not null default now(),
  ends_at timestamptz not null,
  check (ends_at > starts_at)
);

-- Clan 3.0
create table if not exists game.clan_building_definitions (
  code text primary key,
  name_es text not null,
  name_en text not null,
  max_level integer not null default 20,
  benefits jsonb not null default '{}'::jsonb
);
create table if not exists game.clan_buildings (
  clan_id uuid not null references game.clans(id) on delete cascade,
  building_code text not null references game.clan_building_definitions(code),
  level integer not null default 1 check (level > 0),
  upgrade_finishes_at timestamptz,
  updated_at timestamptz not null default now(),
  primary key (clan_id, building_code)
);
create table if not exists game.clan_treasury (
  clan_id uuid not null references game.clans(id) on delete cascade,
  resource_code text not null,
  amount bigint not null default 0 check (amount >= 0),
  updated_at timestamptz not null default now(),
  primary key (clan_id, resource_code)
);
create table if not exists game.clan_activity (
  id uuid primary key default gen_random_uuid(),
  clan_id uuid not null references game.clans(id) on delete cascade,
  actor_player_id uuid references game.players(id) on delete set null,
  action text not null,
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);
create index if not exists clan_activity_idx on game.clan_activity(clan_id, created_at desc);
create table if not exists game.clan_raids (
  id uuid primary key default gen_random_uuid(),
  clan_id uuid not null references game.clans(id) on delete cascade,
  boss_id text not null,
  boss_hp_max bigint not null check (boss_hp_max > 0),
  boss_hp_remaining bigint not null check (boss_hp_remaining >= 0),
  starts_at timestamptz not null,
  ends_at timestamptz not null,
  status text not null default 'active',
  rewards jsonb not null default '{}'::jsonb,
  check (ends_at > starts_at),
  check (boss_hp_remaining <= boss_hp_max)
);
create table if not exists game.clan_raid_contributions (
  raid_id uuid not null references game.clan_raids(id) on delete cascade,
  player_id uuid not null references game.players(id) on delete cascade,
  damage bigint not null default 0 check (damage >= 0),
  support bigint not null default 0 check (support >= 0),
  attempts integer not null default 0 check (attempts >= 0),
  updated_at timestamptz not null default now(),
  primary key (raid_id, player_id)
);
create table if not exists game.clan_wars (
  id uuid primary key default gen_random_uuid(),
  season_id text not null,
  clan_a uuid not null references game.clans(id) on delete cascade,
  clan_b uuid not null references game.clans(id) on delete cascade,
  score_a integer not null default 0,
  score_b integer not null default 0,
  starts_at timestamptz not null,
  ends_at timestamptz not null,
  status text not null default 'scheduled',
  check (clan_a <> clan_b),
  check (ends_at > starts_at)
);

-- Events / community missions
create table if not exists game.event_definitions (
  id text primary key,
  event_type text not null,
  name_es text not null,
  name_en text not null,
  description_es text not null,
  description_en text not null,
  config jsonb not null default '{}'::jsonb,
  rewards jsonb not null default '{}'::jsonb,
  enabled boolean not null default true
);
create table if not exists game.event_instances (
  id uuid primary key default gen_random_uuid(),
  event_id text not null references game.event_definitions(id),
  starts_at timestamptz not null,
  ends_at timestamptz not null,
  state jsonb not null default '{}'::jsonb,
  status text not null default 'scheduled',
  check (ends_at > starts_at)
);
create table if not exists game.event_contributions (
  event_instance_id uuid not null references game.event_instances(id) on delete cascade,
  player_id uuid not null references game.players(id) on delete cascade,
  contribution bigint not null default 0 check (contribution >= 0),
  claimed_tiers jsonb not null default '[]'::jsonb,
  updated_at timestamptz not null default now(),
  primary key (event_instance_id, player_id)
);

-- Daily rewards
create table if not exists game.daily_reward_definitions (
  cycle_day integer primary key check (cycle_day between 1 and 30),
  reward jsonb not null,
  special boolean not null default false
);
create table if not exists game.daily_reward_state (
  player_id uuid primary key references game.players(id) on delete cascade,
  streak integer not null default 0 check (streak >= 0),
  cycle_day integer not null default 1 check (cycle_day between 1 and 30),
  last_claimed_at timestamptz,
  updated_at timestamptz not null default now()
);

-- Battle pass rewards and claims
create table if not exists game.battle_pass_rewards (
  season_id text not null references game.battle_pass_seasons(id) on delete cascade,
  level integer not null check (level > 0),
  track text not null check (track in ('free','premium')),
  reward jsonb not null,
  primary key (season_id, level, track)
);
create table if not exists game.battle_pass_claims (
  season_id text not null,
  player_id uuid not null references game.players(id) on delete cascade,
  level integer not null,
  track text not null,
  claimed_at timestamptz not null default now(),
  primary key (season_id, player_id, level, track),
  foreign key (season_id, level, track) references game.battle_pass_rewards(season_id, level, track)
);

-- PvP seasons / arena
create table if not exists game.arena_seasons (
  id text primary key,
  starts_at timestamptz not null,
  ends_at timestamptz not null,
  rules jsonb not null default '{}'::jsonb,
  check (ends_at > starts_at)
);
create table if not exists game.arena_profiles (
  season_id text not null references game.arena_seasons(id) on delete cascade,
  player_id uuid not null references game.players(id) on delete cascade,
  rating integer not null default 1000,
  league text not null default 'bronze',
  wins integer not null default 0,
  losses integer not null default 0,
  updated_at timestamptz not null default now(),
  primary key (season_id, player_id)
);
create table if not exists game.arena_matches (
  id uuid primary key default gen_random_uuid(),
  season_id text not null references game.arena_seasons(id),
  player_a uuid not null references game.players(id),
  player_b uuid not null references game.players(id),
  winner uuid references game.players(id),
  rating_delta_a integer not null default 0,
  rating_delta_b integer not null default 0,
  snapshot jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  check (player_a <> player_b)
);

-- Internal marketplace
create table if not exists game.market_listings (
  id uuid primary key default gen_random_uuid(),
  seller_player_id uuid not null references game.players(id) on delete cascade,
  inventory_item_id uuid not null unique references game.inventory_items(id) on delete cascade,
  currency text not null default 'gold',
  price bigint not null check (price > 0),
  tax_rate numeric(6,4) not null default 0.05 check (tax_rate >= 0 and tax_rate <= 1),
  status text not null default 'active',
  created_at timestamptz not null default now(),
  sold_at timestamptz
);
create index if not exists market_active_idx on game.market_listings(status, created_at desc);

-- Pets / mounts / cosmetics
create table if not exists game.pet_definitions (
  id text primary key,
  name_es text not null,
  name_en text not null,
  rarity text not null,
  bonus jsonb not null default '{}'::jsonb,
  enabled boolean not null default true
);
create table if not exists game.character_pets (
  character_id uuid not null references game.characters(id) on delete cascade,
  pet_id text not null references game.pet_definitions(id),
  level integer not null default 1,
  experience bigint not null default 0,
  equipped boolean not null default false,
  primary key (character_id, pet_id)
);
create table if not exists game.mount_definitions (
  id text primary key,
  name_es text not null,
  name_en text not null,
  rarity text not null,
  movement_bonus numeric(6,3) not null default 0,
  enabled boolean not null default true
);
create table if not exists game.character_mounts (
  character_id uuid not null references game.characters(id) on delete cascade,
  mount_id text not null references game.mount_definitions(id),
  equipped boolean not null default false,
  unlocked_at timestamptz not null default now(),
  primary key (character_id, mount_id)
);

-- Premium/internal shop. Credits are non-withdrawable internal currency.
create table if not exists game.shop_items (
  id text primary key,
  category text not null,
  name_es text not null,
  name_en text not null,
  price_credits integer not null check (price_credits >= 0),
  contents jsonb not null,
  pay_to_win boolean not null default false,
  enabled boolean not null default true
);
create table if not exists game.shop_purchases (
  id uuid primary key default gen_random_uuid(),
  player_id uuid not null references game.players(id) on delete cascade,
  shop_item_id text not null references game.shop_items(id),
  credits_spent integer not null check (credits_spent >= 0),
  idempotency_key text not null,
  created_at timestamptz not null default now(),
  unique (player_id, idempotency_key)
);

-- Central configuration and admin audit
create table if not exists game.runtime_config (
  key text primary key,
  value jsonb not null,
  updated_at timestamptz not null default now()
);
create table if not exists game.feature_flags (
  key text primary key,
  enabled boolean not null default false,
  config jsonb not null default '{}'::jsonb,
  updated_at timestamptz not null default now()
);
create table if not exists game.admin_audit_log (
  id uuid primary key default gen_random_uuid(),
  admin_telegram_id bigint not null,
  action text not null,
  target_type text not null,
  target_id text,
  before_state jsonb,
  after_state jsonb,
  reason text,
  created_at timestamptz not null default now()
);
create index if not exists admin_audit_idx on game.admin_audit_log(created_at desc);

-- Rankings are materialized snapshots; server jobs can rebuild them safely.
create table if not exists game.ranking_snapshots (
  ranking_type text not null,
  season_id text not null default 'all-time',
  player_id uuid references game.players(id) on delete cascade,
  clan_id uuid references game.clans(id) on delete cascade,
  score bigint not null,
  rank integer not null check (rank > 0),
  generated_at timestamptz not null default now(),
  primary key (ranking_type, season_id, rank),
  check ((player_id is not null)::integer + (clan_id is not null)::integer = 1)
);

-- Server-clock helper. Client clock is never authoritative.
create or replace function game.regenerated_value(
  current_value integer,
  max_value integer,
  anchor timestamptz,
  seconds_per_point integer,
  at_time timestamptz default now()
) returns integer
language sql
immutable
as $$
  select least(
    max_value,
    current_value + greatest(0, floor(extract(epoch from (at_time - anchor)) / greatest(seconds_per_point, 1)))::integer
  );
$$;

insert into game.profession_definitions (id,name_es,name_en,gathering) values
 ('mining','Minería','Mining',true),('woodcutting','Leñador','Woodcutting',true),('fishing','Pesca','Fishing',true),
 ('smithing','Herrería','Smithing',false),('alchemy','Alquimia','Alchemy',false),('cooking','Cocina','Cooking',false),
 ('enchanting','Encantamiento','Enchanting',false),('jewelcrafting','Joyería','Jewelcrafting',false)
on conflict (id) do nothing;

insert into game.bastion_building_definitions
(code,name_es,name_en,max_level,base_upgrade_seconds,base_gold_cost,production_resource,base_production_per_hour,base_capacity,benefits) values
 ('fortress','Fortaleza','Fortress',30,300,500,null,0,0,'{"global_unlocks":true}'::jsonb),
 ('forge','Herrería','Forge',30,240,350,'iron_ore',4,40,'{"craft_speed":0.02}'::jsonb),
 ('laboratory','Laboratorio','Laboratory',30,240,350,'essence',3,30,'{"alchemy_speed":0.02}'::jsonb),
 ('garden','Jardín','Garden',30,180,250,'herbs',6,60,'{"herb_yield":0.03}'::jsonb),
 ('mine','Mina','Mine',30,180,250,'ore',6,60,'{"ore_yield":0.03}'::jsonb),
 ('pond','Estanque','Pond',30,180,250,'fish',5,50,'{"fish_yield":0.03}'::jsonb),
 ('warehouse','Almacén','Warehouse',30,300,400,null,0,0,'{"capacity_multiplier":0.10}'::jsonb),
 ('market','Mercado','Market',30,360,450,null,0,0,'{"market_tax_reduction":0.005}'::jsonb),
 ('altar','Altar','Altar',30,360,500,null,0,0,'{"temporary_buffs":true}'::jsonb),
 ('barracks','Cuartel','Barracks',30,420,550,null,0,0,'{"expedition_slots":1}'::jsonb),
 ('arcane-tower','Torre Arcana','Arcane Tower',30,420,600,'arcane_dust',2,25,'{"mp_regen_bonus":0.02}'::jsonb),
 ('workshop','Taller','Workshop',30,360,450,null,0,0,'{"craft_quality":0.01}'::jsonb),
 ('portal','Portal','Portal',30,600,750,null,0,0,'{"travel_cost_reduction":0.02}'::jsonb),
 ('hall-of-heroes','Salón de Héroes','Hall of Heroes',30,720,1000,null,0,0,'{"prestige":true}'::jsonb)
on conflict (code) do nothing;

insert into game.clan_building_definitions (code,name_es,name_en,max_level,benefits) values
 ('fortress','Fortaleza','Fortress',20,'{"member_cap":5}'::jsonb),('bank','Banco','Bank',20,'{"treasury_capacity":0.1}'::jsonb),
 ('forge','Herrería','Forge',20,'{"craft_bonus":0.01}'::jsonb),('library','Biblioteca','Library',20,'{"research_speed":0.02}'::jsonb),
 ('altar','Altar','Altar',20,'{"raid_buff":0.01}'::jsonb),('tower','Torre','Tower',20,'{"war_defense":0.01}'::jsonb),
 ('market','Mercado','Market',20,'{"market_tax_reduction":0.002}'::jsonb),('war-room','Sala de Guerra','War Room',20,'{"war_coordination":0.01}'::jsonb)
on conflict (code) do nothing;

insert into game.quest_definitions
(id,category,realm_id,min_level,title_es,title_en,description_es,description_en,objectives,rewards,repeat_policy)
select
 'quest-'||lpad(gs::text,3,'0'),
 (array['story','side','daily','weekly','exploration','hunt','crafting','gathering','boss','clan','event'])[1+((gs-1)%11)],
 (array['ashen-frontier','cursed-grove','ironpeaks','spectral-marsh','crimson-wastes','frostbound','abyss','celestial','chaos'])[1+((gs-1)%9)],
 greatest(1, ((gs-1)%60)+1),
 'Crónica del Nexo '||gs,
 'Chronicle of the Nexus '||gs,
 'Completa el objetivo y descubre una nueva pieza del conflicto entre los reinos.',
 'Complete the objective and uncover another piece of the conflict between realms.',
 jsonb_build_array(jsonb_build_object('type',(array['kill','explore','collect','craft','boss'])[1+((gs-1)%5)],'target',3+((gs-1)%12))),
 jsonb_build_object('gold',50+gs*8,'xp',60+gs*12,'materials',1+((gs-1)%4)),
 case when gs%11=3 then 'daily' when gs%11=4 then 'weekly' else 'once' end
from generate_series(1,50) gs
on conflict (id) do nothing;

insert into game.crafting_recipes
(id,profession_id,category,name_es,name_en,min_profession_level,duration_seconds,gold_cost,ingredients,outputs)
select
 'recipe-'||lpad(gs::text,3,'0'),
 (array['smithing','alchemy','cooking','enchanting','jewelcrafting','mining','woodcutting','fishing'])[1+((gs-1)%8)],
 (array['weapon','armor','potion','rune','material','consumable','special'])[1+((gs-1)%7)],
 'Receta del Nexo '||gs,
 'Nexus Recipe '||gs,
 1+((gs-1)%50),
 20 + ((gs*13)%600),
 25 + gs*12,
 jsonb_build_array(jsonb_build_object('resource',(array['ore','herbs','wood','fish','arcane_dust'])[1+((gs-1)%5)],'quantity',1+((gs-1)%8))),
 jsonb_build_array(jsonb_build_object('item','crafted-'||lpad(gs::text,3,'0'),'quantity',1))
from generate_series(1,50) gs
on conflict (id) do nothing;

insert into game.achievement_definitions
(id,category,name_es,name_en,description_es,description_en,target,metric,rewards,secret)
select
 'achievement-'||lpad(gs::text,3,'0'),
 (array['combat','exploration','crafting','collection','clan','pvp','bosses','events','secrets'])[1+((gs-1)%9)],
 'Hazaña '||gs,
 'Feat '||gs,
 'Completa este desafío permanente del Nexo.',
 'Complete this permanent Nexus challenge.',
 case when gs < 20 then 10 else gs*5 end,
 (array['kills','realms','crafted','collected','clan_contribution','arena_wins','boss_kills','event_score','discoveries'])[1+((gs-1)%9)],
 jsonb_build_object('gold',100+gs*10,'title_fragment',case when gs%10=0 then true else false end),
 gs%17=0
from generate_series(1,100) gs
on conflict (id) do nothing;

insert into game.title_definitions (id,name_es,name_en,source,rarity) values
 ('dragon-slayer','Matadragones','Dragonslayer','boss','legendary'),
 ('abyss-lord','Señor del Abismo','Lord of the Abyss','endgame','mythic'),
 ('master-crafter','Maestro Artesano','Master Artisan','crafting','epic'),
 ('realm-walker','Caminante de Reinos','Realm Walker','exploration','epic'),
 ('clan-vanguard','Vanguardia del Clan','Clan Vanguard','clan','rare')
on conflict (id) do nothing;

insert into game.pet_definitions (id,name_es,name_en,rarity,bonus) values
 ('ember-fox','Zorro de Brasas','Ember Fox','rare','{"crit_chance":0.005}'::jsonb),
 ('arcane-owl','Búho Arcano','Arcane Owl','epic','{"magic_attack_pct":0.01}'::jsonb),
 ('iron-cub','Cachorro de Hierro','Iron Cub','rare','{"defense_pct":0.01}'::jsonb),
 ('void-wisp','Fuego Fatuo del Vacío','Void Wisp','legendary','{"evasion":0.005}'::jsonb),
 ('celestial-drake','Draco Celestial','Celestial Drake','legendary','{"all_stats_pct":0.005}'::jsonb)
on conflict (id) do nothing;

insert into game.mount_definitions (id,name_es,name_en,rarity,movement_bonus) values
 ('ashen-wolf','Lobo de Ceniza','Ashen Wolf','rare',0.05),('iron-ram','Carnero de Hierro','Iron Ram','epic',0.07),
 ('frost-stag','Ciervo de Escarcha','Frost Stag','epic',0.08),('abyssal-steed','Corcel Abisal','Abyssal Steed','legendary',0.10),
 ('celestial-griffin','Grifo Celestial','Celestial Griffin','legendary',0.12)
on conflict (id) do nothing;

insert into game.event_definitions (id,event_type,name_es,name_en,description_es,description_en,config,rewards) values
 ('infernal-invasion','world','Invasión Infernal','Infernal Invasion','Cierra portales demoníacos junto a toda la comunidad.','Close demonic portals with the whole community.','{"metric":"demon_kills","goal":1000000}'::jsonb,'{"tiers":[10000,100000,500000,1000000]}'::jsonb),
 ('treasure-hunt','exploration','Caza de Tesoros','Treasure Hunt','Encuentra reliquias ocultas en varios reinos.','Find hidden relics across several realms.','{"metric":"relics","goal":50000}'::jsonb,'{"tiers":[1000,10000,25000,50000]}'::jsonb),
 ('blood-moon','combat','Luna Sangrienta','Blood Moon','Enemigos fortalecidos con recompensas especiales.','Empowered enemies with special rewards.','{"modifier":"elite_spawn"}'::jsonb,'{"bonus_loot":0.25}'::jsonb),
 ('chaos-portal','world','Portal del Caos','Chaos Portal','Derrota oleadas procedentes del Reino del Caos.','Defeat waves from the Realm of Chaos.','{"waves":20}'::jsonb,'{"cosmetic":"chaos-aura"}'::jsonb),
 ('dragon-assault','boss','Ataque de Dragón','Dragon Assault','Un dragón mundial amenaza los reinos.','A world dragon threatens the realms.','{"shared_hp":true}'::jsonb,'{"chest":"dragon"}'::jsonb),
 ('guild-week','clan','Semana del Gremio','Guild Week','Los clanes compiten en objetivos cooperativos.','Clans compete in cooperative objectives.','{"metric":"clan_score"}'::jsonb,'{"clan_currency":true}'::jsonb),
 ('goblin-king','boss','Rey Goblin','Goblin King','Caza al monarca goblin y sus campeones.','Hunt the goblin monarch and his champions.','{"boss_chain":true}'::jsonb,'{"chest":"event"}'::jsonb),
 ('arcane-storm','gathering','Tormenta Arcana','Arcane Storm','Recolecta esencia durante una anomalía temporal.','Gather essence during a temporary anomaly.','{"resource":"arcane_dust"}'::jsonb,'{"yield_bonus":0.5}'::jsonb)
on conflict (id) do nothing;

insert into game.daily_reward_definitions (cycle_day,reward,special)
select gs,
 jsonb_build_object('gold',100+gs*20,'energy',case when gs%5=0 then 25 else 10 end,'chest',case when gs in (7,14,21,30) then 'epic' else 'basic' end),
 gs in (7,14,21,30)
from generate_series(1,30) gs
on conflict (cycle_day) do nothing;

insert into game.runtime_config (key,value) values
 ('premium_credit_packages','[{"credits":200,"display_usd":3},{"credits":1000,"display_usd":14},{"credits":2000,"display_usd":25}]'::jsonb),
 ('battle_pass','{"premium_credits":2500,"display_usd":25,"levels":60}'::jsonb),
 ('referrals','{"milestone_a_credits":150,"milestone_b_credits":50}'::jsonb),
 ('regeneration','{"hp_seconds_per_point":45,"mp_seconds_per_point":35,"energy_seconds_per_point":180}'::jsonb),
 ('market','{"base_tax_rate":0.05,"max_active_listings":12}'::jsonb)
on conflict (key) do update set value=excluded.value,updated_at=now();

insert into game.feature_flags (key,enabled,config) values
 ('web3',false,'{}'),('real_money_withdrawals',false,'{}'),('player_market',true,'{}'),('arena',true,'{}'),
 ('clan_wars',false,'{"reason":"preseason"}'),('founder_pack',false,'{"classification":"content_purchase_not_investment"}')
on conflict (key) do update set enabled=excluded.enabled,config=excluded.config,updated_at=now();

insert into game.shop_items (id,category,name_es,name_en,price_credits,contents,pay_to_win) values
 ('pass-premium','battle-pass','Pase Premium','Premium Pass',2500,'{"battle_pass_premium":true}'::jsonb,false),
 ('skin-obsidian','cosmetic','Armadura Obsidiana','Obsidian Armor',800,'{"skin":"obsidian"}'::jsonb,false),
 ('pet-ember','pets','Zorro de Brasas','Ember Fox',650,'{"pet":"ember-fox"}'::jsonb,false),
 ('mount-ashen','mounts','Lobo de Ceniza','Ashen Wolf',900,'{"mount":"ashen-wolf"}'::jsonb,false),
 ('vault-tabs','convenience','Pestañas del Almacén','Vault Tabs',300,'{"warehouse_tabs":1}'::jsonb,false)
on conflict (id) do nothing;

insert into game.battle_pass_seasons (id,starts_at,ends_at,premium_price_credits,config)
values ('season-001', date_trunc('day',now()), date_trunc('day',now()) + interval '90 days', 2500, '{"name":"Ecos del Nexo","max_level":60}'::jsonb)
on conflict (id) do nothing;

insert into game.battle_pass_rewards (season_id,level,track,reward)
select 'season-001', gs, track,
 case when track='free'
   then jsonb_build_object('gold',100+gs*25,'materials',1+(gs%3))
   else jsonb_build_object('gold',150+gs*40,'cosmetic_token',case when gs%10=0 then 1 else 0 end,'materials',2+(gs%4))
 end
from generate_series(1,60) gs cross join (values('free'),('premium')) t(track)
on conflict do nothing;

insert into game.arena_seasons (id,starts_at,ends_at,rules)
values ('arena-s001',date_trunc('day',now()),date_trunc('day',now())+interval '90 days','{"matchmaking":"rating","max_daily_rewarded_matches":20}'::jsonb)
on conflict (id) do nothing;

commit;
