-- MeuMix — mapa Cobblestone (logo nova em /public/maps/de_cobblestone.png)
-- Executar depois de 0060. Pode ser executado mais de uma vez.
-- Entra ativo e no fim da lista; dá para desativar ou reordenar em Admin → Configurações.

insert into public.maps (id, name, short_name, active, sort_order)
select 'de_cobblestone', 'Cobblestone', 'Cbl', true, coalesce(max(sort_order), 0) + 1
from public.maps
on conflict (id) do nothing;
