begin;

do $$
declare
  v_player uuid;
  v_count integer;
begin
  insert into game.players(telegram_user_id,display_name)
  values(-991001,'notification-dedupe-test')
  returning id into v_player;

  insert into game.player_notifications(player_id,kind,payload,dedupe_key)
  values(v_player,'test','{}'::jsonb,'test:worker:dedupe')
  on conflict do nothing;

  insert into game.player_notifications(player_id,kind,payload,dedupe_key)
  values(v_player,'test','{}'::jsonb,'test:worker:dedupe')
  on conflict do nothing;

  select count(*) into v_count
  from game.player_notifications
  where player_id=v_player and dedupe_key='test:worker:dedupe';

  if v_count <> 1 then
    raise exception 'notification dedupe failed: expected 1 row, got %',v_count;
  end if;
end $$;

rollback;
