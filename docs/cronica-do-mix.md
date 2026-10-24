# Crônica do mix

Texto bem-humorado ("edição sem dó") sobre cada mix finalizado, na página do mix, na imagem de
compartilhamento e pronto para colar no WhatsApp.

## Como é escrita

1. **Fatos** (`chronicleFacts`, em `src/lib/chronicle.ts`): o MeuMix calcula o que aconteceu, com os
   números oficiais: placar e mapas, estatísticas de cada jogador, MVP e lanterna, quem mais
   matou, morreu, deu assistência, abriu round (FK), maior ganho e perda de RP, estreias,
   sequências (vitórias, derrotas, lanterna e MVP seguidos), líder do ranking e bolão.
2. **IA** (Gemini, a mesma chave da leitura de prints): escreve a crônica só com esses fatos, no tom
   pesado e engraçado, zoando o desempenho no jogo e nunca a pessoa.
3. **Trava de números** (`checkAiChronicle`): se a IA escrever qualquer número que não está nos fatos
   (acima de 5), o texto é descartado. Tenta 2 modelos; se nenhum servir, usa o modelo pronto.
4. **Modelo pronto** (`templateChronicle`): crônica sem IA, com frases que variam de mix para mix.
   Também é usado quando não há chave de IA.

Testes: `npm run test:cronica`.

## Quando

- Gerada sozinha logo depois de **Finalizar mix** (leva alguns segundos; a página mostra "sendo
  escrita").
- Mixes antigos, ou depois de corrigir um mix (vincular convidado, mudar a data): na página do mix,
  o admin clica em **Gerar crônica** / **Gerar de novo**.

## Controle do admin (página do mix)

- **Gerar de novo**: nova versão (a IA escreve diferente a cada vez).
- **Editar**: muda subtítulo, abertura, tópicos e fechamento (`*texto*` = negrito).
- **Ocultar / Mostrar**: oculta do site, da imagem e da mensagem.
- A etiqueta mostra a origem: IA, Modelo ou Editada.

## Compartilhar

- **Copiar para o WhatsApp**: texto formatado com placar, mapas, tópicos e link.
- **Compartilhar resultado**: a imagem inclui a crônica no fim (opção "Incluir a crônica" no
  diálogo; `?cronica=0` gera sem). A mensagem que acompanha a imagem passa a ser a crônica.
- Os emojis da imagem vêm do Twemoji (jsDelivr); sem acesso, viram marcadores laranja e a imagem
  sai do mesmo jeito.

## Dados

Tabela `mix_chronicles` (migração `0032_mix_chronicles.sql`), lida e gravada só pelo servidor.
Como cita nicks, a crônica dos mixes de quem exclui a conta é apagada junto.
