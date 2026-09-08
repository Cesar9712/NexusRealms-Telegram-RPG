begin;

alter table game.clan_wars
  add column if not exists winner_clan_id uuid references game.clans(id) on delete set null,
  add column if not exists finalized_at timestamptz;

create table if not exists game.clan_war_settlements (
  war_id uuid not null references game.clan_wars(id) on delete cascade,
  clan_id uuid not null references game.clans(id) on delete cascade,
  outcome text not null check(outcome in ('win','loss','draw')),
  clan_xp bigint not null default 0 check(clan_xp>=0),
  clan_coins bigint not null default 0 check(clan_coins>=0),
  settled_at timestamptz not null default now(),
  primary key(war_id,clan_id)
);

create index if not exists clan_wars_due_idx on game.clan_wars(status,ends_at) where status in ('scheduled','active');
create index if not exists event_instances_due_idx on game.event_instances(status,starts_at,ends_at) where status in ('scheduled','active');

create or replace function game.settle_clan_war(p_war uuid)
returns jsonb
language plpgsql
as $$
declare
  w game.clan_wars%rowtype;
  v_winner uuid;
  v_outcome_a text;
  v_outcome_b text;
  v_xp_a bigint;
  v_xp_b bigint;
  v_coins_a bigint;
  v_coins_b bigint;
  v_inserted integer:=0;
begin
  select * into w from game.clan_wars where id=p_war for update;
  if w.id is null then raise exception 'WAR_NOT_FOUND'; end if;
  if w.ends_at>now() and w.status<>'finished' then raise exception 'WAR_NOT_DUE'; end if;

  if w.score_a>w.score_b then
    v_winner:=w.clan_a;v_outcome_a:='win';v_outcome_b:='loss';
  elsif w.score_b>w.score_a then
    v_winner:=w.clan_b;v_outcome_a:='loss';v_outcome_b:='win';
  else
    v_winner:=null;v_outcome_a:='draw';v_outcome_b:='draw';
  end if;

  v_xp_a:=case v_outcome_a when 'win' then 500 when 'draw' then 300 else 200 end;
  v_xp_b:=case v_outcome_b when 'win' then 500 when 'draw' then 300 else 200 end;
  v_coins_a:=case v_outcome_a when 'win' then 250 when 'draw' then 150 else 100 end;
  v_coins_b:=case v_outcome_b when 'win' then 250 when 'draw' then 150 else 100 end;

  insert into game.clan_war_settlements(war_id,clan_id,outcome,clan_xp,clan_coins)
  values(w.id,w.clan_a,v_outcome_a,v_xp_a,v_coins_a)
  on conflict do nothing;
  get diagnostics v_inserted=row_count;
  if v_inserted>0 then
    update game.clans set experience=experience+v_xp_a where id=w.clan_a;
    insert into game.clan_treasury(clan_id,resource_code,amount) values(w.clan_a,'clan_coins',v_coins_a)
    on conflict(clan_id,resource_code) do update set amount=game.clan_treasury.amount+excluded.amount,updated_at=now();
  end if;

  insert into game.clan_war_settlements(war_id,clan_id,outcome,clan_xp,clan_coins)
  values(w.id,w.clan_b,v_outcome_b,v_xp_b,v_coins_b)
  on conflict do nothing;
  get diagnostics v_inserted=row_count;
  if v_inserted>0 then
    update game.clans set experience=experience+v_xp_b where id=w.clan_b;
    insert into game.clan_treasury(clan_id,resource_code,amount) values(w.clan_b,'clan_coins',v_coins_b)
    on conflict(clan_id,resource_code) do update set amount=game.clan_treasury.amount+excluded.amount,updated_at=now();
  end if;

  update game.clan_wars set status='finished',winner_clan_id=v_winner,finalized_at=coalesce(finalized_at,now()) where id=w.id;

  return jsonb_build_object('warId',w.id,'winnerClanId',v_winner,'scoreA',w.score_a,'scoreB',w.score_b,'outcomeA',v_outcome_a,'outcomeB',v_outcome_b);
end $$;

commit;
