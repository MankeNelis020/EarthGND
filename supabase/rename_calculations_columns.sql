-- ─── Migratie: calculations kolomhernoeming (canonical contract) ────────────
-- Zie docs/contracts.md §B voor de volledige specificatie.
--
-- Voer uit in de Supabase SQL editor als de kolommen nog de legacy-namen hebben.
-- Veilig om meerdere keren uit te voeren (IF EXISTS beschermt elke stap).
--
-- Volgorde:
--   1. Voeg nieuwe kolommen toe (canonical namen)
--   2. Kopieer bestaande data
--   3. Verwijder legacy-kolommen (na verificatie dat geen app meer de oude namen schrijft)

-- Stap 1: voeg canonical kolommen toe
alter table public.calculations
  add column if not exists input_values jsonb not null default '{}',
  add column if not exists result       jsonb not null default '{}';

-- Stap 2: kopieer bestaande data naar canonical kolommen (enkel als ze nog leeg zijn)
update public.calculations
set
  input_values = coalesce(
    nullif(input_values, '{}'::jsonb),
    coalesce(input, '{}')
  ),
  result = coalesce(
    nullif(result, '{}'::jsonb),
    coalesce(resultaat, '{}')
  )
where
  input_values = '{}' or result = '{}';

-- Stap 3: verwijder legacy-kolommen (voer pas uit na volledige migratie + verificatie)
-- alter table public.calculations drop column if exists input;
-- alter table public.calculations drop column if exists resultaat;
--
-- Laat bovenstaande regels commentaar totdat:
--   a. De app op productie geen `input` of `resultaat` meer leest/schrijft, EN
--   b. getScanContext() geen fallback meer nodig heeft.
