begin;

-- Character progression inspired by the richer Nexus Realms web progression panel.
-- We store only allocated points; class identity stays data-driven in a separate profile.
create table if not exists game.class_attribute_profiles (
  class_id text primary key references game.classes(id) on delete cascade,
  strength integer not null default 5 check (strength >= 0),
  vitality integer not null default 5 check (vitality >= 0),
  agility integer not null default 5 check (agility >= 0),
  intelligence integer not null default 5 check (intelligence >= 0),
  luck integer not null default 5 check (luck >= 0)
);

insert into game.class_attribute_profiles(class_id,strength,vitality,agility,intelligence,luck) values
 ('warrior',10,9,5,3,4),
 ('mage',4,5,6,10,5),
 ('archer',6,6,10,5,6),
 ('assassin',8,5,10,4,6)
on conflict(class_id) do update set
 strength=excluded.strength,vitality=excluded.vitality,agility=excluded.agility,intelligence=excluded.intelligence,luck=excluded.luck;

create table if not exists game.character_progression (
  character_id uuid primary key references game.characters(id) on delete cascade,
  tactic text not null default 'smart' check (tactic in ('smart','balanced','aggressive','defensive')),
  strength_allocated integer not null default 0 check (strength_allocated >= 0),
  vitality_allocated integer not null default 0 check (vitality_allocated >= 0),
  agility_allocated integer not null default 0 check (agility_allocated >= 0),
  intelligence_allocated integer not null default 0 check (intelligence_allocated >= 0),
  luck_allocated integer not null default 0 check (luck_allocated >= 0),
  updated_at timestamptz not null default now()
);

insert into game.character_progression(character_id)
select id from game.characters
on conflict(character_id) do nothing;

create or replace function game.ensure_character_progression()
returns trigger language plpgsql as $$
begin
  insert into game.character_progression(character_id) values(new.id)
  on conflict(character_id) do nothing;
  return new;
end $$;

drop trigger if exists trg_character_progression_init on game.characters;
create trigger trg_character_progression_init
after insert on game.characters
for each row execute function game.ensure_character_progression();

-- Profession talent trees. Points are global and earned at 2 per player level gained.
create table if not exists game.profession_talent_definitions (
  id text primary key,
  profession_id text not null references game.profession_definitions(id) on delete cascade,
  branch text not null,
  tier integer not null default 1 check (tier > 0),
  position integer not null default 1 check (position > 0),
  name_es text not null,
  name_en text not null,
  description_es text not null,
  description_en text not null,
  required_profession_level integer not null default 1 check (required_profession_level > 0),
  prerequisite_id text references game.profession_talent_definitions(id),
  max_rank integer not null default 5 check (max_rank > 0),
  effect jsonb not null default '{}'::jsonb,
  enabled boolean not null default true
);
create index if not exists profession_talent_profession_idx on game.profession_talent_definitions(profession_id,tier,position);

create table if not exists game.character_profession_talents (
  character_id uuid not null references game.characters(id) on delete cascade,
  talent_id text not null references game.profession_talent_definitions(id) on delete cascade,
  rank integer not null default 1 check (rank > 0),
  updated_at timestamptz not null default now(),
  primary key(character_id,talent_id)
);

-- Three meaningful branches per profession, each with five ranks.
insert into game.profession_talent_definitions
(id,profession_id,branch,tier,position,name_es,name_en,description_es,description_en,required_profession_level,prerequisite_id,max_rank,effect)
select
  p.id||'-discipline',p.id,'fundamentals',1,1,
  'Disciplina de '||p.name_es,p.name_en||' Discipline',
  'Reduce el tiempo de trabajo de esta profesión en un 3% por rango.',
  'Reduces this profession work time by 3% per rank.',
  1,null,5,'{"craft_speed":0.03}'::jsonb
from game.profession_definitions p
on conflict(id) do nothing;

insert into game.profession_talent_definitions
(id,profession_id,branch,tier,position,name_es,name_en,description_es,description_en,required_profession_level,prerequisite_id,max_rank,effect)
select
  p.id||'-economy',p.id,'mastery',2,1,
  'Economía de '||p.name_es,p.name_en||' Economy',
  'Reduce el coste de oro de esta profesión en un 3% por rango.',
  'Reduces this profession gold cost by 3% per rank.',
  5,p.id||'-discipline',5,'{"gold_discount":0.03}'::jsonb
from game.profession_definitions p
on conflict(id) do nothing;

insert into game.profession_talent_definitions
(id,profession_id,branch,tier,position,name_es,name_en,description_es,description_en,required_profession_level,prerequisite_id,max_rank,effect)
select
  p.id||'-mastery',p.id,'mastery',3,1,
  'Maestría de '||p.name_es,p.name_en||' Mastery',
  'Aumenta en un 5% por rango la probabilidad de obtener rendimiento adicional al completar trabajos.',
  'Adds 5% per rank chance to gain an extra output when completing work.',
  15,p.id||'-economy',5,'{"yield_bonus":0.05}'::jsonb
from game.profession_definitions p
on conflict(id) do nothing;

commit;
