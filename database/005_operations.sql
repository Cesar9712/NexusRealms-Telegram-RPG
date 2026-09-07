begin;

alter table game.player_notifications add column if not exists dedupe_key text;
create unique index if not exists player_notifications_dedupe_idx on game.player_notifications(dedupe_key) where dedupe_key is not null;

create table if not exists game.worker_leases (
  key text primary key,
  owner text not null,
  expires_at timestamptz not null,
  updated_at timestamptz not null default now()
);

create table if not exists game.job_runs (
  id bigserial primary key,
  job_name text not null,
  started_at timestamptz not null default now(),
  finished_at timestamptz,
  status text not null default 'running',
  details jsonb not null default '{}'::jsonb
);
create index if not exists job_runs_name_idx on game.job_runs(job_name,started_at desc);

-- Server-only notification generation sources.
create or replace view game.v_finished_crafting_notifications as
select j.id job_id,ch.player_id,j.character_id,j.recipe_id,j.finishes_at,
       'craft:'||j.id::text dedupe_key
from game.crafting_jobs j join game.characters ch on ch.id=j.character_id
where j.status='running' and j.claimed_at is null and j.finishes_at<=now();

create or replace view game.v_finished_bastion_notifications as
select ch.player_id,b.character_id,b.building_code,b.upgrade_finishes_at,
       'bastion:'||b.character_id::text||':'||b.building_code||':'||extract(epoch from b.upgrade_finishes_at)::bigint::text dedupe_key
from game.bastion_buildings b join game.characters ch on ch.id=b.character_id
where b.upgrade_finishes_at is not null and b.upgrade_finishes_at<=now();

commit;
