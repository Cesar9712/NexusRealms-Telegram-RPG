begin;

-- The original combat progression trigger did not assign c.player_id to p,
-- causing battle-pass progress inserts to receive a NULL player_id after victories.
create or replace function game.on_combat_victory_progress()
returns trigger language plpgsql as $$
declare
  ch uuid;
  p uuid;
  enemy text;
  boss text;
begin
  if new.event_type <> 'victory' then return new; end if;

  select s.character_id, c.player_id, s.enemy_id, s.boss_id
    into ch, p, enemy, boss
  from game.combat_sessions s
  join game.characters c on c.id=s.character_id
  where s.id=new.combat_id;

  if ch is null or p is null then return new; end if;

  perform game.progress_quest_counter(ch,case when boss is not null then 'boss' else 'kill' end,1);
  perform game.progress_achievement_metric(ch,'kills',1);
  if boss is not null then
    perform game.progress_achievement_metric(ch,'boss_kills',1);
  end if;
  perform game.add_battle_pass_xp(p,15);

  if enemy is not null then
    insert into game.character_codex(character_id,codex_id,progress)
    values(ch,'enemy:'||enemy,1)
    on conflict(character_id,codex_id) do update
      set progress=game.character_codex.progress+1;
  elsif boss is not null then
    insert into game.character_codex(character_id,codex_id,progress)
    values(ch,'boss:'||boss,1)
    on conflict(character_id,codex_id) do update
      set progress=game.character_codex.progress+1;
  end if;

  return new;
end $$;

commit;
