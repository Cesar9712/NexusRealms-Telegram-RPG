begin;

create table if not exists game.player_game_settings (
  player_id uuid primary key references game.players(id) on delete cascade,
  language text not null default 'es' check (language in ('es','en')),
  graphics_preset text not null default 'auto' check (graphics_preset in ('auto','low','medium','high')),
  music_volume numeric(4,3) not null default .35 check (music_volume between 0 and 1),
  effects_volume numeric(4,3) not null default .55 check (effects_volume between 0 and 1),
  muted boolean not null default false,
  reduced_motion boolean not null default false,
  onboarding_step integer not null default 0 check (onboarding_step between 0 and 20),
  onboarding_complete boolean not null default false,
  updated_at timestamptz not null default now()
);

insert into game.player_game_settings(player_id,language)
select id,case when locale ilike 'en%' then 'en' else 'es' end from game.players
on conflict(player_id) do nothing;

create table if not exists game.analytics_events (
  id bigserial primary key,
  player_id uuid references game.players(id) on delete set null,
  event_name text not null,
  session_id text,
  properties jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);
create index if not exists analytics_event_time_idx on game.analytics_events(event_name,created_at desc);
create index if not exists analytics_player_time_idx on game.analytics_events(player_id,created_at desc);

create table if not exists game.liveops_notes (
  id uuid primary key default gen_random_uuid(),
  title text not null,
  body text not null default '',
  starts_at timestamptz,
  ends_at timestamptz,
  enabled boolean not null default true,
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  check (ends_at is null or starts_at is null or ends_at>starts_at)
);

-- Keep referral and retention analytics efficient without storing sensitive request payloads.
create index if not exists player_created_date_idx on game.players(created_at);
create index if not exists combat_finished_time_idx on game.combat_sessions(finished_at) where finished_at is not null;
create index if not exists crafting_claimed_time_idx on game.crafting_jobs(claimed_at) where claimed_at is not null;

commit;
