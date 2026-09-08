begin;

alter table game.inventory_items add column if not exists favorite boolean not null default false;
alter table game.inventory_items add column if not exists locked boolean not null default false;

create table if not exists game.item_upgrade_log (
  id uuid primary key default gen_random_uuid(),
  character_id uuid not null references game.characters(id) on delete cascade,
  inventory_item_id uuid references game.inventory_items(id) on delete set null,
  from_level integer not null,
  to_level integer not null,
  gold_spent bigint not null default 0,
  material_code text,
  material_spent bigint not null default 0,
  created_at timestamptz not null default now()
);
create index if not exists item_upgrade_character_idx on game.item_upgrade_log(character_id,created_at desc);

-- Locked items cannot enter the player market even if a stale client bypasses the UI.
create or replace function game.validate_market_listing_integrity()
returns trigger
language plpgsql
as $$
declare
  v_owner uuid;
  v_locked boolean;
begin
  select ch.player_id,i.locked into v_owner,v_locked
    from game.inventory_items i
    join game.characters ch on ch.id=i.character_id
   where i.id=new.inventory_item_id;

  if v_owner is null or v_owner<>new.seller_player_id then
    raise exception 'ITEM_NOT_OWNED';
  end if;
  if new.status='active' and v_locked then
    raise exception 'ITEM_LOCKED';
  end if;
  if new.status='active' and exists(select 1 from game.equipment where inventory_item_id=new.inventory_item_id) then
    raise exception 'ITEM_EQUIPPED';
  end if;
  return new;
end $$;

drop trigger if exists trg_validate_market_listing_integrity on game.market_listings;
create trigger trg_validate_market_listing_integrity
before insert or update of inventory_item_id,seller_player_id,status on game.market_listings
for each row execute function game.validate_market_listing_integrity();

-- Enhancement has a real, bounded contribution to character power. Base stat bonuses
-- still come from equipment triggers; enhancement adds mastery power without double-applying stats.
create or replace function game.recompute_character_power(p_character uuid)
returns void
language plpgsql
as $$
declare
  v_item_power numeric;
begin
  select coalesce(sum(
    coalesce((d.stats->>'power')::numeric,0) +
    i.enhancement_level*25 +
    coalesce((d.stats->>'power')::numeric,0)*(i.enhancement_level*.08)
  ),0)
  into v_item_power
  from game.equipment e
  join game.inventory_items i on i.id=e.inventory_item_id
  join game.item_definitions d on d.id=i.item_definition_id
  where e.character_id=p_character;

  update game.characters ch
     set power=greatest(0,round(
       ch.hp_max*.7 + ch.mp_max*.35 + ch.energy_max*.2 +
       st.physical_attack*12 + st.magic_attack*12 + st.defense*9 +
       st.magic_resistance*9 + st.speed*1.5 + v_item_power
     )::bigint),updated_at=now()
    from game.character_stats st
   where ch.id=p_character and st.character_id=ch.id;
end $$;

select game.recompute_character_power(id) from game.characters;

commit;
