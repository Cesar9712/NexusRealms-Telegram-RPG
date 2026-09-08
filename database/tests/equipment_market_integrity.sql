begin;

do $$
declare
  v_player uuid;
  v_character uuid;
  v_item uuid;
  v_failed boolean;
  v_attack integer;
  v_power bigint;
begin
  insert into game.players(telegram_user_id,display_name)
  values(-991002,'equipment-integrity-test')
  returning id into v_player;

  insert into game.characters(player_id,class_id,current_realm_id,name,hp,hp_max,mp,mp_max,energy,energy_max)
  values(v_player,'warrior','ashen-frontier','Integrity Hero',140,140,70,70,100,100)
  returning id into v_character;

  insert into game.character_stats(character_id,physical_attack,magic_attack,defense,magic_resistance,speed)
  values(v_character,10,5,5,5,90);

  insert into game.item_definitions(id,name_es,name_en,item_type,rarity,min_level,stats,tradable)
  values('test-integrity-weapon','Arma de prueba','Test Weapon','weapon','rare',2,'{"physical_attack":5,"power":20}'::jsonb,true)
  on conflict(id) do update set item_type='weapon',min_level=2,stats=excluded.stats,tradable=true;

  insert into game.inventory_items(character_id,item_definition_id)
  values(v_character,'test-integrity-weapon')
  returning id into v_item;

  v_failed:=false;
  begin
    insert into game.equipment(character_id,slot,inventory_item_id)
    values(v_character,'weapon',v_item);
  exception when others then
    v_failed:=position('ITEM_LEVEL_REQUIRED' in sqlerrm)>0;
  end;
  if not v_failed then raise exception 'expected ITEM_LEVEL_REQUIRED'; end if;

  update game.characters set level=2 where id=v_character;

  v_failed:=false;
  begin
    insert into game.equipment(character_id,slot,inventory_item_id)
    values(v_character,'chest',v_item);
  exception when others then
    v_failed:=position('INVALID_EQUIPMENT_SLOT' in sqlerrm)>0;
  end;
  if not v_failed then raise exception 'expected INVALID_EQUIPMENT_SLOT'; end if;

  insert into game.equipment(character_id,slot,inventory_item_id)
  values(v_character,'weapon',v_item);

  select physical_attack into v_attack from game.character_stats where character_id=v_character;
  select power into v_power from game.characters where id=v_character;
  if v_attack<>15 then raise exception 'equipment attack bonus not applied: %',v_attack; end if;
  if v_power<=0 then raise exception 'equipment power was not recomputed'; end if;

  v_failed:=false;
  begin
    insert into game.market_listings(seller_player_id,inventory_item_id,price)
    values(v_player,v_item,100);
  exception when others then
    v_failed:=position('ITEM_EQUIPPED' in sqlerrm)>0;
  end;
  if not v_failed then raise exception 'expected ITEM_EQUIPPED'; end if;

  delete from game.equipment where inventory_item_id=v_item;
  select physical_attack into v_attack from game.character_stats where character_id=v_character;
  if v_attack<>10 then raise exception 'equipment attack bonus not removed: %',v_attack; end if;

  insert into game.market_listings(seller_player_id,inventory_item_id,price)
  values(v_player,v_item,100);

  v_failed:=false;
  begin
    insert into game.equipment(character_id,slot,inventory_item_id)
    values(v_character,'weapon',v_item);
  exception when others then
    v_failed:=position('ITEM_LISTED_ON_MARKET' in sqlerrm)>0;
  end;
  if not v_failed then raise exception 'expected ITEM_LISTED_ON_MARKET'; end if;
end $$;

rollback;
