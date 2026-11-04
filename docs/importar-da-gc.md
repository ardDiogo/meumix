# Importar a partida da GC

Substitui os prints do placar: as estatísticas de cada mapa vêm direto da página da partida na Gamers Club.

## Como usar (admin)

1. **Uma vez só:** em *Finalizar mix → Plataforma: GC (importar da partida)*, arraste o botão **Enviar ao MeuMix** para a barra de favoritos do navegador (Ctrl+Shift+B mostra a barra). Sem arrastar: **Copiar código**, criar um favorito e colar o código no endereço (URL).
2. **Em cada mapa do mix:** abra a partida na GC (`gamersclub.com.br/lobby/match/<número>`), logado, e clique no favorito. Abre a aba *Importar da GC* do MeuMix com o mapa recebido.
3. **Na finalização:** os mapas recebidos aparecem na lista (na ordem em que foram enviados), já com o mapa certo. Clique em **Usar os mapas recebidos**: estatísticas, placar e RP vêm preenchidos.
4. Na primeira vez, quem não tiver a Steam vinculada no MeuMix pode vir como convidado: ligue ao jogador uma vez; o ID da GC fica salvo e as próximas importações já vêm certas.

Sem o favorito (ex.: no celular): F12 → Network → Fetch/XHR → F5 → linha `stats` → Response → copiar e colar em *Sem o botão? Colar o JSON da partida*. Assim o RP não vem: preencha à mão (a finalização não deixa seguir com o RP zerado, porque é ele que muda o ELO).

## O que vem

- `GET /api/lobby/match/{id}/stats`: K/A/D, ADR, KAST, FK, multikills, HS, plants/defuses, GC Rating, Swing, entries, trades, clutch, utilitárias, mira e o placar round a round. Para conta sem assinatura, o detalhe kill a kill vem só do round 1.
- `GET /lobby/match/{id}/1` (resultado da partida): **RP** (`rating_points`, que muda o ELO), mapa, nick e SteamID (liga quem tem a Steam vinculada; não fica salvo).
- `GET /api/allstar/highlights/lobby/{id}`: nick de cada ID da GC e os clipes do Allstar já processados (vão para os Clipes do mix).
- Não vem: **DROP**.

As três requisições são as mesmas que a página da GC faz ao abrir, com o login de quem clicou; os cookies da GC não saem do navegador. O servidor do MeuMix não acessa a GC.

## Onde aparece

Na página do mix (ordem: Estatísticas dos jogadores → Destaques da partida → Desempenho no mix → Análise da partida → Transmissões → Crônica):

- **Estatísticas dos jogadores** (um card só): com os dados da GC, ganha as abas **Geral · Entries · Trades · Clutch · Utilitárias · Mira**, todas ordenáveis clicando na coluna. A Geral é a tabela de sempre com **Rating**, **Swing** e **HS%**; nas outras abas dá para ver **todos os mapas** (contagens somadas; rating, ADR, KAST e mira como média pelos rounds) ou um mapa só. No **placar do topo** da página, ao lado de cada mapa, o **placar round a round** de cada mapa (um quadrado por round, na cor do time que venceu; D = bomba desarmada, B = bomba explodiu), com a **virada** (quando o vencedor perdia por 5+ rounds) e a **maior sequência**.
- **Destaques da partida** (mesmos cards da imagem compartilhada): MVP em destaque, Maior matador, Maior ADR, Maior KDR, Mais first kills, Mais assistências, **Mais cegados** (da GC) e o lanterna. Os outros números da GC (entries, trades, clutches, granadas, mira) ficam nas abas de Estatísticas dos jogadores e na Análise da partida.
- **Análise da partida**: aba por time (vencedor primeiro), jogadores do maior rating para o menor. Para cada um, a **análise** (2 a 3 frases com os números que importam), uma **dica** prática e, logo abaixo em laranja, a **resenha** no tom da crônica ("sem dó").
  - Escrita pelo **Gemini** (mesma chave da crônica) a partir de uma ficha com os números de cada jogador (`analysisSheet`, em `src/lib/match-analysis.ts`). Gerada sozinha ao finalizar um mix da GC; em mixes antigos, o admin clica em **Escrever com IA** / **Gerar de novo** no card.
  - **Trava de números** (`checkAiAnalysis`): o texto de um jogador com número fora das fichas do time dele é descartado e esse jogador fica com a versão por regras. Se menos da metade passar, nada é gravado.
  - Sem IA (ou antes de gerar): versão por regras, com fatos e dica, sem resenha.
  - Guardada em `mix_analyses` (migração `0037_mix_analyses.sql`, só o servidor lê e escreve). Quem exclui a conta leva junto as análises dos mixes que jogou.

Mix sem os dados da GC (prints, Faceit, manual): só a tabela de sempre e os destaques de sempre.

## Onde fica salvo

- `match_gc_maps` (migração 0035): um registro por mapa com tudo acima, já no lado A/B do mix.
- `player_aliases`: apelido `gc:<id>` liga o ID da GC ao jogador.
- `clips`: clipes do Allstar dos jogadores do mix.
