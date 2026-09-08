begin;

create table if not exists game.event_personal_tier_definitions (
  event_id text not null references game.event_definitions(id) on delete cascade,
  tier integer not null check(tier between 1 and 10),
  target bigint not null check(target>0),
  reward jsonb not null default '{}'::jsonb,
  primary key(event_id,tier)
);

insert into game.event_personal_tier_definitions(event_id,tier,target,reward)
select e.id,t.tier,t.target,
  case t.tier
    when 1 then '{"gold":80,"xp":40}'::jsonb
    when 2 then '{"gold":180,"xp":90,"resources":{"event_token":1}}'::jsonb
    when 3 then '{"gold":350,"xp":170,"resources":{"event_token":2,"arcane_dust":1}}'::jsonb
    else '{"gold":650,"xp":300,"resources":{"event_token":4,"crystals":1}}'::jsonb end
from game.event_definitions e
cross join (values(1,5),(2,15),(3,35),(4,70)) t(tier,target)
on conflict(event_id,tier) do nothing;

create table if not exists game.battle_pass_mission_definitions (
  id text primary key,
  period text not null check(period in ('daily','weekly','season')),
  metric text not null,
  target integer not null check(target>0),
  xp_reward integer not null check(xp_reward>0),
  name_es text not null,
  name_en text not null,
  enabled boolean not null default true
);
create table if not exists game.battle_pass_mission_progress (
  season_id text not null references game.battle_pass_seasons(id) on delete cascade,
  player_id uuid not null references game.players(id) on delete cascade,
  mission_id text not null references game.battle_pass_mission_definitions(id),
  cycle_key text not null,
  progress integer not null default 0 check(progress>=0),
  completed_at timestamptz,
  rewarded_at timestamptz,
  updated_at timestamptz not null default now(),
  primary key(season_id,player_id,mission_id,cycle_key)
);
create index if not exists bp_mission_player_idx on game.battle_pass_mission_progress(player_id,season_id,cycle_key);

insert into game.battle_pass_mission_definitions(id,period,metric,target,xp_reward,name_es,name_en) values
 ('bp-daily-kills','daily','kills',8,30,'Victoria diaria','Daily Victory'),
 ('bp-daily-craft','daily','crafted',2,25,'Manos a la obra','Hands at Work'),
 ('bp-daily-travel','daily','travel',1,20,'Caminante','Realm Walker'),
 ('bp-weekly-kills','weekly','kills',45,90,'Cazador semanal','Weekly Hunter'),
 ('bp-weekly-boss','weekly','boss_kills',3,110,'Rompejefes','Boss Breaker'),
 ('bp-weekly-pvp','weekly','arena_wins',5,100,'Gloria en Arena','Arena Glory'),
 ('bp-season-craft','season','crafted',80,220,'Artesano del Nexo','Nexus Artisan')
on conflict(id) do nothing;

create or replace function game.live_cycle_key(p_period text)
returns text language sql stable as $$
  select case p_period when 'daily' then to_char(current_date,'YYYY-MM-DD') when 'weekly' then to_char(current_date,'IYYY-IW') else coalesce(game.current_battle_pass_season(),'no-season') end
$$;

create or replace function game.progress_battle_pass_missions(p_player uuid,p_metric text,p_increment integer)
returns void language plpgsql as $$
declare s text; m record; k text; total integer;
begin
  s:=game.current_battle_pass_season();if s is null or p_increment<=0 then return;end if;
  for m in select * from game.battle_pass_mission_definitions where enabled and metric=p_metric loop
    k:=game.live_cycle_key(m.period);
    insert into game.battle_pass_mission_progress(season_id,player_id,mission_id,cycle_key,progress)
    values(s,p_player,m.id,k,least(m.target,p_increment))
    on conflict(season_id,player_id,mission_id,cycle_key) do update
      set progress=least(m.target,game.battle_pass_mission_progress.progress+p_increment),updated_at=now();
    select progress into total from game.battle_pass_mission_progress where season_id=s and player_id=p_player and mission_id=m.id and cycle_key=k for update;
    if total>=m.target then
      update game.battle_pass_mission_progress set completed_at=coalesce(completed_at,now()),rewarded_at=coalesce(rewarded_at,now()) where season_id=s and player_id=p_player and mission_id=m.id and cycle_key=k and rewarded_at is null;
      if found then perform game.add_battle_pass_xp(p_player,m.xp_reward);end if;
    end if;
  end loop;
end $$;

create or replace function game.progress_live_activity(p_player uuid,p_metric text,p_increment integer default 1)
returns void language plpgsql as $$
declare clan uuid; wk text:=to_char(current_date,'IYYY-IW');
begin
  if p_player is null or p_increment<=0 then return;end if;
  perform game.progress_battle_pass_missions(p_player,p_metric,p_increment);
  select clan_id into clan from game.clan_members where player_id=p_player;
  if clan is not null then
    insert into game.clan_mission_progress(clan_id,mission_id,cycle_key,progress,completed_at)
    select clan,d.id,wk,least(d.target,p_increment),case when p_increment>=d.target then now() else null end
    from game.clan_mission_definitions d where d.enabled and d.metric=p_metric
    on conflict(clan_id,mission_id,cycle_key) do update
      set progress=least((select target from game.clan_mission_definitions where id=excluded.mission_id),game.clan_mission_progress.progress+p_increment),
          completed_at=case when game.clan_mission_progress.completed_at is not null then game.clan_mission_progress.completed_at when game.clan_mission_progress.progress+p_increment >= (select target from game.clan_mission_definitions where id=excluded.mission_id) then now() else null end,
          updated_at=now();
  end if;
  insert into game.event_contributions(event_instance_id,player_id,contribution)
  select i.id,p_player,p_increment from game.event_instances i join game.event_definitions d on d.id=i.event_id
  where i.status='active' and now() between i.starts_at and i.ends_at and (
    d.config->>'metric'=p_metric or
    (d.event_type='combat' and p_metric='kills') or
    (d.event_type='boss' and p_metric='boss_kills') or
    (d.event_type='exploration' and p_metric='travel') or
    (d.event_type='gathering' and p_metric='crafted') or
    (d.event_type='clan' and p_metric='clan_contribution')
  )
  on conflict(event_instance_id,player_id) do update set contribution=game.event_contributions.contribution+excluded.contribution,updated_at=now();
end $$;

create or replace function game.live_activity_from_combat()
returns trigger language plpgsql as $$
declare p uuid; boss text;
begin
  if new.event_type<>'victory' then return new;end if;
  select ch.player_id,s.boss_id into p,boss from game.combat_sessions s join game.characters ch on ch.id=s.character_id where s.id=new.combat_id;
  perform game.progress_live_activity(p,'kills',1);if boss is not null then perform game.progress_live_activity(p,'boss_kills',1);end if;return new;
end $$;
drop trigger if exists trg_live_activity_combat on game.combat_events;
create trigger trg_live_activity_combat after insert on game.combat_events for each row execute function game.live_activity_from_combat();

create or replace function game.live_activity_from_crafting()
returns trigger language plpgsql as $$
declare p uuid;begin if old.status is distinct from 'claimed' and new.status='claimed' then select player_id into p from game.characters where id=new.character_id;perform game.progress_live_activity(p,'crafted',greatest(1,new.quantity));end if;return new;end $$;
drop trigger if exists trg_live_activity_crafting on game.crafting_jobs;
create trigger trg_live_activity_crafting after update on game.crafting_jobs for each row execute function game.live_activity_from_crafting();

create or replace function game.live_activity_from_travel()
returns trigger language plpgsql as $$
declare p uuid;begin select player_id into p from game.characters where id=new.character_id;perform game.progress_live_activity(p,'travel',1);return new;end $$;
drop trigger if exists trg_live_activity_travel on game.realm_travel_log;
create trigger trg_live_activity_travel after insert on game.realm_travel_log for each row execute function game.live_activity_from_travel();

create or replace function game.live_activity_from_arena()
returns trigger language plpgsql as $$
begin if new.winner is not null then perform game.progress_live_activity(new.winner,'arena_wins',1);end if;return new;end $$;
drop trigger if exists trg_live_activity_arena on game.arena_matches;
create trigger trg_live_activity_arena after insert on game.arena_matches for each row execute function game.live_activity_from_arena();

commit;
