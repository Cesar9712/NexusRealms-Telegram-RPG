begin;

do $$
declare
  v_player uuid;
  v_character uuid;
  v_combat uuid;
  v_material bigint;
  v_loot_events integer;
begin
  insert into game.players(telegram_user_id,display_name)
  values(-991003,'combat-loot-test')
  returning id into v_player;

  insert into game.characters(player_id,class_id,current_realm_id,name,hp,hp_max,mp,mp_max,energy,energy_max)
  values(v_player,'warrior','ashen-frontier','Loot Hero',140,140,70,70,100,100)
  returning id into v_character;

  insert into game.character_stats(character_id,physical_attack,magic_attack,defense,magic_resistance,speed)
  values(v_character,16,5,14,8,90);

  insert into game.combat_sessions(character_id,enemy_id,state,player_hp,player_mp,enemy_hp)
  values(v_character,'ash_wolf','victory',120,60,0)
  returning id into v_combat;

  insert into game.combat_events(combat_id,turn_number,actor,event_type,payload)
  values(v_combat,1,'system','victory','{}'::jsonb);

  select amount into v_material
    from game.resources
   where character_id=v_character and resource_code='ore';
  if coalesce(v_material,0)<1 then
    raise exception 'expected realm material loot, got %',coalesce(v_material,0);
  end if;

  select count(*) into v_loot_events
    from game.combat_events
   where combat_id=v_combat and event_type='loot';
  if v_loot_events<>1 then
    raise exception 'expected exactly one loot event, got %',v_loot_events;
  end if;
end $$;

rollback;
