# Bolão e avisos no celular

## Bolão do mix

- **Quem palpita:** qualquer usuário cadastrado, jogando ou não. Um palpite por mix, que pode ser
  mudado até fechar.
- **Abre** quando os times estão definidos (PICK concluído ou sugestão de times aceita) e **fecha**
  no horário marcado do mix. Depois de finalizado, o mix não aceita palpites.
- **Palpite:** time vencedor (identificado pelo capitão), placar de mapas (com 3 mapas: 3×0 ou
  2×1), MVP e lanterna (opcionais; não podem ser o mesmo jogador).
- **Pontos** (`src/lib/bolao.ts`, testado em `bolao.test.ts`):

  | Acerto                               | Pontos |
  | ------------------------------------ | ------ |
  | Time vencedor                        | 3      |
  | Placar de mapas (com vencedor certo) | +2     |
  | MVP                                  | 3      |
  | Lanterna                             | 2      |

  Máximo de 10 por mix. Mix empatado: ninguém acerta o vencedor.

- **Conferência:** calculada na hora a partir do resultado oficial (mapas, `is_mvp` e
  `is_lanterna` da finalização). Corrigir ou excluir o mix corrige o bolão sozinho. O vencedor é
  conferido pelo time em que o capitão jogou, então trocar as letras A/B na finalização não erra
  os pontos.
- **Privacidade:** os palpites ficam numa tabela sem acesso pela API (`mix_predictions`, RLS sem
  políticas). Enquanto o bolão está aberto, cada um vê só o próprio palpite e a divisão entre os
  times; depois de fechar, todos aparecem.
- **Onde aparece:** no Dashboard (junto do PICK), na página do mix finalizado e em **/bolao**
  (ranking geral: pontos; desempate por placares exatos, MVPs certos e menos palpites).

## Avisos no celular (Web Push)

Cada jogador ativa em **Configurações → Avisos no celular**, por aparelho, e escolhe os tipos:

| Tipo           | Quando                                                               | Para quem                       |
| -------------- | -------------------------------------------------------------------- | ------------------------------- |
| Inscrições     | Lista abre em até 15 min; falta 1 h para o mix e ainda há vaga       | Todos (vagas: quem não entrou)  |
| Capitão e PICK | Disputa de capitães começou; você foi escolhido                      | Os capitães; o escolhido        |
| Bolão          | Times definidos (bolão aberto); falta 1 h e você não palpitou        | Todos                           |
| Resultado      | Mix finalizado: vitória/derrota, ELO antes → depois; pontos do bolão | Quem jogou; quem palpitou       |
| Ao vivo        | Um jogador com Twitch cadastrada abriu a live                        | Todos (menos quem está ao vivo) |

- **iPhone:** só funciona com o app instalado na tela de início (iOS 16.4 ou mais novo).
- **Configuração:** chaves VAPID (`VAPID_PUBLIC_KEY`, `VAPID_PRIVATE_KEY`) geradas em Admin →
  Configurações; migração `0031_bolao_push.sql`.
- **Avisos por horário** (inscrições, vagas, bolão fechando, lives) precisam de alguém chamando
  `/api/cron/avisos` a cada 5 minutos. O cron da Vercel no plano gratuito roda só 1 vez por dia,
  por isso usamos o [cron-job.org](https://cron-job.org) (gratuito):
  1. Crie a conta e clique em **Create cronjob**.
  2. URL: `https://meumix.vercel.app/api/cron/avisos`; agendamento: a cada 5 minutos.
  3. Em **Advanced → Headers**, adicione `Authorization` com o valor `Bearer ` seguido do
     `CRON_SECRET` que já está na Vercel.
  4. Salve e use **Test run**: a resposta deve ser `{"ok":true,"sent":0}` (ou o número enviado).
- Os avisos de acontecimentos (capitão, PICK, times definidos, resultado) saem na hora, sem o
  agendador.
- Cada aviso sai uma vez só (`push_log`, limpo após 30 dias pelo cron de retenção). Aparelhos que
  o navegador invalidou são apagados no envio seguinte.
- O conteúdo vai criptografado até o aparelho; o serviço de push do navegador (Google, Apple,
  Mozilla) só entrega.
