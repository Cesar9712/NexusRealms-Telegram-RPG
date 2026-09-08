begin;

-- Deterministic character leveling: every 300 accumulated XP advances one level, capped at 100.
create or replace function game.level_from_experience(p_experience bigint)
returns integer language sql immutable as $$
  select least(100, greatest(1, 1 + floor(greatest(0,p_experience) / 300.0)::int));
$$;

create or replace function game.on_character_experience_progress()
returns trigger language plpgsql as $$
declare
  target_level integer;
  gained integer;
  hp_gain integer := 0;
  mp_gain integer := 0;
  patk_gain integer := 0;
  matk_gain integer := 0;
  def_gain integer := 0;
  mres_gain integer := 0;
  speed_gain integer := 0;
begin
  target_level := game.level_from_experience(new.experience);
  if target_level <= new.level then return new; end if;
  gained := target_level - new.level;

  case new.class_id
    when 'warrior' then hp_gain:=12*gained; mp_gain:=3*gained; patk_gain:=2*gained; def_gain:=1*gained;
    when 'mage' then hp_gain:=6*gained; mp_gain:=12*gained; matk_gain:=2*gained; mres_gain:=1*gained;
    when 'archer' then hp_gain:=8*gained; mp_gain:=6*gained; patk_gain:=2*gained; speed_gain:=1*gained;
    when 'assassin' then hp_gain:=7*gained; mp_gain:=5*gained; patk_gain:=2*gained; speed_gain:=2*gained;
    else hp_gain:=7*gained; mp_gain:=5*gained; patk_gain:=1*gained; matk_gain:=1*gained;
  end case;

  update game.character_stats
     set physical_attack=physical_attack+patk_gain,
         magic_attack=magic_attack+matk_gain,
         defense=defense+def_gain,
         magic_resistance=magic_resistance+mres_gain,
         speed=speed+speed_gain,
         crit_chance=least(0.75,crit_chance + case when new.class_id in ('archer','assassin') then 0.001*gained else 0 end),
         updated_at=now()
   where character_id=new.id;

  update game.characters
     set level=target_level,
         hp_max=hp_max+hp_gain,
         hp=least(hp_max+hp_gain,hp+hp_gain),
         mp_max=mp_max+mp_gain,
         mp=least(mp_max+mp_gain,mp+mp_gain),
         updated_at=now()
   where id=new.id;

  update game.characters ch
     set power=round(
       ch.hp_max*.7 + ch.mp_max*.35 + ch.energy_max*.2 +
       st.physical_attack*12 + st.magic_attack*12 + st.defense*9 + st.magic_resistance*9 + st.speed*1.5
     )::bigint,
     updated_at=now()
    from game.character_stats st
   where ch.id=new.id and st.character_id=ch.id;

  return new;
end $$;

drop trigger if exists trg_character_experience_progress on game.characters;
create trigger trg_character_experience_progress
after update of experience on game.characters
for each row execute function game.on_character_experience_progress();

-- Backfill characters that already accumulated XP before leveling existed.
update game.characters set experience=experience;

create or replace function game.add_profession_xp(p_character uuid,p_profession text,p_xp integer)
returns void language plpgsql as $$
declare total_xp bigint;
begin
  if p_profession is null or p_xp <= 0 then return; end if;
  insert into game.profession_progress(character_id,profession_id,experience,level)
  values(p_character,p_profession,p_xp,1)
  on conflict(character_id,profession_id) do update
     set experience=game.profession_progress.experience+p_xp,updated_at=now();
  select experience into total_xp from game.profession_progress where character_id=p_character and profession_id=p_profession;
  update game.profession_progress
     set level=least(100,greatest(level,1+floor(total_xp/250.0)::int)),updated_at=now()
   where character_id=p_character and profession_id=p_profession;
end $$;

-- Extend the existing crafting progression trigger with real profession XP.
create or replace function game.on_crafting_claim_progress()
returns trigger language plpgsql as $$
declare p uuid; prof text;
begin
  if old.status is distinct from 'claimed' and new.status='claimed' then
    select player_id into p from game.characters where id=new.character_id;
    select profession_id into prof from game.crafting_recipes where id=new.recipe_id;
    perform game.progress_quest_counter(new.character_id,'craft',greatest(1,new.quantity));
    perform game.progress_achievement_metric(new.character_id,'crafted',greatest(1,new.quantity));
    perform game.add_battle_pass_xp(p,8*greatest(1,new.quantity));
    perform game.add_profession_xp(new.character_id,prof,25*greatest(1,new.quantity));
  end if;
  return new;
end $$;

commit;
