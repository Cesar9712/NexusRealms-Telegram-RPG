begin;

create or replace function game.recompute_character_power(p_character uuid)
returns void
language plpgsql
as $$
declare
  v_item_power bigint;
begin
  select coalesce(sum(coalesce((d.stats->>'power')::numeric,0)),0)::bigint
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
     )::bigint),
     updated_at=now()
    from game.character_stats st
   where ch.id=p_character and st.character_id=ch.id;
end $$;

create or replace function game.apply_equipment_stat_delta()
returns trigger
language plpgsql
as $$
declare
  v_character uuid;
  v_item uuid;
  v_stats jsonb;
  v_delta integer;
begin
  if tg_op='INSERT' then
    v_character:=new.character_id;
    v_item:=new.inventory_item_id;
    v_delta:=1;
  elsif tg_op='DELETE' then
    v_character:=old.character_id;
    v_item:=old.inventory_item_id;
    v_delta:=-1;
  else
    return coalesce(new,old);
  end if;

  select d.stats into v_stats
    from game.inventory_items i
    join game.item_definitions d on d.id=i.item_definition_id
   where i.id=v_item;
  v_stats:=coalesce(v_stats,'{}'::jsonb);

  update game.character_stats
     set physical_attack=greatest(0,physical_attack+v_delta*coalesce((v_stats->>'physical_attack')::integer,0)),
         magic_attack=greatest(0,magic_attack+v_delta*coalesce((v_stats->>'magic_attack')::integer,0)),
         defense=greatest(0,defense+v_delta*coalesce((v_stats->>'defense')::integer,0)),
         magic_resistance=greatest(0,magic_resistance+v_delta*coalesce((v_stats->>'magic_resistance')::integer,0)),
         speed=greatest(1,speed+v_delta*coalesce((v_stats->>'speed')::integer,0)),
         crit_chance=greatest(0,least(.75,crit_chance+v_delta*coalesce((v_stats->>'crit_chance')::numeric,0))),
         crit_damage=greatest(1,crit_damage+v_delta*coalesce((v_stats->>'crit_damage')::numeric,0)),
         accuracy=greatest(.1,accuracy+v_delta*coalesce((v_stats->>'accuracy')::numeric,0)),
         evasion=greatest(0,least(.75,evasion+v_delta*coalesce((v_stats->>'evasion')::numeric,0))),
         block_chance=greatest(0,least(.75,block_chance+v_delta*coalesce((v_stats->>'block_chance')::numeric,0))),
         lifesteal=greatest(0,least(.75,lifesteal+v_delta*coalesce((v_stats->>'lifesteal')::numeric,0))),
         updated_at=now()
   where character_id=v_character;

  perform game.recompute_character_power(v_character);
  return coalesce(new,old);
end $$;

drop trigger if exists trg_equipment_stats_insert on game.equipment;
drop trigger if exists trg_equipment_stats_delete on game.equipment;
create trigger trg_equipment_stats_insert
after insert on game.equipment
for each row execute function game.apply_equipment_stat_delta();
create trigger trg_equipment_stats_delete
after delete on game.equipment
for each row execute function game.apply_equipment_stat_delta();

-- Backfill equipment bonuses for existing equipped items exactly once when this migration runs.
with bonuses as (
  select e.character_id,
    coalesce(sum(coalesce((d.stats->>'physical_attack')::integer,0)),0)::integer physical_attack,
    coalesce(sum(coalesce((d.stats->>'magic_attack')::integer,0)),0)::integer magic_attack,
    coalesce(sum(coalesce((d.stats->>'defense')::integer,0)),0)::integer defense,
    coalesce(sum(coalesce((d.stats->>'magic_resistance')::integer,0)),0)::integer magic_resistance,
    coalesce(sum(coalesce((d.stats->>'speed')::integer,0)),0)::integer speed,
    coalesce(sum(coalesce((d.stats->>'crit_chance')::numeric,0)),0)::numeric crit_chance,
    coalesce(sum(coalesce((d.stats->>'crit_damage')::numeric,0)),0)::numeric crit_damage,
    coalesce(sum(coalesce((d.stats->>'accuracy')::numeric,0)),0)::numeric accuracy,
    coalesce(sum(coalesce((d.stats->>'evasion')::numeric,0)),0)::numeric evasion,
    coalesce(sum(coalesce((d.stats->>'block_chance')::numeric,0)),0)::numeric block_chance,
    coalesce(sum(coalesce((d.stats->>'lifesteal')::numeric,0)),0)::numeric lifesteal
  from game.equipment e
  join game.inventory_items i on i.id=e.inventory_item_id
  join game.item_definitions d on d.id=i.item_definition_id
  group by e.character_id
)
update game.character_stats st
   set physical_attack=st.physical_attack+b.physical_attack,
       magic_attack=st.magic_attack+b.magic_attack,
       defense=st.defense+b.defense,
       magic_resistance=st.magic_resistance+b.magic_resistance,
       speed=st.speed+b.speed,
       crit_chance=least(.75,st.crit_chance+b.crit_chance),
       crit_damage=greatest(1,st.crit_damage+b.crit_damage),
       accuracy=greatest(.1,st.accuracy+b.accuracy),
       evasion=least(.75,st.evasion+b.evasion),
       block_chance=least(.75,st.block_chance+b.block_chance),
       lifesteal=least(.75,st.lifesteal+b.lifesteal),
       updated_at=now()
  from bonuses b
 where st.character_id=b.character_id;

select game.recompute_character_power(id) from game.characters;

commit;
