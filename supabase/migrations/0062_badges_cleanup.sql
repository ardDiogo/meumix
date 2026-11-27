-- MeuMix — insígnias: ícones sem repetição e manuais repetidas desligadas
-- Executar depois de 0061. Pode ser executado mais de uma vez. Não apaga nada.
--
-- 1) Ícones novos (imagens em /public/badges), para não repetir os de outras insígnias:
--    Clutch Master (era ⚔️, igual ao Maior Matador) → 🥶
--    Cabeçudo      (era 🎯, igual ao Maior ADR)     → 🤯
--    Rei do Mapa   (era 🏆, igual ao MVP)           → 🗺️
update public.badges set icon = 'img:clutchmaster' where auto_rule = 'gc_clutch_master' and icon = 'img:clutch';
update public.badges set icon = 'img:cabecudo2' where auto_rule = 'gc_hs_top' and icon = 'img:cabecudo';
update public.badges set icon = 'img:mapa' where auto_rule = 'map_king' and icon = 'img:reimapa';

-- 2) Manuais que repetem uma automática: desligadas (somem das listas; o histórico fica).
--    Máquina de HS → Cabeçudo · Último Sobrevivente → Clutch Master · Patrão do Mix → Rei do Mix
--    Entry Fragger → Abre-Alas · Parceiro de Guerra → Mais Assistências
--    Só desliga se ninguém tiver a insígnia ativa (dá para religar em Admin → Insígnias).
update public.badges b
   set enabled = false
 where b.auto_rule is null
   and b.enabled
   and b.name in ('Máquina de HS', 'Último Sobrevivente', 'Patrão do Mix', 'Entry Fragger', 'Parceiro de Guerra')
   and not exists (
     select 1 from public.player_badges pb where pb.badge_id = b.id and pb.deactivated_at is null
   );
