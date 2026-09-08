begin;

create index if not exists battle_pass_progress_player_updated_idx
  on game.battle_pass_progress(player_id,updated_at desc);

create index if not exists quest_progress_character_status_idx
  on game.quest_progress(character_id,status,updated_at desc);

create index if not exists character_achievements_character_claim_idx
  on game.character_achievements(character_id,claimed_at,completed_at);

create index if not exists clan_raids_clan_started_idx
  on game.clan_raids(clan_id,starts_at desc);

create index if not exists clan_activity_actor_created_idx
  on game.clan_activity(actor_player_id,created_at desc)
  where actor_player_id is not null;

create index if not exists event_instances_window_idx
  on game.event_instances(event_id,starts_at,ends_at,status);

create index if not exists combat_sessions_character_state_idx
  on game.combat_sessions(character_id,state,updated_at desc);

create index if not exists realm_travel_character_time_idx
  on game.realm_travel_log(character_id,travelled_at desc);

create index if not exists profession_progress_character_level_idx
  on game.profession_progress(character_id,level desc);

commit;
