do $$
declare
  enemy_count integer;
  boss_count integer;
  skill_count integer;
  class_count integer;
begin
  select count(*) into enemy_count from game.enemy_definitions where enabled;
  select count(*) into boss_count from game.boss_definitions where enabled;
  select count(*) into skill_count from game.skill_definitions where enabled;
  select count(*) into class_count from game.classes where enabled;

  if enemy_count < 50 then raise exception 'expected at least 50 enemies, got %', enemy_count; end if;
  if boss_count < 12 then raise exception 'expected at least 12 bosses, got %', boss_count; end if;
  if skill_count < 32 then raise exception 'expected at least 32 skills, got %', skill_count; end if;
  if class_count <> 4 then raise exception 'expected exactly 4 launch classes, got %', class_count; end if;
end $$;
