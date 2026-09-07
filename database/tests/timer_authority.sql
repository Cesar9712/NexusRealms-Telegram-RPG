begin;

do $$
declare
  anchor timestamptz := now();
  same_value integer;
  server_future integer;
begin
  -- A client clock is never accepted by the regeneration API. The only clock
  -- input here represents a server-owned timestamp used for deterministic tests.
  select game.regenerated_value(10,100,anchor,180,anchor) into same_value;
  if same_value <> 10 then raise exception 'Value changed without server time advancing: %',same_value; end if;

  select game.regenerated_value(10,100,anchor,180,anchor + interval '9 minutes') into server_future;
  if server_future <> 13 then raise exception 'Expected 3 server-authoritative points, got %',server_future; end if;
end $$;

rollback;
