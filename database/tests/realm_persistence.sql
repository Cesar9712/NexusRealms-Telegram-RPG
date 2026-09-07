begin;

insert into game.players (id, telegram_user_id, display_name) values
  ('10000000-0000-0000-0000-000000000001', 900000001, 'Realm Test Hero'),
  ('10000000-0000-0000-0000-000000000002', 900000002, 'Referrer Hero');

insert into game.characters (id, player_id, class_id, current_realm_id, name, level, hp, hp_max, mp, mp_max, energy, energy_max, power)
values ('20000000-0000-0000-0000-000000000001','10000000-0000-0000-0000-000000000001','warrior','ashen-frontier','Realm Test Hero',10,140,140,70,70,100,100,500);

insert into game.resources (character_id, resource_code, amount) values
  ('20000000-0000-0000-0000-000000000001','gold',999),
  ('20000000-0000-0000-0000-000000000001','crystals',15);

insert into game.clans (id, name, tag) values ('30000000-0000-0000-0000-000000000001','Persistence Clan','PST');
insert into game.clan_members (clan_id, player_id, role) values ('30000000-0000-0000-0000-000000000001','10000000-0000-0000-0000-000000000001','officer');

insert into game.battle_pass_seasons (id, starts_at, ends_at) values ('test-season',now() - interval '1 day',now() + interval '30 days');
insert into game.battle_pass_progress (season_id, player_id, xp, level, premium_unlocked) values ('test-season','10000000-0000-0000-0000-000000000001',360,4,true);

insert into game.referral_profiles (player_id, referral_code) values ('10000000-0000-0000-0000-000000000001','realmtest01');
insert into game.referral_attributions (referred_player_id, referrer_player_id) values ('10000000-0000-0000-0000-000000000001','10000000-0000-0000-0000-000000000002');

insert into game.earn_balances (player_id, internal_credits) values ('10000000-0000-0000-0000-000000000001',777);
insert into game.item_definitions (id, name_es, name_en, item_type, rarity) values ('test_sword','Espada de Prueba','Test Sword','weapon','rare');
insert into game.inventory_items (id, character_id, item_definition_id) values ('40000000-0000-0000-0000-000000000001','20000000-0000-0000-0000-000000000001','test_sword');

-- The travel operation is intentionally limited to the realm field.
update game.characters
set current_realm_id = 'cursed-grove', updated_at = now()
where id = '20000000-0000-0000-0000-000000000001';

-- Simulate app reload / fresh login by querying all domains again from durable tables.
do $$
begin
  if (select current_realm_id <> 'cursed-grove' from game.characters where id = '20000000-0000-0000-0000-000000000001') then raise exception 'realm travel failed'; end if;
  if not exists (select 1 from game.clan_members where player_id = '10000000-0000-0000-0000-000000000001' and role = 'officer') then raise exception 'clan lost after realm travel'; end if;
  if (select internal_credits <> 777 from game.earn_balances where player_id = '10000000-0000-0000-0000-000000000001') then raise exception 'earn lost after realm travel'; end if;
  if not exists (select 1 from game.battle_pass_progress where player_id = '10000000-0000-0000-0000-000000000001' and level = 4 and premium_unlocked) then raise exception 'battle pass lost after realm travel'; end if;
  if not exists (select 1 from game.referral_attributions where referred_player_id = '10000000-0000-0000-0000-000000000001') then raise exception 'referral lost after realm travel'; end if;
  if (select count(*) <> 1 from game.inventory_items where character_id = '20000000-0000-0000-0000-000000000001') then raise exception 'inventory lost after realm travel'; end if;
  if not exists (select 1 from game.resources where character_id = '20000000-0000-0000-0000-000000000001' and resource_code = 'gold' and amount = 999) then raise exception 'resources lost after realm travel'; end if;
end $$;

rollback;
