-- Fix: normalise monteur_email to lowercase in existing rows.
-- The notify route now always stores lowercase; this migration aligns
-- existing data so case-sensitive .eq() lookups work on old rows too.

UPDATE public.pendiepte_metingen
SET monteur_email = LOWER(monteur_email)
WHERE monteur_email IS NOT NULL
  AND monteur_email <> LOWER(monteur_email);

UPDATE public.calculations
SET monteur_email = LOWER(monteur_email)
WHERE monteur_email IS NOT NULL
  AND monteur_email <> LOWER(monteur_email);
