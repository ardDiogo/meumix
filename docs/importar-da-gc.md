# Importar a partida da GC

Substitui os prints do placar: as estatísticas de cada mapa vêm direto da página da partida na Gamers Club.

## Como usar (admin)

1. **Uma vez só:** em *Finalizar mix → Plataforma: GC (importar da partida)*, arraste o botão **Enviar ao MeuMix** para a barra de favoritos do navegador (Ctrl+Shift+B mostra a barra). Sem arrastar: **Copiar código**, criar um favorito e colar o código no endereço (URL).
2. **Em cada mapa do mix:** abra a partida na GC (`gamersclub.com.br/lobby/match/<número>`), logado, e clique no favorito. Abre a aba *Importar da GC* do MeuMix com o mapa recebido.
3. **Na finalização:** os mapas recebidos aparecem na lista (na ordem em que foram enviados). Confira o mapa de cada um e clique em **Usar os mapas recebidos**.
4. **Preencha o RP** de cada jogador (soma dos mapas): a GC não manda o RP nessa resposta, e é ele que muda o ELO. A finalização não deixa seguir com o RP zerado.
5. Na primeira vez, ligue os jogadores que vierem como convidados; o ID da GC fica salvo e as próximas importações já vêm certas.

Sem o favorito (ex.: no celular): F12 → Network → Fetch/XHR → F5 → linha `stats` → Response → copiar e colar em *Sem o botão? Colar o JSON da partida*.

## O que vem

- `GET /api/lobby/match/{id}/stats`: K/A/D, ADR, KAST, FK, multikills, HS, plants/defuses, GC Rating, Swing, entries, trades, clutch, utilitárias, mira e o placar round a round. Para conta sem assinatura, o detalhe kill a kill vem só do round 1.
- `GET /api/allstar/highlights/lobby/{id}`: nick de cada ID da GC e os clipes do Allstar já processados (vão para os Clipes do mix).
- Não vêm: **RP** e **DROP**.

As duas requisições são as mesmas que a página da GC faz ao abrir, com o login de quem clicou; os cookies da GC não saem do navegador. O servidor do MeuMix não acessa a GC.

## Onde fica salvo

- `match_gc_maps` (migração 0035): um registro por mapa com tudo acima, já no lado A/B do mix.
- `player_aliases`: apelido `gc:<id>` liga o ID da GC ao jogador.
- `clips`: clipes do Allstar dos jogadores do mix.
