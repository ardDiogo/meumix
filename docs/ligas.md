# Ligas (Mix de Segunda e Mix de Terça)

Cada mix semanal vira uma **liga**, com dados separados: mixes, ELO, nível, ranking, estatísticas,
insígnias, bolão e crônicas. Conta, perfil, Steam, vínculo com a GC e campeonatos continuam gerais.

## Decisões

- O histórico é **separado pela data**: mix numa terça vai para o Mix de Terça; qualquer outro dia,
  para o Mix de Segunda.
- O **ELO de cada liga começa do zero, mais o ELO inicial do nível GC** (opção B): ELO inicial + RP de
  cada mix daquela liga, em ordem de data, limitado a 0–1600 a cada mix (a mesma regra da finalização).
  Ajustes manuais de ELO feitos antes não entram.
- Quem joga nas duas ligas tem dois ELOs.
- Perfil: uma aba por liga e uma aba "Geral" só com totais (sem ELO somado).
- Quem não é membro não vê a liga.
- Campeonatos continuam gerais. Insígnias são por liga.

## Fases

1. **Base invisível** (`0045_leagues.sql`). A tabela `communities` vira a tabela de ligas
   (`principal` = Mix de Segunda, `terca` = Mix de Terça), com `league_members` (ELO e nível por liga)
   e `league_id` em `mix_matches` e `elo_change_logs`, preenchido por trigger. Todo o histórico fica
   no Mix de Segunda. O site não muda.
2. **Separar e recalcular** (`0046_leagues_split.sql`). Conferir antes com `supabase/ligas-relatorio.sql`
   (só lê). A migração move os mixes de terça (pela data) e a agenda de terça para o Mix de Terça e
   grava o ELO de cada liga em `league_members` e `league_elo_history`. Nada é apagado: o ELO de hoje
   (`profiles`, `elo_before`/`elo_after`) continua, e o site segue mostrando ele até a Fase 3.
   Gatilhos adiados recalculam a liga do zero, uma vez por transação, quando um mix é finalizado,
   excluído, muda de data ou tem convidado vinculado. Os mixes novos entram na liga da agenda.
3. **Telas por liga** e seletor de liga no topo.
4. **Membros e acesso**: convite por link com código, admins por liga, privacidade.

## Relatório de conferência (Fase 2)

Rode `supabase/ligas-relatorio.sql` no SQL Editor do Supabase depois da 0045. Ele não grava nada e
mostra, em um único resultado:

| seção | o que mostra |
| --- | --- |
| agenda | as agendas de mix, o dia da semana e quantos mixes cada uma tem |
| mixes | quantos mixes finalizados vão para cada liga e o período |
| atencao | mixes fora de segunda/terça (vão para o Mix de Segunda) |
| jogador | o ELO atual e o ELO que a pessoa terá em cada liga |
| duas ligas | quem jogou nas duas e o ELO em cada uma |
