begin;

create table if not exists game.clan_raid_reward_claims (
  raid_id uuid not null references game.clan_raids(id) on delete cascade,
  player_id uuid not null references game.players(id) on delete cascade,
  clan_coins bigint not null default 0 check(clan_coins>=0),
  chest_code text,
  claimed_at timestamptz not null default now(),
  primary key(raid_id,player_id)
);

create or replace function game.distribute_clan_raid_rewards()
returns trigger
language plpgsql
as $$
declare
  v_total_damage bigint;
  v_total_coins bigint;
  v_chest text;
  v_coins bigint;
  v_character uuid;
  rec record;
begin
  if new.status<>'defeated' or old.status='defeated' then return new; end if;

  select coalesce(sum(damage),0) into v_total_damage
    from game.clan_raid_contributions where raid_id=new.id and damage>0;
  if v_total_damage<=0 then return new; end if;

  v_total_coins:=greatest(0,coalesce((new.rewards->>'clan_coins')::bigint,0));
  v_chest:=nullif(new.rewards->>'chest','');

  for rec in
    select c.player_id,c.damage,ch.id character_id
      from game.clan_raid_contributions c
      join game.characters ch on ch.player_id=c.player_id
     where c.raid_id=new.id and c.damage>0
  loop
    v_coins:=case when v_total_coins>0 then greatest(1,floor(v_total_coins*rec.damage::numeric/v_total_damage)::bigint) else 0 end;
    v_character:=rec.character_id;

    insert into game.clan_raid_reward_claims(raid_id,player_id,clan_coins,chest_code)
    values(new.id,rec.player_id,v_coins,v_chest)
    on conflict do nothing;

    if found then
      if v_coins>0 then
        insert into game.resources(character_id,resource_code,amount)
        values(v_character,'clan_coins',v_coins)
        on conflict(character_id,resource_code) do update
          set amount=game.resources.amount+excluded.amount,updated_at=now();
      end if;

      if v_chest is not null then
        insert into game.resources(character_id,resource_code,amount)
        values(v_character,'chest_'||regexp_replace(lower(v_chest),'[^a-z0-9_-]','','g'),1)
        on conflict(character_id,resource_code) do update
          set amount=game.resources.amount+1,updated_at=now();
      end if;

      perform game.add_battle_pass_xp(rec.player_id,30);
      perform game.progress_achievement_metric(v_character,'boss_kills',1);

      insert into game.player_notifications(player_id,kind,payload,dedupe_key)
      values(rec.player_id,'clan_raid_reward',jsonb_build_object('raidId',new.id,'clanCoins',v_coins,'chest',v_chest),'clan-raid:'||new.id||':'||rec.player_id)
      on conflict do nothing;
    end if;
  end loop;

  return new;
end $$;

drop trigger if exists trg_distribute_clan_raid_rewards on game.clan_raids;
create trigger trg_distribute_clan_raid_rewards
after update of status on game.clan_raids
for each row execute function game.distribute_clan_raid_rewards();

commit;
