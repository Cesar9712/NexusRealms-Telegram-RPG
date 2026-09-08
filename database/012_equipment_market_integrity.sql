begin;

create or replace function game.validate_equipment_integrity()
returns trigger
language plpgsql
as $$
declare
  v_item_character uuid;
  v_item_type text;
  v_min_level integer;
  v_level integer;
  v_expected_slot text;
begin
  select i.character_id,d.item_type,d.min_level,ch.level
    into v_item_character,v_item_type,v_min_level,v_level
    from game.inventory_items i
    join game.item_definitions d on d.id=i.item_definition_id
    join game.characters ch on ch.id=i.character_id
   where i.id=new.inventory_item_id;

  if v_item_character is null or v_item_character<>new.character_id then
    raise exception 'ITEM_NOT_OWNED';
  end if;

  v_expected_slot := case v_item_type
    when 'weapon' then 'weapon'
    when 'armor' then 'chest'
    when 'helmet' then 'helmet'
    when 'boots' then 'boots'
    when 'ring' then 'ring'
    when 'necklace' then 'necklace'
    when 'cape' then 'cape'
    when 'artifact' then 'artifact'
    else null
  end;

  if v_expected_slot is null or new.slot<>v_expected_slot then
    raise exception 'INVALID_EQUIPMENT_SLOT';
  end if;

  if v_level<v_min_level then
    raise exception 'ITEM_LEVEL_REQUIRED';
  end if;

  if exists(
    select 1 from game.market_listings
     where inventory_item_id=new.inventory_item_id and status='active'
  ) then
    raise exception 'ITEM_LISTED_ON_MARKET';
  end if;

  return new;
end $$;

drop trigger if exists trg_validate_equipment_integrity on game.equipment;
create trigger trg_validate_equipment_integrity
before insert or update on game.equipment
for each row execute function game.validate_equipment_integrity();

create or replace function game.validate_market_listing_integrity()
returns trigger
language plpgsql
as $$
declare
  v_owner uuid;
begin
  select ch.player_id into v_owner
    from game.inventory_items i
    join game.characters ch on ch.id=i.character_id
   where i.id=new.inventory_item_id;

  if v_owner is null or v_owner<>new.seller_player_id then
    raise exception 'ITEM_NOT_OWNED';
  end if;

  if new.status='active' and exists(
    select 1 from game.equipment where inventory_item_id=new.inventory_item_id
  ) then
    raise exception 'ITEM_EQUIPPED';
  end if;

  return new;
end $$;

drop trigger if exists trg_validate_market_listing_integrity on game.market_listings;
create trigger trg_validate_market_listing_integrity
before insert or update of inventory_item_id,seller_player_id,status on game.market_listings
for each row execute function game.validate_market_listing_integrity();

commit;
