do $$
declare n int;
begin
  select count(*) into n from game.quest_definitions where enabled=true; if n < 50 then raise exception 'Need >=50 quests, got %',n; end if;
  select count(*) into n from game.crafting_recipes where enabled=true; if n < 50 then raise exception 'Need >=50 recipes, got %',n; end if;
  select count(*) into n from game.achievement_definitions where enabled=true; if n < 100 then raise exception 'Need >=100 achievements, got %',n; end if;
  select count(*) into n from game.bastion_building_definitions where enabled=true; if n < 14 then raise exception 'Need 14 Bastion buildings, got %',n; end if;
  select count(*) into n from game.profession_definitions where enabled=true; if n < 8 then raise exception 'Need 8 professions, got %',n; end if;
  select count(*) into n from game.event_definitions where enabled=true; if n < 8 then raise exception 'Need 8 event definitions, got %',n; end if;
  select count(*) into n from game.battle_pass_rewards where season_id='season-001'; if n < 120 then raise exception 'Need 60 free + 60 premium BP rewards, got %',n; end if;
  if (select enabled from game.feature_flags where key='real_money_withdrawals') then raise exception 'Real-money withdrawals must default OFF'; end if;
  if (select enabled from game.feature_flags where key='web3') then raise exception 'Web3 must default OFF'; end if;
end $$;
