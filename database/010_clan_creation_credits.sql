begin;

insert into game.runtime_config(key,value)
values(
  'clan_creation_cost_credits',
  '{"amount":500,"currency":"premium_credits","label_es":"Créditos Premium","label_en":"Premium Credits"}'::jsonb
)
on conflict(key) do update set value=excluded.value,updated_at=now();

create or replace function game.charge_clan_creation_credits()
returns trigger
language plpgsql
as $$
declare
  v_character uuid;
  v_cost integer;
  v_balance bigint;
  v_after bigint;
begin
  if new.role <> 'leader' then
    return new;
  end if;

  select coalesce((value->>'amount')::integer,500)
    into v_cost
    from game.runtime_config
   where key='clan_creation_cost_credits';
  v_cost := coalesce(v_cost,500);

  select id into v_character
    from game.characters
   where player_id=new.player_id
   for update;

  if v_character is null then
    raise exception 'CHARACTER_REQUIRED';
  end if;

  select amount into v_balance
    from game.resources
   where character_id=v_character and resource_code='premium_credits'
   for update;

  v_balance := coalesce(v_balance,0);
  if v_balance < v_cost then
    raise exception 'INSUFFICIENT_CREDITS';
  end if;

  v_after := v_balance-v_cost;
  update game.resources
     set amount=v_after,updated_at=now()
   where character_id=v_character and resource_code='premium_credits';

  insert into game.economy_ledger(player_id,character_id,currency,delta,balance_after,reason,reference_id)
  values(new.player_id,v_character,'premium_credits',-v_cost,v_after,'clan_creation',new.clan_id::text);

  return new;
end $$;

drop trigger if exists trg_charge_clan_creation_credits on game.clan_members;
create trigger trg_charge_clan_creation_credits
before insert on game.clan_members
for each row execute function game.charge_clan_creation_credits();

commit;
