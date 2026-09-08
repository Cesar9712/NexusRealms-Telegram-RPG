begin;

do $$
declare
  v_player uuid;
  v_character uuid;
  v_clan uuid;
  v_raid uuid;
  v_coins bigint;
  v_chest bigint;
  v_claims integer;
  v_notifications integer;
begin
  insert into game.players(telegram_user_id,display_name)
  values(-991004,'clan-raid-reward-test')
  returning id into v_player;

  insert into game.characters(player_id,class_id,current_realm_id,name,hp,hp_max,mp,mp_max,energy,energy_max)
  values(v_player,'warrior','ashen-frontier','Raid Hero',140,140,70,70,100,100)
  returning id into v_character;

  insert into game.character_stats(character_id,physical_attack,magic_attack,defense,magic_resistance,speed)
  values(v_character,16,5,14,8,90);

  insert into game.clans(name,tag,description)
  values('Raid Reward Test Clan','RRT','Regression clan')
  returning id into v_clan;

  insert into game.clan_raids(clan_id,boss_id,boss_hp_max,boss_hp_remaining,starts_at,ends_at,status,rewards)
  values(v_clan,'warden_of_ashes',1000,1,now()-interval '1 hour',now()+interval '1 hour','active','{"clan_coins":300,"chest":"clan"}'::jsonb)
  returning id into v_raid;

  insert into game.clan_raid_contributions(raid_id,player_id,damage,attempts)
  values(v_raid,v_player,1000,1);

  update game.clan_raids set boss_hp_remaining=0,status='defeated' where id=v_raid;

  select amount into v_coins from game.resources where character_id=v_character and resource_code='clan_coins';
  select amount into v_chest from game.resources where character_id=v_character and resource_code='chest_clan';
  select count(*) into v_claims from game.clan_raid_reward_claims where raid_id=v_raid and player_id=v_player;
  select count(*) into v_notifications from game.player_notifications where player_id=v_player and dedupe_key='clan-raid:'||v_raid||':'||v_player;

  if coalesce(v_coins,0)<>300 then raise exception 'expected 300 clan coins, got %',coalesce(v_coins,0); end if;
  if coalesce(v_chest,0)<>1 then raise exception 'expected 1 clan chest, got %',coalesce(v_chest,0); end if;
  if v_claims<>1 then raise exception 'expected one raid reward claim, got %',v_claims; end if;
  if v_notifications<>1 then raise exception 'expected one raid reward notification, got %',v_notifications; end if;

  -- Rewriting defeated status must not duplicate rewards.
  update game.clan_raids set status='defeated' where id=v_raid;
  select amount into v_coins from game.resources where character_id=v_character and resource_code='clan_coins';
  select count(*) into v_claims from game.clan_raid_reward_claims where raid_id=v_raid and player_id=v_player;
  if v_coins<>300 or v_claims<>1 then raise exception 'raid reward duplicated on repeated status update'; end if;
end $$;

rollback;
