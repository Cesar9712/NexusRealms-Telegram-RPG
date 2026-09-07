begin;

-- 50 craft outputs map directly to real inventory definitions.
insert into game.item_definitions
(id,name_es,name_en,item_type,rarity,min_level,stack_limit,stats,set_id,tradable)
select
  'crafted-'||lpad(gs::text,3,'0'),
  (array['Espada','Armadura','Poción','Runa','Catalizador','Ración','Reliquia'])[1+((gs-1)%7)]||' del Nexo '||gs,
  'Nexus '||(array['Blade','Armor','Potion','Rune','Catalyst','Ration','Relic'])[1+((gs-1)%7)]||' '||gs,
  (array['weapon','armor','consumable','rune','material','consumable','artifact'])[1+((gs-1)%7)],
  (array['common','uncommon','rare','epic','legendary','mythic'])[1+least(5,(gs-1)/9)],
  greatest(1,((gs-1)%50)+1),
  case when ((gs-1)%7) in (2,4,5) then 99 else 1 end,
  jsonb_build_object('power',8+gs*3,'physical_attack',case when gs%7=1 then 3+gs/4 else 0 end,'defense',case when gs%7=2 then 3+gs/5 else 0 end),
  case when gs between 41 and 46 then 'set-ashen-vanguard' when gs between 47 and 50 then 'set-void-oracle' else null end,
  true
from generate_series(1,50) gs
on conflict(id) do nothing;

insert into game.item_sets(id,name_es,name_en,theme,bonuses) values
 ('set-ashen-vanguard','Vanguardia de Ceniza','Ashen Vanguard','ashen-frontier','{"2":{"defense_pct":0.05},"4":{"physical_attack_pct":0.08},"6":{"block_chance":0.08}}'::jsonb),
 ('set-void-oracle','Oráculo del Vacío','Void Oracle','abyss','{"2":{"magic_resistance_pct":0.06},"4":{"magic_attack_pct":0.09},"6":{"crit_damage":0.15}}'::jsonb),
 ('set-frost-hunter','Cazador de Escarcha','Frost Hunter','frostbound','{"2":{"speed_pct":0.05},"4":{"crit_chance":0.05},"6":{"damage_vs_boss":0.10}}'::jsonb),
 ('set-celestial-ward','Custodia Celestial','Celestial Ward','celestial','{"2":{"hp_pct":0.06},"4":{"all_resistance_pct":0.06},"6":{"healing_received":0.10}}'::jsonb)
on conflict(id) do nothing;

-- Build the first bestiary/codex from enemies and bosses without copying proprietary lore.
insert into game.codex_entries(id,category,name_es,name_en,lore_es,lore_en,metadata)
select 'enemy:'||id,'enemy',name_es,name_en,
       'Una criatura registrada por los exploradores del Nexo. Sus patrones y debilidades se revelan al combatirla.',
       'A creature catalogued by Nexus explorers. Its patterns and weaknesses are revealed through combat.',
       jsonb_build_object('realm',realm_id,'family',family,'tier',tier,'visual_key',visual_key)
from game.enemy_definitions
on conflict(id) do nothing;

insert into game.codex_entries(id,category,name_es,name_en,lore_es,lore_en,metadata)
select 'boss:'||id,'boss',name_es,name_en,lore_es,
       'A major threat whose phases transform the battlefield and demand adaptation.',
       jsonb_build_object('realm',realm_id,'boss_type',boss_type,'visual_key',visual_key)
from game.boss_definitions
on conflict(id) do nothing;

insert into game.codex_entries(id,category,name_es,name_en,lore_es,lore_en,metadata)
select 'realm:'||id,'realm',name_es,name_en,
       'Una región conectada al Nexo, con historia, recursos y amenazas propias.',
       'A realm linked to the Nexus, with its own history, resources and threats.',
       jsonb_build_object('min_level',min_level,'theme',visual_theme)
from game.realms
on conflict(id) do nothing;

-- Start rotating event instances. These are gameplay-only and server-timed.
insert into game.event_instances(event_id,starts_at,ends_at,state,status)
select id,
       date_trunc('day',now()) + ((row_number() over(order by id)-1)*interval '2 days'),
       date_trunc('day',now()) + ((row_number() over(order by id)-1)*interval '2 days') + interval '36 hours',
       '{}'::jsonb,
       case when row_number() over(order by id)=1 then 'active' else 'scheduled' end
from game.event_definitions d
where not exists(select 1 from game.event_instances i where i.event_id=d.id and i.ends_at>now());

-- A few starter loot items from combat; drop assignment remains server-authoritative.
insert into game.item_definitions(id,name_es,name_en,item_type,rarity,min_level,stack_limit,stats,tradable) values
 ('loot-ash-blade','Filo de Ceniza','Ash Blade','weapon','uncommon',1,1,'{"physical_attack":5}'::jsonb,true),
 ('loot-rune-cloak','Capa Rúnica','Rune Cloak','cape','rare',4,1,'{"magic_resistance":7,"evasion":0.01}'::jsonb,true),
 ('loot-iron-helm','Yelmo de Hierro','Iron Helm','helmet','rare',12,1,'{"defense":10}'::jsonb,true),
 ('loot-spectral-ring','Anillo Espectral','Spectral Ring','ring','epic',18,1,'{"crit_chance":0.025}'::jsonb,true),
 ('loot-crimson-relic','Reliquia Carmesí','Crimson Relic','artifact','epic',25,1,'{"power":90}'::jsonb,true),
 ('loot-frost-boots','Botas de Escarcha','Frost Boots','boots','legendary',32,1,'{"speed":14,"evasion":0.02}'::jsonb,true),
 ('loot-abyss-amulet','Amuleto Abisal','Abyss Amulet','necklace','legendary',40,1,'{"crit_damage":0.12}'::jsonb,true),
 ('loot-celestial-cape','Capa Celestial','Celestial Cape','cape','mythic',50,1,'{"all_stats_pct":0.04}'::jsonb,false),
 ('loot-chaos-artifact','Artefacto del Caos','Chaos Artifact','artifact','mythic',60,1,'{"power":300,"crit_chance":0.04}'::jsonb,false)
on conflict(id) do nothing;

-- Initial global rankings can be rebuilt by a worker. This view is read-only source logic.
create or replace view game.v_power_ranking as
select p.id player_id,p.display_name,ch.name character_name,ch.level,ch.power,
       dense_rank() over(order by ch.power desc,ch.level desc,ch.created_at asc) rank
from game.players p join game.characters ch on ch.player_id=p.id
where not p.is_banned;

commit;
