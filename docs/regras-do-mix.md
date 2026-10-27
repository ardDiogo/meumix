# Mix CS — Regras e Lógica Completa do Sistema

Documento de referência de como cada etapa do mix funciona: o que é armazenado, quais regras valem, o que reage em tempo real e quais temporizadores existem.

> O andamento da implementação de cada item está em [`roadmap.md`](./roadmap.md).

## Visão geral do fluxo

```text
Mix agendado → Abertura (horário do servidor) → Inscrições (10 classificados + reservas)
 → Votações (sugestão de times / capitães / mapas)
 → Pedra-Papel-Tesoura entre capitães → Escolha dos times (1-2-2-2-1)
 → Desempate de mapas (se houver) → Partida → Finalização (prints GC ou Faceit)
 → Cálculo de ELO → Histórico e Ranking
```

---

## 1) Ciclo de vida do mix e horário

- Cada mix tem data do evento, **horário de liberação**, tipo de recorrência (semanal na segunda-feira ou personalizado) e status: `agendado → aberto → fechado/finalizado`.
- Somente admin cria, altera ou exclui mixes. Na recorrência semanal, a próxima segunda é calculada automaticamente.
- A tela principal mostra o próximo mix agendado/aberto e se atualiza em tempo real quando o admin altera algo.
- **A abertura usa o relógio do servidor, nunca o do celular/PC.** O app mede a diferença entre o relógio local e o do servidor (compensando o tempo de ida e volta da rede). Enquanto não sincroniza, o botão fica bloqueado.
- Ressincroniza a cada 5 minutos e sempre que o jogador volta para a aba.
- A contagem regressiva atualiza a cada 1 segundo com o horário corrigido.

## 2) Inscrições e fila

**Regra de classificação**

- Os **10 primeiros** inscritos (pela ordem exata de chegada no servidor) são **classificados**; do 11º em diante são **reserva**.
- Se alguém cancela, a lista é reordenada automaticamente e o primeiro reserva sobe para classificado.

**Validações no servidor a cada inscrição**

1. Se já está inscrito → responde sucesso (não duplica).
2. **Punição ativa** → bloqueia até `horário de liberação + atraso da punição`, informando os segundos restantes. Punição vencida pela data de expiração é desativada automaticamente.
3. **Cedo demais** → recusada se faltar mais de 1 segundo para a abertura.
4. Dois cliques simultâneos → o banco impede duplicidade e responde como "já inscrito".
5. Toda tentativa é registrada em log de auditoria (cedo demais, bloqueado por punição, já inscrito, sucesso, erro).

**Proteção contra falhas (fila de nova tentativa)**

- Se a internet ou o servidor falhar, a inscrição não é perdida: entra numa fila salva no aparelho e o jogador vê "Processando...".
- Até **10 tentativas** com espera crescente: 1s, 1s, 2s, 2s, 3s, 3s, 5s, 5s, 10s, 10s.
- Tenta novamente ao reconectar, ao voltar para a aba e a cada 5s como reserva.
- Erros de regra (punição, cedo demais definitivo) não são repetidos indefinidamente.
- Se a punição falhar por erro do banco, a inscrição **não é bloqueada** (prefere-se deixar entrar a travar todos).

**Preparação para o horário de abertura (invisível ao jogador)**

- Renova a sessão de login a cada 5 min; nos últimos 2 min, a cada 5s; garante uma renovação final nos últimos 10s.
- "Acorda" o servidor de inscrição com pings nos últimos 30s antes de abrir (~a cada 10s) e a cada 45s com o mix aberto, para evitar lentidão de 2–10s no primeiro clique.

## 3) Votação de mapas

- Cada jogador escolhe **exatamente 4 mapas** dentre os mapas ativos configurados pelo admin. Pode trocar o voto (substitui o anterior).
- Só contam votos dos **classificados**.
- Entram na rotação os **4 mais votados**.

**Desempate de mapas** (pode ser desligado no admin)

- Roda só depois que os times estão escolhidos.
- Se o 4º lugar está empatado com mais mapas do que vagas restantes, abre o **Round 1** só com os mapas empatados; cada classificado vota no número de vagas restantes.
- Fecha quando todos os 10 votaram (ou o admin força o fechamento).
- Persistindo o empate → **Round 2** apenas com os que continuam empatados.
- Persistindo de novo → **sorteio aleatório** seguro, marcado como "Decidido por sorteio".
- A votação principal nunca é reaberta.

## 4) Votação de capitães

- Cada classificado vota em **até 2 jogadores**; não pode votar em si mesmo; só pode votar em classificados. Cada par voto/votado é único.
- Os **2 mais votados** viram capitães.
- **Bloqueio de voto tardio:** assim que a disputa de capitães (pedra-papel-tesoura) começa, o banco recusa novos votos. A tela também verifica antes de enviar e pula direto para a votação de mapas.
- Se o resultado já está matematicamente garantido, a etapa pode avançar antes.

## 5) Pedra, Papel ou Tesoura

- Os dois capitães escolhem e clicam "Estou Pronto". Ninguém vê a jogada do outro antes de ambos confirmarem.
- Regras: Pedra vence Tesoura, Tesoura vence Papel, Papel vence Pedra.
- **Empate:** fica salvo no banco (aparece o aviso "o round anterior empatou com X", mesmo recarregando a página), e após **3 segundos** as escolhas são zeradas para jogar de novo.
- **Vitória:** o vencedor escolhe primeiro; cada capitão já entra como 1º jogador do seu time e começa a escolha.
- Há trava contra processamento duplicado do resultado.
- Todos (jogadores e espectadores) acompanham em tempo real.

## 6) Escolha dos times

- Ordem de escolha: **1 – 2 – 2 – 2 – 1** (vencedor do PPT pega 1, depois alterna 2 a 2, e o último jogador vai para o outro capitão). 5 turnos, 10 jogadores.
- Antes de confirmar cada escolha, o app **relê o estado atual no banco** e confirma que ainda é a vez daquele capitão e que o jogador está livre (evita erros com cliques simultâneos).
- A ordem em que cada jogador foi escolhido fica registrada e é exibida.
- Ao fim do 5º turno, a escolha é marcada como concluída (e dispara a checagem de desempate de mapas).
- **Admin:** pode reiniciar só a escolha (mantém os votos de capitão) ou tudo. Remover um jogador zera as escolhas, mas mantém os votos. Ações ficam em log.

## 7) Sugestão de times balanceados e probabilidade de vitória

**Sugestão automática** (pode ser ligada/desligada no admin)

- Exige 10 jogadores. Pontuação de cada jogador:
  - Nível × 10, com multiplicadores 1,5× (nível 8), 2× (nível 9), 2,5× (nível 10);
  - \+ taxa de vitória × 80;
  - − 15 pontos por cada "lanterna" além da primeira.
- Testa **todas as 252 combinações** de 5×5 e escolhe a de menor diferença de pontos, desempatando pelo melhor equilíbrio jogador a jogador.
- Os 10 votam "Concordo / Não concordo". Com **80% ou mais** de concordância os times são aceitos; senão, segue para capitães.

**Probabilidade de vitória**

- Calculada quando os dois times estão completos, combinando ELO, taxa de vitória (ajustada para quem tem menos de 30 jogos), taxa de MVP, penalidade de lanterna, experiência, ADR e KAST. Mostrada em %.

## 8) Lembrete obrigatório de votação

- Janela em etapas: **Sugestão de times → Capitães → Mapas → Concluído** (pula as que não se aplicam).
- Quando há 10 classificados, a janela **não pode ser fechada** até o jogador terminar as votações pendentes.

## 9) Finalização do mix e ELO

**Plataformas**

- **Gamers Club:** o admin envia os prints do placar; a inteligência artificial lê coluna por coluna (K, A, D, DIFF, ADR, KDR, KAST, S, FA, MK, FK, RP, DROP).
  - DIFF é sempre recalculado como K − D; valores negativos impossíveis são zerados.
  - Nicks parecidos entre prints são unificados, mas nunca se juntam dois nomes que aparecem no mesmo print.
  - Times são reconhecidos por terem 3+ jogadores em comum, mesmo que o nome do time mude.
  - Se o serviço principal de leitura estiver sobrecarregado, troca na hora para o serviço alternativo.
- **Faceit:** o admin informa o link/ID da partida; os dados vêm direto da Faceit (K, A, D, DIFF, ADR, KDR, HS, MVP). Jogadores são identificados pelo ID Faceit, não pelo nick.

**Cálculo de ELO**

- Cada jogador do placar é vinculado ao perfil (pelo ID Faceit, ou por semelhança de nome ≥70%). O admin pode marcar "Não calcular".
- O RP da partida é somado ao ELO atual; o nível é recalculado.
- **MVP:** maior (K×3) + (A×1,5) + (ADR×0,2) − (D×2).
- **Lanterna:** menor K + ADR/100 + KDR×10.
- Vitórias/derrotas, kills, mortes, FK, DIFF somam; ADR e KAST viram médias ponderadas.

**Níveis**

| Nível | ELO                                     |
| ----- | --------------------------------------- |
| 1     | 0–99                                    |
| 2     | 100–219                                 |
| 3     | 220–349                                 |
| 4     | 350–499                                 |
| 5     | 500–659                                 |
| 6     | 660–829                                 |
| 7     | 830–1009                                |
| 8     | 1010–1209                               |
| 9     | 1210–1459                               |
| 10    | 1460–1600 (teto, sem acúmulo ilimitado) |

- **ELO inicial no cadastro** a partir do nível GC (0–20): GC 0–7 vai de 0 a 100; GC 8–20 vai de 100 a 1210; com teto.

**Estatísticas e ranking**

- Cada partida gera um registro por jogador; o banco recalcula automaticamente os totais do perfil a cada inclusão/edição/exclusão.
- O ranking agrupa por jogador (não por nick), então trocar de nick não duplica.
- Com filtro de datas, os números são recalculados só com as partidas do período.
- O mix finalizado vai para o histórico com o badge da plataforma.

## 10) Cargos e administração

- **Master** (acesso total) > **Admin** (operacional) > **Usuário**. Todo novo cadastro entra como usuário.
- **Reset de senha:** admin/master redefinem para a senha padrão; só master pode resetar a senha de outro master.
- **Punições:** só master cria/edita. Atraso de 30s a 1h na abertura, permanente ou com data de expiração (desativa sozinha). Na lista de jogadores aparece um ícone piscando com o motivo.
- **Insígnias:** criar/atribuir só admin/master; todos visualizam.
- **Chaves de funcionalidades:** sugestão de times, música de fundo, desempate de mapas.
- **Música de fundo:** toca em loop após o primeiro toque/clique do visitante (exigência dos navegadores); desligar no admin para a música até em abas abertas.
- **Logs de auditoria:** inscrições, ações de admin no mix, insígnias, mudanças de cargo, alterações de ELO.

## 11) Tempo real e temporizadores

**Atualizam sozinhos, sem recarregar a página:** mix atual, inscrições/cancelamentos/votos, votos de capitão, pedra-papel-tesoura, escolha dos times, sugestão de times e votos, desempate de mapas, chaves de funcionalidades. A página **não recarrega** ao trocar de aba (evita perder o que está na tela).

| Temporizador                          | Frequência                                         |
| ------------------------------------- | -------------------------------------------------- |
| Contagem regressiva do mix            | 1s                                                 |
| Checagem de abertura                  | 1s                                                 |
| Contagem de punição                   | 1s                                                 |
| Sincronização com relógio do servidor | 5 min + ao voltar à aba                            |
| Renovação do login                    | 5 min; 5s nos últimos 2 min; final nos últimos 10s |
| "Acordar" servidor de inscrição       | ~10s nos 30s finais; 45s com mix aberto            |
| Fila de nova tentativa                | 1s a 10s, até 10 tentativas, reserva a cada 5s     |
| Reset após empate no PPT              | 3s                                                 |
| Leitura das chaves de funcionalidade  | 10s + tempo real                                   |

## 12) O que fica armazenado

| Informação                           | Conteúdo                                                                                                                                                |
| ------------------------------------ | ------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Perfis                               | nick, ELO, nível, ID Faceit, estatísticas acumuladas                                                                                                    |
| Cargos                               | master / admin / usuário                                                                                                                                |
| Mixes                                | data, horário de liberação, status                                                                                                                      |
| Inscrições                           | jogador, ordem, classificado/reserva, dispositivo                                                                                                       |
| Cancelamentos                        | quem saiu: por conta própria ou removido por admin, com horário de inscrição e de saída (aparece no fim da lista de inscritos; zera ao reiniciar o mix) |
| Votos de mapas / mapas disponíveis   | 4 mapas por jogador; lista configurável                                                                                                                 |
| Desempate de mapas                   | rounds e votos                                                                                                                                          |
| Votos de capitão                     | até 2 por jogador                                                                                                                                       |
| Estado da escolha                    | PPT, vencedor, vez, times                                                                                                                               |
| Sugestão de times                    | times sugeridos e votos                                                                                                                                 |
| Histórico e partidas                 | resultado final e estatísticas por jogador                                                                                                              |
| Punições                             | atraso, motivo, expiração                                                                                                                               |
| Níveis / Insígnias / Funcionalidades | configurações do admin                                                                                                                                  |
| Logs                                 | auditoria de todas as ações sensíveis                                                                                                                   |
