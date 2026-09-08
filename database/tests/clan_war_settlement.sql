begin;

do $$
declare
  v_a uuid;
  v_b uuid;
  v_war uuid;
  v_xp_a bigint;
  v_xp_b bigint;
  v_coins_a bigint;
  v_coins_b bigint;
  v_settlements integer;
  v_winner uuid;
begin
  insert into game.clans(name,tag,description) values('Settlement Alpha','SAA','war settlement test') returning id into v_a;
  insert into game.clans(name,tag,description) values('Settlement Beta','SBB','war settlement test') returning id into v_b;

  insert into game.clan_wars(season_id,clan_a,clan_b,score_a,score_b,starts_at,ends_at,status)
  values('test',v_a,v_b,125,70,now()-interval '13 hours',now()-interval '1 hour','active') returning id into v_war;

  perform game.settle_clan_war(v_war);
  perform game.settle_clan_war(v_war);

  select experience into v_xp_a from game.clans where id=v_a;
  select experience into v_xp_b from game.clans where id=v_b;
  select amount into v_coins_a from game.clan_treasury where clan_id=v_a and resource_code='clan_coins';
  select amount into v_coins_b from game.clan_treasury where clan_id=v_b and resource_code='clan_coins';
  select count(*) into v_settlements from game.clan_war_settlements where war_id=v_war;
  select winner_clan_id into v_winner from game.clan_wars where id=v_war and status='finished' and finalized_at is not null;

  if v_winner<>v_a then raise exception 'wrong clan war winner'; end if;
  if v_xp_a<>500 or v_xp_b<>200 then raise exception 'unexpected clan xp rewards: % / %',v_xp_a,v_xp_b; end if;
  if v_coins_a<>250 or v_coins_b<>100 then raise exception 'unexpected clan coin rewards: % / %',v_coins_a,v_coins_b; end if;
  if v_settlements<>2 then raise exception 'settlement should create exactly two rows, got %',v_settlements; end if;
end $$;

rollback;
