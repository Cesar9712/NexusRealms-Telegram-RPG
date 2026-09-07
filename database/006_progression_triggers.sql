begin;

create or replace function game.current_battle_pass_season()
returns text language sql stable as $$
  select id from game.battle_pass_seasons
  where now() between starts_at and ends_at
  order by starts_at desc limit 1
$$;

create or replace function game.add_battle_pass_xp(p_player uuid, p_xp integer)
returns void language plpgsql as $$
declare s text; new_xp bigint;
begin
  s := game.current_battle_pass_season();
  if s is null then return; end if;
  insert into game.battle_pass_progress(season_id,player_id,xp,level)
  values(s,p_player,greatest(0,p_xp),1)
  on conflict(season_id,player_id) do update
    set xp=game.battle_pass_progress.xp+greatest(0,p_xp), updated_at=now();
  select xp into new_xp from game.battle_pass_progress where season_id=s and player_id=p_player;
  update game.battle_pass_progress
     set level=least(60,greatest(level,1+floor(new_xp/100.0)::int)),updated_at=now()
   where season_id=s and player_id=p_player;
end $$;

create or replace function game.progress_quest_counter(p_character uuid, p_kind text, p_increment integer default 1)
returns void language plpgsql as $$
declare rec record; cur integer; target integer;
begin
  for rec in
    select qp.quest_id,qp.progress,qd.objectives
    from game.quest_progress qp join game.quest_definitions qd on qd.id=qp.quest_id
    where qp.character_id=p_character and qp.status='active'
      and exists(select 1 from jsonb_array_elements(qd.objectives) o where o->>'type'=p_kind)
  loop
    cur := coalesce((rec.progress->>p_kind)::int,0) + p_increment;
    select coalesce((o->>'target')::int,1) into target
      from jsonb_array_elements(rec.objectives) o where o->>'type'=p_kind limit 1;
    update game.quest_progress
       set progress=jsonb_set(progress,array[p_kind],to_jsonb(cur),true),
           status=case when cur>=target then 'completed' else status end,
           updated_at=now()
     where character_id=p_character and quest_id=rec.quest_id;
  end loop;
end $$;

create or replace function game.progress_achievement_metric(p_character uuid, p_metric text, p_increment integer default 1)
returns void language plpgsql as $$
begin
  insert into game.character_achievements(character_id,achievement_id,progress,completed_at)
  select p_character,a.id,least(a.target,p_increment),case when p_increment>=a.target then now() else null end
  from game.achievement_definitions a where a.enabled and a.metric=p_metric
  on conflict(character_id,achievement_id) do update
    set progress=least((select target from game.achievement_definitions where id=excluded.achievement_id),game.character_achievements.progress+p_increment),
        completed_at=case
          when game.character_achievements.completed_at is not null then game.character_achievements.completed_at
          when game.character_achievements.progress+p_increment >= (select target from game.achievement_definitions where id=excluded.achievement_id) then now()
          else null end;
end $$;

create or replace function game.on_combat_victory_progress()
returns trigger language plpgsql as $$
declare ch uuid; p uuid; enemy text; boss text;
begin
  if new.event_type <> 'victory' then return new; end if;
  select s.character_id,s.enemy_id,s.boss_id,c.player_id into ch,enemy,boss
  from game.combat_sessions s join game.characters c on c.id=s.character_id where s.id=new.combat_id;
  if ch is null then return new; end if;
  perform game.progress_quest_counter(ch,case when boss is not null then 'boss' else 'kill' end,1);
  perform game.progress_achievement_metric(ch,'kills',1);
  if boss is not null then perform game.progress_achievement_metric(ch,'boss_kills',1); end if;
  perform game.add_battle_pass_xp(p,15);
  if enemy is not null then
    insert into game.character_codex(character_id,codex_id,progress)
    values(ch,'enemy:'||enemy,1)
    on conflict(character_id,codex_id) do update set progress=game.character_codex.progress+1;
  elsif boss is not null then
    insert into game.character_codex(character_id,codex_id,progress)
    values(ch,'boss:'||boss,1)
    on conflict(character_id,codex_id) do update set progress=game.character_codex.progress+1;
  end if;
  return new;
end $$;

drop trigger if exists trg_combat_victory_progress on game.combat_events;
create trigger trg_combat_victory_progress after insert on game.combat_events
for each row execute function game.on_combat_victory_progress();

create or replace function game.on_realm_travel_progress()
returns trigger language plpgsql as $$
declare p uuid;
begin
  select player_id into p from game.characters where id=new.character_id;
  perform game.progress_quest_counter(new.character_id,'explore',1);
  perform game.progress_achievement_metric(new.character_id,'realms',1);
  perform game.add_battle_pass_xp(p,12);
  insert into game.character_codex(character_id,codex_id,progress)
  values(new.character_id,'realm:'||new.to_realm_id,1)
  on conflict(character_id,codex_id) do nothing;
  return new;
end $$;

drop trigger if exists trg_realm_travel_progress on game.realm_travel_log;
create trigger trg_realm_travel_progress after insert on game.realm_travel_log
for each row execute function game.on_realm_travel_progress();

create or replace function game.on_crafting_claim_progress()
returns trigger language plpgsql as $$
declare p uuid;
begin
  if old.status is distinct from 'claimed' and new.status='claimed' then
    select player_id into p from game.characters where id=new.character_id;
    perform game.progress_quest_counter(new.character_id,'craft',greatest(1,new.quantity));
    perform game.progress_achievement_metric(new.character_id,'crafted',greatest(1,new.quantity));
    perform game.add_battle_pass_xp(p,8*greatest(1,new.quantity));
  end if;
  return new;
end $$;

drop trigger if exists trg_crafting_claim_progress on game.crafting_jobs;
create trigger trg_crafting_claim_progress after update on game.crafting_jobs
for each row execute function game.on_crafting_claim_progress();

-- Global power ranking refresh is deterministic and idempotent.
create or replace function game.refresh_power_ranking()
returns void language plpgsql as $$
begin
  delete from game.ranking_snapshots where ranking_type='power' and season_id='all-time';
  insert into game.ranking_snapshots(ranking_type,season_id,player_id,score,rank)
  select 'power','all-time',player_id,power,rank::int from game.v_power_ranking;
end $$;

commit;
