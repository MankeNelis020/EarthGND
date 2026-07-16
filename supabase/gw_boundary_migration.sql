-- Migration: voeg afgeleide GWT-velden toe aan pendiepte_metingen (Poort A)
--
-- gw_depth_derived  afgeleid uit ρ-curve (detectGroundwaterBoundary)
-- gw_source         hoe de grens bepaald is: 'curve' | 'regional' | 'all_wet'
-- gw_confidence     betrouwbaarheid: 'high' | 'medium' | 'low'
--
-- Vervangt field_gw_depth als invoerveld. field_gw_depth blijft aanwezig
-- als archief voor bestaande handmatige invoer (deprecated, niet verwijderd).

alter table public.pendiepte_metingen
  add column if not exists gw_depth_derived float4,
  add column if not exists gw_source        text
    check (gw_source in ('curve', 'regional', 'all_wet')),
  add column if not exists gw_confidence    text
    check (gw_confidence in ('high', 'medium', 'low'));

comment on column public.pendiepte_metingen.gw_depth_derived is
  'GWT in m afgeleid uit de ρ-meetcurve door detectGroundwaterBoundary(). 0 = volledig nat.';
comment on column public.pendiepte_metingen.gw_source is
  'curve = uit ρ-plateau gedetecteerd; regional = BRO-fallback; all_wet = uniforme lage ρ of onbekend.';
comment on column public.pendiepte_metingen.gw_confidence is
  'Betrouwbaarheid dry/wet-oordeel. Welford-gewicht: high=1.0 medium=0.5 low=0.25.';
