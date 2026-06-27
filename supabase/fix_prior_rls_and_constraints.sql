-- Zorg dat service_role altijd mag schrijven naar de kennisbank-tabellen.
-- RLS is enabled maar er waren geen INSERT/UPDATE policies voor service_role.

-- global_prior
create policy if not exists "Service role kan global_prior schrijven"
  on public.global_prior for all
  to service_role
  using (true)
  with check (true);

create policy if not exists "Authenticated mag global_prior lezen"
  on public.global_prior for select
  to authenticated
  using (true);

-- regional_prior
create policy if not exists "Service role kan regional_prior schrijven"
  on public.regional_prior for all
  to service_role
  using (true)
  with check (true);

create policy if not exists "Authenticated mag regional_prior lezen"
  on public.regional_prior for select
  to authenticated
  using (true);

-- soil_evidence
create policy if not exists "Service role kan soil_evidence schrijven"
  on public.soil_evidence for all
  to service_role
  using (true)
  with check (true);

-- shadow_predictions
create policy if not exists "Service role kan shadow_predictions schrijven"
  on public.shadow_predictions for all
  to service_role
  using (true)
  with check (true);
