begin;

create or replace function game.on_combat_victory_loot()
returns trigger
language plpgsql
as $$
declare
  v_character uuid;
  v_realm text;
  v_tier text;
  v_material text;
  v_item text;
  v_material_qty integer;
  v_item_chance numeric;
  v_item_dropped boolean:=false;
begin
  if new.event_type<>'victory' then return new; end if;

  select s.character_id,coalesce(e.realm_id,b.realm_id),coalesce(e.tier,'boss')
    into v_character,v_realm,v_tier
    from game.combat_sessions s
    left join game.enemy_definitions e on e.id=s.enemy_id
    left join game.boss_definitions b on b.id=s.boss_id
   where s.id=new.combat_id;

  if v_character is null or v_realm is null then return new; end if;

  v_material:=case v_realm
    when 'ashen-frontier' then 'ore'
    when 'cursed-grove' then 'herbs'
    when 'ironpeaks' then 'iron_ore'
    when 'spectral-marsh' then 'essence'
    when 'crimson-wastes' then 'arcane_dust'
    when 'frostbound' then 'frost_shard'
    when 'abyss' then 'void_essence'
    when 'celestial' then 'celestial_dust'
    when 'chaos' then 'chaos_fragment'
    else 'materials'
  end;

  v_item:=case v_realm
    when 'ashen-frontier' then 'loot-ash-blade'
    when 'cursed-grove' then 'loot-rune-cloak'
    when 'ironpeaks' then 'loot-iron-helm'
    when 'spectral-marsh' then 'loot-spectral-ring'
    when 'crimson-wastes' then 'loot-crimson-relic'
    when 'frostbound' then 'loot-frost-boots'
    when 'abyss' then 'loot-abyss-amulet'
    when 'celestial' then 'loot-celestial-cape'
    when 'chaos' then 'loot-chaos-artifact'
    else null
  end;

  v_material_qty:=case v_tier when 'elite' then 2 when 'champion' then 3 when 'boss' then 4 else 1 end;
  v_material_qty:=v_material_qty+floor(random()*2)::integer;
  v_item_chance:=case v_tier when 'elite' then .14 when 'champion' then .20 when 'boss' then .32 else .06 end;

  insert into game.resources(character_id,resource_code,amount)
  values(v_character,v_material,v_material_qty)
  on conflict(character_id,resource_code) do update
    set amount=game.resources.amount+excluded.amount,updated_at=now();

  if v_item is not null and random()<v_item_chance then
    insert into game.inventory_items(character_id,item_definition_id,quantity)
    select v_character,v_item,1
    where exists(select 1 from game.item_definitions where id=v_item and enabled);
    v_item_dropped:=found;
  end if;

  insert into game.combat_events(combat_id,turn_number,actor,event_type,payload)
  values(new.combat_id,new.turn_number,'system','loot',jsonb_build_object(
    'resource',v_material,
    'quantity',v_material_qty,
    'item',case when v_item_dropped then v_item else null end
  ));

  perform game.progress_quest_counter(v_character,'collect',v_material_qty);
  perform game.progress_achievement_metric(v_character,'collected',v_material_qty);
  return new;
end $$;

drop trigger if exists trg_combat_victory_loot on game.combat_events;
create trigger trg_combat_victory_loot
after insert on game.combat_events
for each row execute function game.on_combat_victory_loot();

commit;
