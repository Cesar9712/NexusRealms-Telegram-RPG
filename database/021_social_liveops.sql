begin;

create table if not exists game.clan_project_definitions (
  id text primary key,
  name_es text not null,
  name_en text not null,
  description_es text not null default '',
  description_en text not null default '',
  target bigint not null check(target>0),
  resource_code text not null,
  rewards jsonb not null default '{}'::jsonb,
  repeat_policy text not null default 'weekly' check(repeat_policy in ('once','weekly','season')),
  enabled boolean not null default true
);
create table if not exists game.clan_projects (
  clan_id uuid not null references game.clans(id) on delete cascade,
  project_id text not null references game.clan_project_definitions(id),
  progress bigint not null default 0 check(progress>=0),
  cycle_key text not null,
  completed_at timestamptz,
  claimed_at timestamptz,
  updated_at timestamptz not null default now(),
  primary key(clan_id,project_id,cycle_key)
);

create table if not exists game.clan_mission_definitions (
  id text primary key,
  name_es text not null,
  name_en text not null,
  metric text not null,
  target bigint not null check(target>0),
  rewards jsonb not null default '{}'::jsonb,
  enabled boolean not null default true
);
create table if not exists game.clan_mission_progress (
  clan_id uuid not null references game.clans(id) on delete cascade,
  mission_id text not null references game.clan_mission_definitions(id),
  cycle_key text not null,
  progress bigint not null default 0 check(progress>=0),
  completed_at timestamptz,
  claimed_at timestamptz,
  updated_at timestamptz not null default now(),
  primary key(clan_id,mission_id,cycle_key)
);

create table if not exists game.clan_shop_items (
  id text primary key,
  name_es text not null,
  name_en text not null,
  min_clan_level integer not null default 1,
  price_clan_coins integer not null check(price_clan_coins>=0),
  contents jsonb not null default '{}'::jsonb,
  enabled boolean not null default true
);
create table if not exists game.clan_shop_purchases (
  id uuid primary key default gen_random_uuid(),
  clan_id uuid not null references game.clans(id) on delete cascade,
  player_id uuid not null references game.players(id) on delete cascade,
  shop_item_id text not null references game.clan_shop_items(id),
  price integer not null,
  idempotency_key text not null,
  created_at timestamptz not null default now(),
  unique(player_id,idempotency_key)
);

create table if not exists game.clan_war_attacks (
  war_id uuid not null references game.clan_wars(id) on delete cascade,
  player_id uuid not null references game.players(id) on delete cascade,
  attack_no integer not null check(attack_no between 1 and 3),
  score integer not null check(score>=0),
  created_at timestamptz not null default now(),
  primary key(war_id,player_id,attack_no)
);
create index if not exists clan_wars_status_time_idx on game.clan_wars(status,starts_at,ends_at);

create table if not exists game.event_reward_claims (
  event_instance_id uuid not null references game.event_instances(id) on delete cascade,
  player_id uuid not null references game.players(id) on delete cascade,
  tier integer not null check(tier>0),
  reward jsonb not null,
  claimed_at timestamptz not null default now(),
  primary key(event_instance_id,player_id,tier)
);

create table if not exists game.referral_reward_claims (
  referrer_player_id uuid not null references game.players(id) on delete cascade,
  milestone integer not null check(milestone in (1,3,5,10,20,50)),
  qualified_referrals integer not null,
  reward jsonb not null,
  claimed_at timestamptz not null default now(),
  primary key(referrer_player_id,milestone)
);

insert into game.clan_project_definitions(id,name_es,name_en,description_es,description_en,target,resource_code,rewards) values
 ('project-fortify','Murallas del Nexo','Nexus Walls','Aporta oro para reforzar la base del clan.','Contribute gold to reinforce the clan base.',5000,'gold','{"clan_xp":600,"clan_coins":120}'),
 ('project-arsenal','Arsenal Compartido','Shared Arsenal','Reúne mineral para impulsar la herrería del clan.','Gather ore to advance the clan forge.',240,'ore','{"clan_xp":450,"clan_coins":90}'),
 ('project-arcane','Observatorio Arcano','Arcane Observatory','Acumula polvo arcano para investigación colectiva.','Collect arcane dust for shared research.',100,'arcane_dust','{"clan_xp":550,"clan_coins":100}')
on conflict(id) do nothing;

insert into game.clan_mission_definitions(id,name_es,name_en,metric,target,rewards) values
 ('clan-combat','Cazadores Unidos','United Hunters','kills',120,'{"clan_xp":350,"clan_coins":70}'),
 ('clan-boss','Rompejefes','Boss Breakers','boss_kills',8,'{"clan_xp":500,"clan_coins":110}'),
 ('clan-craft','Maestros del Taller','Workshop Masters','crafted',80,'{"clan_xp":300,"clan_coins":60}'),
 ('clan-pvp','Estandarte de Guerra','War Banner','arena_wins',25,'{"clan_xp":450,"clan_coins":90}')
on conflict(id) do nothing;

insert into game.clan_shop_items(id,name_es,name_en,min_clan_level,price_clan_coins,contents) values
 ('clan-chest-scout','Cofre de Explorador','Scout Chest',1,80,'{"gold":250,"resources":{"ore":3,"herbs":3}}'),
 ('clan-chest-raider','Cofre de Incursor','Raider Chest',3,160,'{"gold":500,"resources":{"arcane_dust":2,"crystals":1}}'),
 ('clan-banner-token','Ficha de Estandarte','Banner Token',5,250,'{"resources":{"clan_banner_token":1}}'),
 ('clan-relic-cache','Alijo de Reliquias','Relic Cache',8,420,'{"gold":900,"resources":{"crystals":2,"arcane_dust":4}}')
on conflict(id) do nothing;

-- A missed day resets the streak to one on the next successful claim while preserving the 30-day reward calendar.
create or replace function game.normalize_daily_reward_streak()
returns trigger language plpgsql as $$
begin
  if new.last_claimed_at is not null and old.last_claimed_at is not null
     and old.last_claimed_at::date < current_date-1
     and new.last_claimed_at::date=current_date then
    new.streak:=1;
  end if;
  return new;
end $$;
drop trigger if exists trg_normalize_daily_reward_streak on game.daily_reward_state;
create trigger trg_normalize_daily_reward_streak before update on game.daily_reward_state
for each row execute function game.normalize_daily_reward_streak();

commit;
