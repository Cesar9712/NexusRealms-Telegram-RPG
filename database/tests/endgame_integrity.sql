begin;

do $$
declare
  v_player uuid;
  v_character uuid;
  v_dungeon text;
  v_exp text;
  v_failed boolean;
begin
  insert into game.players(telegram_user_id,display_name)
  values(-991017,'endgame-integrity-test') returning id into v_player;

  insert into game.characters(player_id,class_id,current_realm_id,name,level,hp,hp_max,mp,mp_max,energy,energy_max,power)
  values(v_player,'warrior','ashen-frontier','Endgame Hero',10,140,140,70,70,100,100,1800)
  returning id into v_character;

  select id into v_dungeon from game.dungeon_definitions where min_level<=10 order by min_level limit 1;
  if v_dungeon is null then raise exception 'missing seeded dungeon definitions'; end if;

  insert into game.dungeon_runs(player_id,character_id,dungeon_id) values(v_player,v_character,v_dungeon);
  v_failed:=false;
  begin
    insert into game.dungeon_runs(player_id,character_id,dungeon_id) values(v_player,v_character,v_dungeon);
  exception when unique_violation then v_failed:=true;
  end;
  if not v_failed then raise exception 'expected only one active dungeon run per character'; end if;

  insert into game.tower_progress(character_id) values(v_character);
  insert into game.tower_floor_claims(character_id,floor,reward) values(v_character,5,'{"gold":100}');
  v_failed:=false;
  begin
    insert into game.tower_floor_claims(character_id,floor,reward) values(v_character,5,'{"gold":9999}');
  exception when unique_violation then v_failed:=true;
  end;
  if not v_failed then raise exception 'tower milestone must be claimable only once'; end if;

  select id into v_exp from game.expedition_definitions where min_level<=10 order by min_level limit 1;
  if v_exp is null then raise exception 'missing seeded expedition definitions'; end if;
  v_failed:=false;
  begin
    insert into game.expeditions(character_id,expedition_id,started_at,finishes_at)
    values(v_character,v_exp,now(),now()-interval '1 second');
  exception when check_violation then v_failed:=true;
  end;
  if not v_failed then raise exception 'expedition server timer constraint missing'; end if;
end $$;

rollback;
