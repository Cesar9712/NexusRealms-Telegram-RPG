begin;

-- A character cannot create several simultaneous combat sessions to spend/reward concurrently.
with ranked as (
  select id,row_number() over(partition by character_id order by started_at desc,id desc) rn
  from game.combat_sessions where state='active'
)
update game.combat_sessions s
set state='abandoned',finished_at=now(),updated_at=now()
from ranked r where s.id=r.id and r.rn>1;

create unique index if not exists combat_one_active_per_character_idx
on game.combat_sessions(character_id) where state='active';

-- Combat events are ordered constantly by the client.
create index if not exists combat_event_type_idx on game.combat_events(combat_id,event_type,id);

commit;
