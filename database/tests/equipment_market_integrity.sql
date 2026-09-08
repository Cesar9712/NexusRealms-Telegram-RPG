begin;

do $$
declare
  v_player uuid;
  v_character uuid;
  v_item uuid;
  v_failed boolean;
begin
  insert into game.players(telegram_user_id,display_name)
  values(-991002,'equipment-integrity-test')
  returning id into v_player;

  insert into game.characters(player_id,class_id,current_realm_id,name,hp,hp_max,mp,mp_max,energy,energy_max)
  values(v_player,'warrior','ashen-frontier','Integrity Hero',140,140,70,70,100,100)
  returning id into v_character;

  insert into game.item_definitions(id,name_es,name_en,item_type,rarity,min_level,tradable)
  values('test-integrity-weapon','Arma de prueba','Test Weapon','weapon','rare',2,true)
  on conflict(id) do update set item_type='weapon',min_level=2,tradable=true;

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

  v_failed:=false;
  begin
    insert into game.market_listings(seller_player_id,inventory_item_id,price)
    values(v_player,v_item,100);
  exception when others then
    v_failed:=position('ITEM_EQUIPPED' in sqlerrm)>0;
  end;
  if not v_failed then raise exception 'expected ITEM_EQUIPPED'; end if;

  delete from game.equipment where inventory_item_id=v_item;
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
