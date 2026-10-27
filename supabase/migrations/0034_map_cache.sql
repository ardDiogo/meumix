-- MeuMix — mapa Cache (logo oficial da coleção, pelo CDN da Steam)
-- Executar depois de 0033. Pode ser executado mais de uma vez.
-- Entra ativo e no fim da lista; dá para desativar ou reordenar em Admin → Configurações.

insert into public.maps (id, name, short_name, active, sort_order)
select 'de_cache', 'Cache', 'Cch', true, coalesce(max(sort_order), 0) + 1
from public.maps
on conflict (id) do nothing;
