# Ligas (Mix da Lanterna e Mix do Jantinha)

O mix de segunda é o **Mix da Lanterna** (slug `principal`) e o de terça, o **Mix do Jantinha** (slug
`terca`), nomes da migração `0048_league_names.sql`. Abaixo, "Mix de Segunda" e "Mix de Terça" são
esses dois.

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
3. **Telas por liga** (`0047_leagues_badges.sql` + código). Detalhes abaixo.
4. **Membros e acesso**: convite por link com código, admins por liga, privacidade.

## Relatório de conferência (Fase 2)

Rode `supabase/ligas-relatorio.sql` no SQL Editor do Supabase depois da 0045. Ele não grava nada e
mostra, em um único resultado:

| seção      | o que mostra                                                    |
| ---------- | --------------------------------------------------------------- |
| agenda     | as agendas de mix, o dia da semana e quantos mixes cada uma tem |
| mixes      | quantos mixes finalizados vão para cada liga e o período        |
| atencao    | mixes fora de segunda/terça (vão para o Mix de Segunda)         |
| jogador    | o ELO atual e o ELO que a pessoa terá em cada liga              |
| duas ligas | quem jogou nas duas e o ELO em cada uma                         |

## Fase 3: telas por liga

**Seletor no topo** (e no menu do celular): a liga escolhida fica num cookie (`meumix_liga`).
Admin vê todas; quem joga vê as suas; quem ainda não jogou nenhuma vê todas. Sem escolha, abre na
liga em que a pessoa joga. Código: `src/services/league.ts` (`getCurrentLeague`, `leagueScope`).

O que segue a liga do topo:

- **Mixes, ranking, jogadores, estatísticas (inclusive as da GC), clipes, bolão e dashboard**: só os
  mixes e o ELO da liga (`league_members`, `league_elo_history`).
- **Próximo mix e inscrições**: as agendas da liga. Uma agenda nova nasce na liga do topo.
- **Finalizar, draft, sugestão de times e PICK**: ELO da liga do mix. Quem nunca jogou nela entra com
  o ELO inicial do nível GC.
- **Placar do mix e aviso de resultado no celular**: ELO da liga do mix.
- **Avisos de inscrições e bolão**: só para quem joga na liga do mix (e quem ainda não joga em nenhuma).
- **Crônica**: ranking e sequências da liga do mix.
- Um mix de outra liga continua abrindo pelo endereço (ex.: link do perfil).

**Perfil do jogador**: abas com as ligas dele (entre as que quem vê pode ver) e, com mais de uma,
**Geral** (todos os mixes somados, sem ELO). `?liga=terca` / `?liga=geral` no endereço.

**Insígnias**: as automáticas são calculadas liga por liga, só com os mixes dela, e aparecem na liga
em que saíram; as manuais valem em todas. O progresso também é por liga. Na mesma insígnia, a
conquista da terça leva o prefixo `terca:` na referência. A função antiga `sync_auto_badges` agora
grava no Mix de Segunda (compatível com a versão anterior do site até o deploy).

**Ajuste de ELO no admin**: vale para a liga do topo. Como o ELO da liga é recalculado do histórico,
o ajuste fica guardado em `league_members.elo_offset` (somado ao ELO inicial) e entra em todo
recálculo. `set_league_elo(liga, jogador, elo)` acerta o valor na hora. Mudar o nível GC recalcula
todas as ligas.

O ELO antigo em `profiles` continua sendo atualizado na finalização, mas o site não mostra mais.
