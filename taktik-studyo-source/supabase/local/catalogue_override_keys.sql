-- D3 LOCAL PGlite only. Not in the production migration queue.
-- Keep ownership, policies and grants unchanged; extend only accepted key syntax.
alter table public.player_overrides drop constraint player_overrides_player_key_check;
alter table public.player_overrides add constraint player_overrides_player_key_check
check (player_key ~ '^(local:[a-zA-Z0-9_-]{1,80}|bsd:[1-9][0-9]{0,15}|internal:[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12})$');
