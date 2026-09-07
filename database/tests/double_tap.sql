begin;

insert into game.players (id, telegram_user_id, display_name)
values ('50000000-0000-0000-0000-000000000001', 900000010, 'Double Tap Hero');

insert into game.action_receipts (player_id, operation, idempotency_key, response)
values ('50000000-0000-0000-0000-000000000001','reward.claim','same-request','{"granted":100}'::jsonb)
on conflict (player_id, operation, idempotency_key) do nothing;

insert into game.action_receipts (player_id, operation, idempotency_key, response)
values ('50000000-0000-0000-0000-000000000001','reward.claim','same-request','{"granted":999999}'::jsonb)
on conflict (player_id, operation, idempotency_key) do nothing;

do $$
begin
  if (select count(*) <> 1 from game.action_receipts where player_id = '50000000-0000-0000-0000-000000000001' and operation = 'reward.claim' and idempotency_key = 'same-request') then
    raise exception 'idempotency failed: duplicate receipt created';
  end if;
  if (select (response->>'granted')::int <> 100 from game.action_receipts where player_id = '50000000-0000-0000-0000-000000000001' and operation = 'reward.claim' and idempotency_key = 'same-request') then
    raise exception 'idempotency failed: duplicate request overwrote original result';
  end if;
end $$;

rollback;
