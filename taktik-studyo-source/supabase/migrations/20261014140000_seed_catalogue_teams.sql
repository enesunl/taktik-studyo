-- PROD1.1: seed the 18 canonical Süper Lig teams into public.catalogue_teams.
-- Why: 20260925035438_catalogue_identity_foundation only creates the table; the canonical sync
-- (scripts/catalogue/sync.mjs) writes to local PGlite only, so hosted catalogue_teams would stay empty
-- and onboarding/profile favourite-team selection would have no teams.
-- Source: scripts/catalogue/team-registrations.json (reviewed, product-owned display metadata; not
-- attributed to BSD/TFF/FotMob). Values are identical to hosted public.teams as read on 2026-10-15.
-- Deterministic and idempotent: inserts missing rows only, never updates or deletes existing rows, and
-- aborts if any existing row differs from these values (no silent substitution).
-- Touches public.catalogue_teams only. No profile, preference or user data is read or written.
-- Provider mappings (team_provider_ids) are intentionally not seeded: production matches use the
-- BSD mapping inside supabase/functions/matches/teams.js.
-- Both statements use the same generated list, so no temporary objects or transaction assumptions.

insert into public.catalogue_teams (id,display_name,short_name,color_primary,color_secondary,sort_order,catalogue_active)
select id,display_name,short_name,color_primary,color_secondary,sort_order,true from (values
  ('galatasaray','Galatasaray','GS','#a51935','#efb62a',0),
  ('fenerbahce','Fenerbahçe','FB','#19294d','#f3d233',1),
  ('besiktas','Beşiktaş','BJK','#222222','#eeeeee',2),
  ('trabzonspor','Trabzonspor','TS','#702039','#8cc1dc',3),
  ('samsunspor','Samsunspor','SAM','#ca303a','#eeeeee',4),
  ('basaksehir','Başakşehir','İBF','#ed7835','#213a63',5),
  ('goztepe','Göztepe','GÖZ','#bb2039','#edc932',6),
  ('caykur-rizespor','Çaykur Rizespor','RİZ','#198c55','#276dad',7),
  ('kasimpasa','Kasımpaşa','KAS','#173c74','#ffffff',8),
  ('konyaspor','Konyaspor','KON','#23855c','#ffffff',9),
  ('alanyaspor','Alanyaspor','ALA','#ef802b','#228756',10),
  ('gaziantep-fk','Gaziantep FK','GFK','#c3313c','#252b2b',11),
  ('eyupspor','Eyüpspor','EYP','#713576','#e6be42',12),
  ('kocaelispor','Kocaelispor','KOC','#148255','#242b28',13),
  ('genclerbirligi','Gençlerbirliği','GEN','#b72637','#262725',14),
  ('erzurumspor','Erzurumspor FK','ERZ','#2c65ad','#ffffff',15),
  ('amedspor','Amedspor','AMD','#168553','#c5353d',16),
  ('corum-fk','Çorum FK','ÇOR','#c1303b','#242a28',17)
) as expected(id,display_name,short_name,color_primary,color_secondary,sort_order)
on conflict (id) do nothing;

do $$
declare differing integer;
begin
  select count(*) into differing
    from (values
  ('galatasaray','Galatasaray','GS','#a51935','#efb62a',0),
  ('fenerbahce','Fenerbahçe','FB','#19294d','#f3d233',1),
  ('besiktas','Beşiktaş','BJK','#222222','#eeeeee',2),
  ('trabzonspor','Trabzonspor','TS','#702039','#8cc1dc',3),
  ('samsunspor','Samsunspor','SAM','#ca303a','#eeeeee',4),
  ('basaksehir','Başakşehir','İBF','#ed7835','#213a63',5),
  ('goztepe','Göztepe','GÖZ','#bb2039','#edc932',6),
  ('caykur-rizespor','Çaykur Rizespor','RİZ','#198c55','#276dad',7),
  ('kasimpasa','Kasımpaşa','KAS','#173c74','#ffffff',8),
  ('konyaspor','Konyaspor','KON','#23855c','#ffffff',9),
  ('alanyaspor','Alanyaspor','ALA','#ef802b','#228756',10),
  ('gaziantep-fk','Gaziantep FK','GFK','#c3313c','#252b2b',11),
  ('eyupspor','Eyüpspor','EYP','#713576','#e6be42',12),
  ('kocaelispor','Kocaelispor','KOC','#148255','#242b28',13),
  ('genclerbirligi','Gençlerbirliği','GEN','#b72637','#262725',14),
  ('erzurumspor','Erzurumspor FK','ERZ','#2c65ad','#ffffff',15),
  ('amedspor','Amedspor','AMD','#168553','#c5353d',16),
  ('corum-fk','Çorum FK','ÇOR','#c1303b','#242a28',17)
    ) as e(id,display_name,short_name,color_primary,color_secondary,sort_order)
    left join public.catalogue_teams t on t.id = e.id
   where t.id is null
      or (t.display_name,t.short_name,lower(t.color_primary),lower(t.color_secondary),t.sort_order,t.catalogue_active)
         is distinct from (e.display_name,e.short_name,lower(e.color_primary),lower(e.color_secondary),e.sort_order,true);
  if differing > 0 then
    raise exception 'catalogue_teams differs from the verified registry for % team(s); review before seeding', differing
      using errcode = '23514';
  end if;
end $$;
