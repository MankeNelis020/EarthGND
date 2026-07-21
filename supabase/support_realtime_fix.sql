-- REPLICA IDENTITY FULL op messages zodat bij UPDATE/DELETE ook old_record
-- beschikbaar is via postgres_changes. Niet vereist voor INSERT-filters,
-- maar nuttig als je later status-wijzigingen wil observeren.
alter table public.messages replica identity full;
