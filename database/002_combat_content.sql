begin;

create table if not exists game.skill_definitions (
  id text primary key,
  class_id text not null references game.classes(id),
  name_es text not null,
  name_en text not null,
  unlock_level integer not null default 1 check (unlock_level > 0),
  mp_cost integer not null default 0 check (mp_cost >= 0),
  cooldown_turns integer not null default 0 check (cooldown_turns >= 0),
  power_ratio numeric(8,3) not null default 1.0,
  damage_type text not null default 'physical',
  target_type text not null default 'enemy',
  effects jsonb not null default '[]'::jsonb,
  enabled boolean not null default true
);
create index if not exists skills_class_level_idx on game.skill_definitions(class_id, unlock_level);

create table if not exists game.enemy_definitions (
  id text primary key,
  realm_id text not null references game.realms(id),
  name_es text not null,
  name_en text not null,
  family text not null,
  level integer not null check (level > 0),
  tier text not null default 'normal',
  max_hp integer not null check (max_hp > 0),
  attack integer not null check (attack >= 0),
  defense integer not null check (defense >= 0),
  magic_resistance integer not null check (magic_resistance >= 0),
  speed integer not null default 100 check (speed > 0),
  abilities jsonb not null default '[]'::jsonb,
  loot_table jsonb not null default '[]'::jsonb,
  visual_key text not null,
  enabled boolean not null default true
);
create index if not exists enemies_realm_level_idx on game.enemy_definitions(realm_id, level, tier);

create table if not exists game.boss_definitions (
  id text primary key,
  realm_id text not null references game.realms(id),
  name_es text not null,
  name_en text not null,
  boss_type text not null,
  level integer not null check (level > 0),
  max_hp integer not null check (max_hp > 0),
  attack integer not null check (attack >= 0),
  defense integer not null check (defense >= 0),
  magic_resistance integer not null check (magic_resistance >= 0),
  phases jsonb not null default '[]'::jsonb,
  loot_table jsonb not null default '[]'::jsonb,
  lore_es text not null default '',
  visual_key text not null,
  enabled boolean not null default true
);
create index if not exists bosses_realm_level_idx on game.boss_definitions(realm_id, level);

create table if not exists game.combat_sessions (
  id uuid primary key default gen_random_uuid(),
  character_id uuid not null references game.characters(id) on delete cascade,
  enemy_id text references game.enemy_definitions(id),
  boss_id text references game.boss_definitions(id),
  state text not null default 'active',
  turn_number integer not null default 1,
  player_hp integer not null,
  player_mp integer not null,
  enemy_hp integer not null,
  player_effects jsonb not null default '[]'::jsonb,
  enemy_effects jsonb not null default '[]'::jsonb,
  cooldowns jsonb not null default '{}'::jsonb,
  rng_nonce bigint not null default 0,
  started_at timestamptz not null default now(),
  finished_at timestamptz,
  updated_at timestamptz not null default now(),
  check ((enemy_id is not null)::int + (boss_id is not null)::int = 1)
);
create index if not exists combat_active_character_idx on game.combat_sessions(character_id, state, updated_at desc);

create table if not exists game.combat_events (
  id bigserial primary key,
  combat_id uuid not null references game.combat_sessions(id) on delete cascade,
  turn_number integer not null,
  actor text not null,
  event_type text not null,
  payload jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);
create index if not exists combat_events_combat_idx on game.combat_events(combat_id, id);

insert into game.skill_definitions (id,class_id,name_es,name_en,unlock_level,mp_cost,cooldown_turns,power_ratio,damage_type,target_type,effects) values
('warrior_cleave','warrior','Tajo del Bastión','Bastion Cleave',1,8,1,1.25,'physical','enemy','[]'),
('warrior_guard','warrior','Guardia de Hierro','Iron Guard',2,10,3,0,'utility','self','[{"type":"shield","value":18,"turns":2}]'),
('warrior_breaker','warrior','Quebrarmuros','Wallbreaker',4,14,2,1.55,'physical','enemy','[{"type":"defense_down","value":0.15,"turns":2}]'),
('warrior_rally','warrior','Grito del Nexo','Nexus Rally',6,18,4,0,'utility','self','[{"type":"attack_up","value":0.18,"turns":3}]'),
('warrior_execution','warrior','Sentencia Carmesí','Crimson Verdict',9,22,3,2.05,'physical','enemy','[{"type":"execute_bonus","threshold":0.30,"value":0.35}]'),
('warrior_aegis','warrior','Égida Ancestral','Ancestral Aegis',12,26,5,0,'utility','self','[{"type":"shield","value":42,"turns":3},{"type":"block_up","value":0.20,"turns":3}]'),
('warrior_bleed','warrior','Filo Sangrante','Bloodedge',15,24,3,1.35,'physical','enemy','[{"type":"bleed","power":0.18,"turns":3}]'),
('warrior_ultimate','warrior','Cataclismo del Guardián','Guardian Cataclysm',20,40,6,3.1,'physical','enemy','[{"type":"stun","chance":0.45,"turns":1}]'),
('mage_bolt','mage','Descarga Arcana','Arcane Bolt',1,9,1,1.35,'magic','enemy','[]'),
('mage_frost','mage','Prisión de Escarcha','Frost Prison',2,12,2,1.05,'magic','enemy','[{"type":"freeze","chance":0.35,"turns":1}]'),
('mage_burn','mage','Marca Ígnea','Ember Mark',4,14,2,1.15,'magic','enemy','[{"type":"burn","power":0.20,"turns":3}]'),
('mage_barrier','mage','Barrera Astral','Astral Barrier',6,18,4,0,'utility','self','[{"type":"shield","value":30,"turns":2}]'),
('mage_void','mage','Pulso del Vacío','Void Pulse',9,21,3,1.8,'magic','enemy','[{"type":"silence","chance":0.30,"turns":1}]'),
('mage_chain','mage','Cadena Celeste','Celestial Chain',12,24,3,2.0,'magic','enemy','[{"type":"magic_resist_down","value":0.18,"turns":2}]'),
('mage_rewind','mage','Eco Temporal','Temporal Echo',15,28,5,1.45,'magic','enemy','[{"type":"cooldown_shift","value":-1}]'),
('mage_ultimate','mage','Nova del Nexo','Nexus Nova',20,44,6,3.35,'magic','enemy','[{"type":"burn","power":0.25,"turns":3}]'),
('archer_shot','archer','Disparo Certero','True Shot',1,7,1,1.3,'physical','enemy','[]'),
('archer_pierce','archer','Flecha Perforante','Piercing Arrow',2,10,2,1.45,'physical','enemy','[{"type":"penetration_bonus","value":0.20}]'),
('archer_poison','archer','Punta Venenosa','Venom Tip',4,12,2,1.1,'physical','enemy','[{"type":"poison","power":0.17,"turns":4}]'),
('archer_evasion','archer','Paso del Halcón','Hawkstep',6,15,4,0,'utility','self','[{"type":"evasion_up","value":0.24,"turns":2}]'),
('archer_volley','archer','Lluvia de Acero','Steel Rain',9,19,3,1.85,'physical','enemy','[]'),
('archer_mark','archer','Marca del Cazador','Hunter Mark',12,20,4,0.8,'physical','enemy','[{"type":"damage_taken_up","value":0.20,"turns":3}]'),
('archer_ricochet','archer','Rebote Rúnico','Runic Ricochet',15,23,3,2.15,'physical','enemy','[]'),
('archer_ultimate','archer','Cometa Dorado','Golden Comet',20,38,6,3.2,'physical','enemy','[{"type":"crit_bonus","value":0.35}]'),
('assassin_slash','assassin','Corte Umbrío','Shadow Slash',1,7,1,1.35,'physical','enemy','[]'),
('assassin_bleed','assassin','Herida Abierta','Open Wound',2,10,2,1.15,'physical','enemy','[{"type":"bleed","power":0.20,"turns":3}]'),
('assassin_smoke','assassin','Velo de Humo','Smoke Veil',4,13,4,0,'utility','self','[{"type":"evasion_up","value":0.30,"turns":2}]'),
('assassin_combo','assassin','Cadena de Sombras','Shadow Chain',6,16,2,1.7,'physical','enemy','[{"type":"combo","bonus":0.12}]'),
('assassin_silence','assassin','Sello Mudo','Mute Seal',9,19,3,1.45,'physical','enemy','[{"type":"silence","chance":0.35,"turns":1}]'),
('assassin_execute','assassin','Último Susurro','Last Whisper',12,22,3,2.2,'physical','enemy','[{"type":"execute_bonus","threshold":0.35,"value":0.45}]'),
('assassin_night','assassin','Danza Nocturna','Night Dance',15,26,4,2.35,'physical','enemy','[{"type":"crit_bonus","value":0.25}]'),
('assassin_ultimate','assassin','Eclipse de Sangre','Blood Eclipse',20,40,6,3.4,'physical','enemy','[{"type":"bleed","power":0.30,"turns":3}]')
on conflict (id) do update set effects=excluded.effects, power_ratio=excluded.power_ratio;

insert into game.enemy_definitions (id,realm_id,name_es,name_en,family,level,tier,max_hp,attack,defense,magic_resistance,speed,abilities,loot_table,visual_key) values
('ash_wolf','ashen-frontier','Lobo de Ceniza','Ash Wolf','beast',1,'normal',62,9,3,2,112,'[{"type":"basic"}]','[{"resource":"gold","min":6,"max":12}]','enemy/ash_wolf'),
('rune_rat','ashen-frontier','Rata Rúnica','Rune Rat','beast',1,'normal',48,7,2,4,124,'[{"type":"basic"}]','[{"resource":"gold","min":4,"max":9}]','enemy/rune_rat'),
('ruin_bandit','ashen-frontier','Saqueador de Ruinas','Ruin Bandit','bandit',2,'normal',78,11,5,3,101,'[{"type":"basic"},{"type":"bleed","chance":0.18}]','[{"resource":"gold","min":8,"max":16}]','enemy/ruin_bandit'),
('thorn_boar','ashen-frontier','Jabalí Espinoso','Thorn Boar','beast',2,'normal',92,12,7,2,86,'[{"type":"charge","ratio":1.25}]','[{"resource":"gold","min":9,"max":17}]','enemy/thorn_boar'),
('ember_imp','ashen-frontier','Diablillo de Brasa','Ember Imp','demon',3,'normal',70,13,3,7,108,'[{"type":"burn","chance":0.22}]','[{"resource":"gold","min":10,"max":19}]','enemy/ember_imp'),
('fallen_scout','ashen-frontier','Explorador Caído','Fallen Scout','undead',3,'normal',84,12,5,6,103,'[{"type":"basic"}]','[{"resource":"gold","min":10,"max":20}]','enemy/fallen_scout'),
('moss_golem','ashen-frontier','Gólem de Musgo','Moss Golem','elemental',4,'elite',138,15,12,7,72,'[{"type":"guard","chance":0.25}]','[{"resource":"gold","min":18,"max":30}]','enemy/moss_golem'),
('arcane_wisp','ashen-frontier','Fuego Fatuo Arcano','Arcane Wisp','magical',4,'normal',76,16,3,12,120,'[{"type":"magic","ratio":1.15}]','[{"resource":"crystals","min":0,"max":1}]','enemy/arcane_wisp'),
('grave_hound','ashen-frontier','Sabueso de Tumba','Grave Hound','undead',5,'elite',150,17,8,6,116,'[{"type":"bleed","chance":0.28}]','[{"resource":"gold","min":20,"max":35}]','enemy/grave_hound'),
('nexus_marauder','ashen-frontier','Merodeador del Nexo','Nexus Marauder','bandit',5,'elite',165,18,9,8,104,'[{"type":"breaker","ratio":1.30}]','[{"resource":"gold","min":22,"max":38}]','enemy/nexus_marauder'),
('corrupt_dryad','cursed-grove','Dríada Corrupta','Corrupted Dryad','magical',6,'normal',155,19,8,13,105,'[{"type":"poison","chance":0.25}]','[{"resource":"gold","min":20,"max":34}]','enemy/corrupt_dryad'),
('moon_spider','cursed-grove','Araña Lunar','Moon Spider','beast',6,'normal',128,18,7,9,132,'[{"type":"poison","chance":0.30}]','[{"resource":"gold","min":18,"max":32}]','enemy/moon_spider'),
('hollow_stag','cursed-grove','Ciervo Hueco','Hollow Stag','undead',7,'normal',176,21,10,10,114,'[{"type":"charge","ratio":1.3}]','[{"resource":"gold","min":24,"max":40}]','enemy/hollow_stag'),
('root_revenant','cursed-grove','Retornado de Raíz','Root Revenant','undead',7,'elite',235,23,15,13,76,'[{"type":"regen","chance":0.22}]','[{"resource":"gold","min":32,"max":50}]','enemy/root_revenant'),
('violet_fang','cursed-grove','Colmillo Violeta','Violet Fang','beast',8,'normal',188,24,10,9,138,'[{"type":"bleed","chance":0.30}]','[{"resource":"gold","min":25,"max":43}]','enemy/violet_fang'),
('hex_shaman','cursed-grove','Chamán del Hex','Hex Shaman','goblin',8,'elite',212,25,8,18,102,'[{"type":"curse","chance":0.25},{"type":"heal","threshold":0.35}]','[{"resource":"crystals","min":0,"max":2}]','enemy/hex_shaman'),
('fungal_brute','cursed-grove','Bruto Fúngico','Fungal Brute','monster',9,'normal',245,26,17,8,71,'[{"type":"poison","chance":0.20}]','[{"resource":"gold","min":29,"max":49}]','enemy/fungal_brute'),
('shade_harpy','cursed-grove','Arpía Umbría','Shade Harpy','magical',9,'elite',218,28,9,14,142,'[{"type":"evasion","chance":0.18}]','[{"resource":"gold","min":34,"max":55}]','enemy/shade_harpy'),
('grove_keeper','cursed-grove','Custodio Marchito','Withered Keeper','elemental',10,'elite',285,30,20,18,82,'[{"type":"guard","chance":0.28}]','[{"resource":"gold","min":40,"max":65}]','enemy/grove_keeper'),
('bloodcap_goblin','cursed-grove','Goblin Sombrero Rojo','Bloodcap Goblin','goblin',10,'normal',210,29,12,10,120,'[{"type":"basic"}]','[{"resource":"gold","min":30,"max":52}]','enemy/bloodcap_goblin'),
('iron_orc','ironpeaks','Orco de Hierro','Iron Orc','orc',12,'normal',320,35,22,12,88,'[{"type":"breaker","ratio":1.25}]','[{"resource":"gold","min":45,"max":70}]','enemy/iron_orc'),
('slag_hound','ironpeaks','Sabueso de Escoria','Slag Hound','beast',12,'normal',270,34,15,13,125,'[{"type":"burn","chance":0.22}]','[{"resource":"gold","min":42,"max":68}]','enemy/slag_hound'),
('forge_goblin','ironpeaks','Goblin Forjador','Forge Goblin','goblin',13,'normal',280,36,16,14,115,'[{"type":"basic"}]','[{"resource":"gold","min":45,"max":72}]','enemy/forge_goblin'),
('basalt_golem','ironpeaks','Gólem de Basalto','Basalt Golem','elemental',13,'elite',420,39,30,20,63,'[{"type":"guard","chance":0.33}]','[{"resource":"gold","min":60,"max":90}]','enemy/basalt_golem'),
('mine_wyrm','ironpeaks','Sierpe de Mina','Mine Wyrm','monster',14,'elite',390,42,22,19,104,'[{"type":"bleed","chance":0.24}]','[{"resource":"crystals","min":1,"max":3}]','enemy/mine_wyrm'),
('spectral_leech','spectral-marsh','Sanguijuela Espectral','Spectral Leech','monster',18,'normal',410,48,20,28,96,'[{"type":"lifesteal","ratio":0.25}]','[{"resource":"gold","min":70,"max":105}]','enemy/spectral_leech'),
('bog_witch','spectral-marsh','Bruja del Fango','Bog Witch','undead',18,'elite',450,52,19,34,105,'[{"type":"curse","chance":0.30},{"type":"heal","threshold":0.30}]','[{"resource":"crystals","min":1,"max":3}]','enemy/bog_witch'),
('bone_croc','spectral-marsh','Cocodrilo Óseo','Bone Crocodile','undead',19,'normal',520,53,31,21,81,'[{"type":"bleed","chance":0.27}]','[{"resource":"gold","min":78,"max":115}]','enemy/bone_croc'),
('mist_specter','spectral-marsh','Espectro de Niebla','Mist Specter','undead',20,'elite',470,57,18,38,130,'[{"type":"evasion","chance":0.22},{"type":"silence","chance":0.18}]','[{"resource":"gold","min":88,"max":125}]','enemy/mist_specter'),
('venom_toad','spectral-marsh','Sapo Venenoso','Venom Toad','beast',20,'normal',485,55,27,22,78,'[{"type":"poison","chance":0.34}]','[{"resource":"gold","min":82,"max":120}]','enemy/venom_toad'),
('scarab_guard','crimson-wastes','Guardián Escarabajo','Scarab Guard','monster',25,'normal',650,68,42,31,82,'[{"type":"guard","chance":0.28}]','[{"resource":"gold","min":115,"max":165}]','enemy/scarab_guard'),
('dune_reaver','crimson-wastes','Segador de Dunas','Dune Reaver','bandit',25,'elite',620,73,35,28,116,'[{"type":"breaker","ratio":1.35}]','[{"resource":"gold","min":125,"max":180}]','enemy/dune_reaver'),
('sun_cultist','crimson-wastes','Cultista Solar','Sun Cultist','magical',26,'normal',590,72,29,44,104,'[{"type":"burn","chance":0.32}]','[{"resource":"crystals","min":1,"max":4}]','enemy/sun_cultist'),
('red_sphinxling','crimson-wastes','Cría de Esfinge Roja','Red Sphinxling','magical',27,'elite',720,78,40,45,122,'[{"type":"silence","chance":0.25}]','[{"resource":"gold","min":140,"max":200}]','enemy/red_sphinxling'),
('sand_colossus','crimson-wastes','Coloso de Arena','Sand Colossus','elemental',28,'elite',840,82,58,39,59,'[{"type":"stun","chance":0.22}]','[{"resource":"gold","min":160,"max":225}]','enemy/sand_colossus'),
('frost_wolf','frostbound','Lobo de Escarcha','Frost Wolf','beast',32,'normal',810,88,47,44,134,'[{"type":"freeze","chance":0.22}]','[{"resource":"gold","min":190,"max":250}]','enemy/frost_wolf'),
('ice_wraith','frostbound','Ánima de Hielo','Ice Wraith','undead',33,'elite',850,93,38,61,121,'[{"type":"freeze","chance":0.30}]','[{"resource":"crystals","min":2,"max":5}]','enemy/ice_wraith'),
('glacier_giant','frostbound','Gigante Glaciar','Glacier Giant','monster',34,'elite',1120,99,72,48,52,'[{"type":"stun","chance":0.28}]','[{"resource":"gold","min":230,"max":310}]','enemy/glacier_giant'),
('rime_shaman','frostbound','Chamán de Cencellada','Rime Shaman','magical',35,'elite',920,102,45,69,97,'[{"type":"freeze","chance":0.25},{"type":"heal","threshold":0.32}]','[{"resource":"crystals","min":2,"max":6}]','enemy/rime_shaman'),
('abyss_hound','abyss','Sabueso Abisal','Abyss Hound','demon',40,'normal',1180,118,61,57,132,'[{"type":"bleed","chance":0.31}]','[{"resource":"gold","min":300,"max":390}]','enemy/abyss_hound'),
('void_acolyte','abyss','Acólito del Vacío','Void Acolyte','demon',41,'elite',1200,123,54,77,108,'[{"type":"silence","chance":0.30},{"type":"curse","chance":0.25}]','[{"resource":"crystals","min":3,"max":7}]','enemy/void_acolyte'),
('hellforged_orc','abyss','Orco Forjado en Infierno','Hellforged Orc','orc',42,'elite',1460,132,88,62,79,'[{"type":"burn","chance":0.28},{"type":"breaker","ratio":1.35}]','[{"resource":"gold","min":350,"max":460}]','enemy/hellforged_orc'),
('chaos_spawn','abyss','Engendro del Caos','Chaos Spawn','monster',43,'elite',1520,138,76,75,99,'[{"type":"random_status"}]','[{"resource":"gold","min":380,"max":500}]','enemy/chaos_spawn'),
('seraph_guard','celestial','Guardia Seráfico','Seraph Guard','magical',50,'normal',1800,156,100,105,108,'[{"type":"guard","chance":0.34}]','[{"resource":"gold","min":500,"max":650}]','enemy/seraph_guard'),
('arcane_cherub','celestial','Querubín Arcano','Arcane Cherub','magical',51,'elite',1700,163,82,128,127,'[{"type":"magic","ratio":1.35},{"type":"heal","threshold":0.28}]','[{"resource":"crystals","min":4,"max":9}]','enemy/arcane_cherub'),
('sky_lancer','celestial','Lancero Celeste','Sky Lancer','magical',52,'elite',1960,172,110,98,141,'[{"type":"penetration","ratio":1.25}]','[{"resource":"gold","min":560,"max":720}]','enemy/sky_lancer'),
('void_mimic','chaos','Mímico del Vacío','Void Mimic','monster',60,'elite',2600,220,130,130,118,'[{"type":"random_status"},{"type":"lifesteal","ratio":0.20}]','[{"resource":"crystals","min":6,"max":12}]','enemy/void_mimic'),
('prism_revenant','chaos','Retornado Prismático','Prismatic Revenant','undead',61,'elite',2750,228,140,150,126,'[{"type":"random_status"}]','[{"resource":"gold","min":800,"max":1050}]','enemy/prism_revenant'),
('rift_tyrant','chaos','Tirano de la Grieta','Rift Tyrant','demon',62,'elite',3050,240,165,145,103,'[{"type":"breaker","ratio":1.45},{"type":"stun","chance":0.26}]','[{"resource":"gold","min":900,"max":1180}]','enemy/rift_tyrant'),
('entropy_beast','chaos','Bestia de Entropía','Entropy Beast','monster',64,'elite',3400,255,170,160,137,'[{"type":"random_status"},{"type":"regen","chance":0.20}]','[{"resource":"crystals","min":8,"max":14}]','enemy/entropy_beast'),
('nexus_devourer','chaos','Devorador del Nexo','Nexus Devourer','demon',66,'elite',3800,270,185,180,122,'[{"type":"silence","chance":0.30},{"type":"lifesteal","ratio":0.25}]','[{"resource":"gold","min":1100,"max":1450}]','enemy/nexus_devourer')
on conflict (id) do update set max_hp=excluded.max_hp, abilities=excluded.abilities, loot_table=excluded.loot_table;

insert into game.boss_definitions (id,realm_id,name_es,name_en,boss_type,level,max_hp,attack,defense,magic_resistance,phases,loot_table,lore_es,visual_key) values
('warden_kael','ashen-frontier','Kael, Guardián Quebrado','Kael, the Broken Warden','dungeon',5,1250,28,18,16,'[{"at":1.0,"skills":["cleave"]},{"at":0.5,"skills":["cleave","rune_burst"]}]','[{"resource":"gold","min":90,"max":140},{"resource":"crystals","min":2,"max":4}]','Un antiguo protector del Nexo consumido por su propio juramento.','boss/warden_kael'),
('mother_thorn','cursed-grove','Madre Espina','Mother Thorn','world',10,2600,46,28,34,'[{"at":1.0,"skills":["poison_bloom"]},{"at":0.65,"skills":["root_prison"]},{"at":0.3,"skills":["blood_moon_bloom"]}]','[{"resource":"gold","min":180,"max":260},{"resource":"crystals","min":4,"max":7}]','La conciencia más antigua del bosque, ahora infectada por una semilla violeta.','boss/mother_thorn'),
('iron_king_vorg','ironpeaks','Vorg, Rey de Hierro','Vorg, Iron King','clan',16,5200,72,52,35,'[{"at":1.0,"skills":["hammer"]},{"at":0.55,"skills":["molten_armor"]},{"at":0.25,"skills":["forgequake"]}]','[{"resource":"gold","min":320,"max":470},{"resource":"crystals","min":6,"max":10}]','Señor de las forjas orcas y dueño de la corona fundida.','boss/iron_king_vorg'),
('mire_queen','spectral-marsh','Reina de la Bruma','Mire Queen','dungeon',22,7600,94,54,72,'[{"at":1.0,"skills":["venom_wave"]},{"at":0.6,"skills":["spectral_call"]},{"at":0.25,"skills":["drown_soul"]}]','[{"resource":"gold","min":500,"max":720},{"resource":"crystals","min":8,"max":13}]','Una soberana muerta cuyo reino continúa obedeciendo susurros.','boss/mire_queen'),
('sun_eater','crimson-wastes','Devorasol','Sun Eater','world',30,10800,122,78,82,'[{"at":1.0,"skills":["solar_bite"]},{"at":0.66,"skills":["sandstorm"]},{"at":0.33,"skills":["eclipse"]}]','[{"resource":"gold","min":720,"max":980},{"resource":"crystals","min":10,"max":16}]','Una criatura enterrada antes del primer imperio del desierto.','boss/sun_eater'),
('ymer_frostfather','frostbound','Ymer, Padre de Escarcha','Ymer, Frostfather','dungeon',38,14800,150,110,96,'[{"at":1.0,"skills":["ice_maul"]},{"at":0.7,"skills":["whiteout"]},{"at":0.35,"skills":["absolute_zero"]}]','[{"resource":"gold","min":900,"max":1250},{"resource":"crystals","min":13,"max":20}]','El primer gigante despertó cuando el hielo recordó su nombre.','boss/ymer_frostfather'),
('azrath_chainlord','abyss','Azrath, Señor de Cadenas','Azrath, Chainlord','raid',46,23500,194,135,128,'[{"at":1.0,"skills":["chain_lash"]},{"at":0.72,"skills":["silence_brand"]},{"at":0.4,"skills":["infernal_gate"]},{"at":0.18,"skills":["last_chain"]}]','[{"resource":"gold","min":1400,"max":1900},{"resource":"crystals","min":18,"max":28}]','Carcelero del Abismo y arquitecto de pactos imposibles.','boss/azrath_chainlord'),
('auriel_seventh','celestial','Auriel del Séptimo Sello','Auriel of the Seventh Seal','world',55,32000,225,165,190,'[{"at":1.0,"skills":["radiant_spear"]},{"at":0.7,"skills":["judgement"]},{"at":0.42,"skills":["mirror_heaven"]},{"at":0.2,"skills":["seventh_seal"]}]','[{"resource":"gold","min":1900,"max":2500},{"resource":"crystals","min":22,"max":34}]','Un guardián celestial que juzga si los mortales merecen cruzar el último umbral.','boss/auriel_seventh'),
('chaos_archon','chaos','Arconte del Caos','Chaos Archon','raid',65,48000,285,210,220,'[{"at":1.0,"skills":["entropy_ray"]},{"at":0.75,"skills":["reality_split"]},{"at":0.5,"skills":["inversion"]},{"at":0.25,"skills":["chaos_crown"]}]','[{"resource":"gold","min":2800,"max":3600},{"resource":"crystals","min":30,"max":45}]','Una inteligencia nacida donde nueve realidades chocaron a la vez.','boss/chaos_archon'),
('nexus_dragon','chaos','Vharos, Dragón del Nexo','Vharos, Nexus Dragon','world',70,62000,330,235,245,'[{"at":1.0,"skills":["nexus_breath"]},{"at":0.8,"skills":["wing_storm"]},{"at":0.55,"skills":["realm_break"]},{"at":0.3,"skills":["starfire"]},{"at":0.12,"skills":["nexus_end"]}]','[{"resource":"gold","min":3600,"max":4800},{"resource":"crystals","min":40,"max":60}]','El dragón que duerme entre portales y recuerda todos los reinos simultáneamente.','boss/nexus_dragon'),
('guild_eater','abyss','Heraldo Devoragremios','Guild Eater Herald','clan',50,28500,210,155,145,'[{"at":1.0,"skills":["banner_break"]},{"at":0.5,"skills":["shared_curse"]},{"at":0.2,"skills":["devour_oath"]}]','[{"resource":"gold","min":1700,"max":2200},{"resource":"crystals","min":20,"max":30}]','Una aberración que se alimenta de juramentos colectivos.','boss/guild_eater'),
('bloodmoon_empress','cursed-grove','Emperatriz de Luna Sangrienta','Bloodmoon Empress','event',35,13200,145,88,112,'[{"at":1.0,"skills":["moonblade"]},{"at":0.66,"skills":["blood_tide"]},{"at":0.33,"skills":["red_eclipse"]}]','[{"resource":"gold","min":850,"max":1200},{"resource":"crystals","min":12,"max":19}]','Solo aparece cuando la luna convierte las hojas del bosque en espejos rojos.','boss/bloodmoon_empress')
on conflict (id) do update set phases=excluded.phases, loot_table=excluded.loot_table;

commit;
