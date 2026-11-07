import {
  BarChart3,
  CalendarClock,
  ClipboardList,
  Coins,
  Download,
  GitBranch,
  Hand,
  HelpCircle,
  ListOrdered,
  Shield,
  Shuffle,
  Trophy,
  Users,
} from "lucide-react";
import { notFound } from "next/navigation";
import { formatDays } from "@/components/championships/format";
import { Card, CardContent } from "@/components/ui/card";
import {
  formatMoney,
  GROUP_FORMAT_LABEL,
  MAX_TEAMS,
  PLAYOFF_FORMAT_LABEL,
  PLAYOFF_TEAMS,
  prizeDistribution,
} from "@/lib/championship";
import { snakeOrder } from "@/lib/championship-draft";
import { matchMinutes, MATCH_STATUS_LABEL, type MatchStatus } from "@/lib/championship-schedule";
import { getChampionship } from "@/services/championships";

export const metadata = { title: "Como funciona o campeonato" };

function Section({
  id,
  icon: Icon,
  title,
  children,
}: {
  id: string;
  icon: typeof Users;
  title: string;
  children: React.ReactNode;
}) {
  return (
    <Card id={id} className="scroll-mt-20">
      <div className="flex items-center gap-2 border-b border-border px-4 py-3">
        <Icon className="size-4 text-brand" aria-hidden />
        <h2 className="font-display text-sm font-semibold tracking-wide uppercase">{title}</h2>
      </div>
      <CardContent className="space-y-3 text-sm leading-relaxed text-muted [&_b]:font-semibold [&_b]:text-fg [&_li]:pl-1 [&_ol]:list-decimal [&_ol]:space-y-1 [&_ol]:pl-5 [&_ul]:list-disc [&_ul]:space-y-1 [&_ul]:pl-5">
        {children}
      </CardContent>
    </Card>
  );
}

/** Destaque com os números deste campeonato. */
function Here({ children }: { children: React.ReactNode }) {
  return (
    <div className="rounded-md border border-brand/30 bg-brand/[0.06] px-3 py-2 text-sm text-fg">
      <span className="mr-1.5 text-[11px] font-bold tracking-wider text-brand uppercase">Neste campeonato</span>
      {children}
    </div>
  );
}

const STATUS_HELP: Record<MatchStatus, string> = {
  pending: "o jogo ainda não tem data; um dos capitães propõe.",
  proposed: "um capitão propôs data e hora; o capitão adversário aceita ou recusa.",
  approval: "os dois capitães concordaram; falta a organização aprovar (e definir o servidor).",
  scheduled: "data, hora e servidor confirmados.",
  live: "o jogo está acontecendo (ou já tem mapa registrado numa série MD3).",
  finished: "a série terminou e o resultado já conta na classificação.",
  postponed: "a organização adiou; os capitães combinam uma nova data.",
  cancelled: "a organização cancelou o jogo.",
};

/** Como funciona: o campeonato do começo ao fim, com os números deste campeonato e todas as opções. */
export default async function HowItWorksPage({ params }: PageProps<"/campeonatos/[slug]/como-funciona">) {
  const data = await getChampionship((await params).slug);
  if (!data) notFound();
  const { championship: c } = data;
  const n = c.teamCount;
  const double = c.groupFormat === "double_round_robin";
  const games = ((n * (n - 1)) / 2) * (double ? 2 : 1);
  const rounds = (n % 2 ? n : n - 1) * (double ? 2 : 1);
  const perTeam = (n - 1) * (double ? 2 : 1);
  const players = n * c.playersPerTeam;
  const prize = prizeDistribution(c.entryFee, players, c.prizeSplit, c.costs);
  const example = snakeOrder(
    Array.from({ length: Math.min(n, 5) }, (_, i) => `${i + 1}º`),
    Math.min(c.potCount, 4),
  );
  const cut = PLAYOFF_TEAMS[c.playoffFormat];

  const index = [
    ["fluxo", "Passo a passo"],
    ["papeis", "Quem faz o quê"],
    ["times", "Inscrições e times"],
    ["draft", "Potes, adedonha e draft"],
    ["classificatoria", "Fase classificatória"],
    ["agenda", "Agendamento dos jogos"],
    ["resultados", "Resultados e GC"],
    ["classificacao", "Classificação e desempate"],
    ["playoffs", "Playoffs"],
    ["estatisticas", "Estatísticas e MVP"],
    ["premiacao", "Premiação"],
    ["duvidas", "Dúvidas comuns"],
  ];

  return (
    <div className="grid gap-4 lg:grid-cols-[14rem_1fr]">
      <nav aria-label="Índice" className="lg:sticky lg:top-20 lg:self-start">
        <Card>
          <ol className="space-y-0.5 p-2 text-sm">
            {index.map(([id, label], i) => (
              <li key={id}>
                <a
                  href={`#${id}`}
                  className="flex gap-2 rounded-md px-2 py-1.5 text-muted hover:bg-surface-2 hover:text-fg"
                >
                  <span className="w-4 text-right text-subtle tabular">{i + 1}</span>
                  {label}
                </a>
              </li>
            ))}
          </ol>
        </Card>
      </nav>

      <div className="min-w-0 space-y-4">
        <Section id="fluxo" icon={ListOrdered} title="Passo a passo">
          <ol>
            <li>
              <b>Cadastro</b>: a organização cria o campeonato (formato, datas, dias e horários dos jogos, premiação).
            </li>
            <li>
              <b>Inscrições</b>: os jogadores (com conta no MeuMix) são inscritos pela organização.
            </li>
            <li>
              <b>Times e capitães</b>: cada time tem nome, sigla, cor, escudo e um capitão, que é líder e jogador.
            </li>
            <li>
              <b>Potes</b>: os demais inscritos são divididos em potes, com um jogador por time em cada pote.
            </li>
            <li>
              <b>Adedonha</b>: os capitães jogam no site para definir a ordem de escolha.
            </li>
            <li>
              <b>Draft</b>: escolha em serpentina, pote por pote, até formar os elencos.
            </li>
            <li>
              <b>Fase classificatória</b>: confrontos gerados automaticamente; os capitães combinam as datas.
            </li>
            <li>
              <b>Resultados</b>: cada partida da GC é enviada ao MeuMix e a classificação atualiza sozinha.
            </li>
            <li>
              <b>Playoffs</b>: os melhores classificados disputam a chave até o campeão.
            </li>
            <li>
              <b>Premiação e estatísticas</b>: valores calculados e o MVP do campeonato.
            </li>
          </ol>
          <p>
            O campeonato é <b>separado do mix</b>: não altera ELO, ranking, insígnias nem as estatísticas dos mixes.
          </p>
        </Section>

        <Section id="papeis" icon={Shield} title="Quem faz o quê">
          <ul>
            <li>
              <b>Organização</b>: quem criou o campeonato (um administrador), quem o super admin liberou como
              organizador e o próprio super admin. Cadastra e edita tudo, inscreve, monta times e potes, conduz o draft,
              gera e edita o calendário, aprova datas, registra resultados, gera os playoffs e informa as inscrições
              pagas.
            </li>
            <li>
              <b>Capitão</b>: joga a adedonha, escolhe os jogadores do seu time no draft, propõe datas e aceita ou
              recusa as propostas do adversário. Não altera resultados nem elencos.
            </li>
            <li>
              <b>Jogadores e visitantes</b>: acompanham tudo — times, draft ao vivo, calendário, classificação, chave,
              estatísticas e premiação.
            </li>
          </ul>
        </Section>

        <Section id="times" icon={Users} title="Inscrições e times">
          <ul>
            <li>
              De <b>2 a {MAX_TEAMS} times</b>, com <b>2 a 10 jogadores</b> por time.
            </li>
            <li>
              Só entra quem tem <b>conta no MeuMix</b> (o capitão precisa entrar para agendar, e as estatísticas ficam
              ligadas ao jogador). As vagas são <b>times × jogadores por time</b>; o site não deixa passar disso.
            </li>
            <li>
              O <b>capitão</b> é escolhido entre os inscritos e já entra no time. Um jogador só pode ser capitão de um
              time. Trocar o capitão devolve o antigo para a lista de inscritos sem time.
            </li>
            <li>Quando o draft começa, inscrições, capitães e times ficam fechados (reiniciar o draft reabre).</li>
          </ul>
          <Here>
            {n} times de {c.playersPerTeam} jogadores = {players} inscritos (o capitão + {c.potCount} escolhidos no
            draft por time).
          </Here>
        </Section>

        <Section id="draft" icon={Shuffle} title="Potes, adedonha e draft">
          <p>
            <b>Potes.</b> São sempre <b>jogadores por time − 1</b> potes (o capitão não entra em pote), e cada pote tem
            exatamente <b>um jogador por time</b>. A organização distribui os inscritos pelos potes, normalmente do
            nível mais alto (pote 1) ao mais baixo.
          </p>
          <p>
            <b>Adedonha (ordem de escolha).</b> Em cada rodada, os capitães dos times ainda sem posição escolhem{" "}
            <b>em segredo um número de 0 a 5</b>. Ninguém vê o número do outro até todos jogarem. O site sorteia o time
            que <b>começa a contagem</b> (ele conta 1), soma os números e conta em roda: o time atingido pelo total
            escolhe na próxima posição. A rodada se repete com quem sobrou; o último fecha a ordem. Se um capitão não
            estiver, a organização pode jogar por ele.
          </p>
          <p>
            <b>Serpentina.</b> No pote 1 a ordem é 1º → último; no pote 2 volta (último → 1º); e assim alternando. Quem
            escolheu por último num pote escolhe primeiro no seguinte. Exemplo:
          </p>
          <div className="overflow-x-auto">
            <table className="text-xs">
              <tbody>
                {example.map((row, i) => (
                  <tr key={i}>
                    <td className="py-0.5 pr-3 font-semibold text-fg">Pote {i + 1}</td>
                    <td className="py-0.5 text-muted">{row.join(" → ")}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <ul>
            <li>
              Só o <b>capitão do time da vez</b> vê o botão “Escolher”, e só nos jogadores do pote da vez.
            </li>
            <li>
              <b>Último do pote automático</b>: quando sobra um só jogador no pote, ele vai sozinho para o time da vez.
            </li>
            <li>Um jogador nunca é escolhido duas vezes (o banco impede, mesmo com dois cliques ao mesmo tempo).</li>
            <li>
              A organização pode <b>escolher por um capitão ausente</b>, <b>desfazer a última escolha</b> (a automática
              sai junto com a que a provocou) e <b>reiniciar</b> o draft.
            </li>
            <li>
              O <b>Log do PICK</b> mostra cada escolha em ordem: quem pickou, o time, o pote, as automáticas e as
              desfeitas (riscadas).
            </li>
          </ul>
          <Here>
            {c.potCount} {c.potCount === 1 ? "pote" : "potes"} de {n} jogadores; {n * c.potCount} escolhas no total.
          </Here>
        </Section>

        <Section id="classificatoria" icon={ClipboardList} title="Fase classificatória">
          <ul>
            <li>
              <b>Todos contra todos</b>, em <b>turno único</b> (cada par se enfrenta uma vez) ou <b>ida e volta</b>{" "}
              (duas vezes, com o mando invertido).
            </li>
            <li>
              Os confrontos são <b>gerados automaticamente</b> depois do draft: ninguém joga duas vezes na mesma rodada
              e, com número ímpar de times, <b>um time folga</b> em cada rodada. Com 5 times, segue o calendário
              publicado (na ordem de cadastro dos times).
            </li>
            <li>
              Partidas em <b>MD1</b> ou <b>MD3</b>; pontos por vitória e por derrota configuráveis.
            </li>
            <li>
              A organização pode <b>editar o calendário</b> (mudar a rodada, inverter o mando) e gerar de novo enquanto
              nenhum jogo tiver data.
            </li>
            <li>
              A <b>Tabela de jogos</b> (aba Calendário) mostra as rodadas em colunas, cada jogo numerado com a data e a
              hora (ou o placar), e a chave dos playoffs ligada até o campeão.
            </li>
          </ul>
          <Here>
            {GROUP_FORMAT_LABEL[c.groupFormat]}, MD{c.groupBestOf}: {games} jogos em {rounds} rodadas, {perTeam} por
            time. Vitória {c.pointsWin} {c.pointsWin === 1 ? "ponto" : "pontos"}, derrota {c.pointsLoss}.
          </Here>
        </Section>

        <Section id="agenda" icon={CalendarClock} title="Agendamento dos jogos">
          <ol>
            <li>
              A organização gera os confrontos; cada jogo começa como <b>Aguardando agendamento</b>.
            </li>
            <li>
              Um dos capitães <b>propõe data e hora</b> (pode deixar um recado).
            </li>
            <li>
              O capitão adversário <b>aceita</b> ou <b>recusa</b> — e pode propor outra.
            </li>
            <li>
              Com o aceite, a organização <b>aprova</b> e define o servidor (ou o site pega o primeiro livre).
            </li>
          </ol>
          <p>O site confere em cada proposta, aceite e aprovação:</p>
          <ul>
            <li>
              se a data cai nos <b>dias e horários permitidos</b> (horário de Brasília);
            </li>
            <li>
              se nenhum dos times já tem <b>outro jogo no mesmo horário</b>;
            </li>
            <li>
              se há <b>servidor livre</b>: no máximo um jogo por servidor e nunca mais jogos simultâneos do que
              servidores. Cada jogo reserva {matchMinutes(1)} minutos por mapa possível (MD1 {matchMinutes(1)} min, MD3{" "}
              {matchMinutes(3) / 60} h).
            </li>
          </ul>
          <p>
            A organização também pode <b>marcar direto</b> (sem passar pelos capitães), <b>adiar</b>, <b>cancelar</b> e{" "}
            <b>reabrir</b> jogos. A aba <b>Agendamento</b> mostra um contador do que está esperando você.
          </p>
          <div className="grid gap-1.5 sm:grid-cols-2">
            {(Object.keys(MATCH_STATUS_LABEL) as MatchStatus[]).map((s) => (
              <div key={s} className="rounded-md border border-border px-3 py-2">
                <div className="text-xs font-semibold text-fg">{MATCH_STATUS_LABEL[s]}</div>
                <div className="text-xs">{STATUS_HELP[s]}</div>
              </div>
            ))}
          </div>
          <Here>
            {formatDays(c.matchDays)}, das {c.windowStart} às {c.windowEnd}, com até {c.servers}{" "}
            {c.servers === 1 ? "servidor" : "servidores"}.
          </Here>
        </Section>

        <Section id="resultados" icon={Download} title="Resultados e GC">
          <ul>
            <li>
              Os jogos são na <b>Gamers Club</b>. Na página da partida na GC, a organização clica no favorito{" "}
              <b>Enviar ao MeuMix</b> (o mesmo dos mixes; dá para instalar na página do jogo).
            </li>
            <li>
              A partida vai para uma <b>fila no navegador</b> (até 20 partidas). Na página do jogo, em{" "}
              <b>Importar da GC</b>, escolhe-se a partida e o mapa. Dá para enviar a rodada inteira e importar depois.
            </li>
            <li>
              Os jogadores são reconhecidos pelo <b>ID da GC</b> já ligado ou pela <b>Steam</b>; o site descobre sozinho
              qual lado da GC é o mandante pelos elencos (se não der, a organização escolhe).
            </li>
            <li>
              <b>MD3</b>: cada mapa é uma partida separada na GC. Os mapas entram em ordem e quem fizer 2 vence; o jogo
              finaliza sozinho.
            </li>
            <li>
              Também dá para <b>digitar o placar</b> (sem empate; o vencedor precisa de 13 rounds ou mais; W.O. 13×0),
              corrigir um mapa digitado e apagar o último mapa. Placar digitado não traz estatísticas.
            </li>
            <li>A mesma partida da GC não entra duas vezes no campeonato.</li>
          </ul>
        </Section>

        <Section id="classificacao" icon={BarChart3} title="Classificação e desempate">
          <p>
            Atualiza sozinha a cada resultado: partidas, vitórias, derrotas, pontos, rounds vencidos e perdidos, saldo e
            aproveitamento (pontos conquistados ÷ possíveis). Critérios, em ordem:
          </p>
          <ol>
            <li>
              <b>Pontos</b>.
            </li>
            <li>
              <b>Confronto direto</b> quando dois times empatam; com três ou mais, <b>mini-classificação</b> só com os
              jogos entre eles.
            </li>
            <li>
              <b>Saldo de rounds</b>.
            </li>
            <li>
              <b>Rounds vencidos</b>.
            </li>
            <li>Ordem da lista de times (a do draft), para nunca ficar empate.</li>
          </ol>
          {cut > 0 && <Here>Os {cut} primeiros vão aos playoffs (verde); os demais são eliminados (vermelho).</Here>}
        </Section>

        <Section id="playoffs" icon={GitBranch} title="Playoffs">
          <p>Formatos possíveis (o melhor colocado é sempre o mandante):</p>
          <ul>
            <li>
              <b>Sem playoffs</b>: vale a classificação.
            </li>
            <li>
              <b>Final</b>: 1º × 2º.
            </li>
            <li>
              <b>Semifinais e final</b>: 1º × 4º e 2º × 3º.
            </li>
            <li>
              <b>Quartas</b>: 1×8, 4×5, 2×7, 3×6.
            </li>
            <li>
              <b>Oitavas</b>: 1×16, 8×9, 4×13, 5×12, 2×15, 7×10, 3×14, 6×11.
            </li>
          </ul>
          <ul>
            <li>
              A organização <b>gera a chave</b> quando todos os jogos da classificatória terminam (ou são cancelados).
              Dá para refazer enquanto nenhum jogo dos playoffs tiver placar.
            </li>
            <li>
              O <b>vencedor avança sozinho</b> para o jogo seguinte (o vencedor do jogo de cima é o mandante). Se o
              resultado for desfeito, a vaga volta a ficar em aberto.
            </li>
            <li>Os jogos dos playoffs entram no Calendário e são agendados do mesmo jeito.</li>
          </ul>
          <Here>
            {PLAYOFF_FORMAT_LABEL[c.playoffFormat]}
            {c.playoffFormat !== "none" && `, em MD${c.playoffBestOf}`}.
          </Here>
        </Section>

        <Section id="estatisticas" icon={Trophy} title="Estatísticas e MVP">
          <ul>
            <li>
              Vêm só dos mapas <b>importados da GC neste campeonato</b> (placar digitado não traz estatísticas).
            </li>
            <li>
              <b>MVP</b>: maior rating médio. Nas médias (rating, K/D, ADR, % de HS) entra quem jogou pelo menos{" "}
              <b>metade dos mapas</b> de quem mais jogou; totais (kills, headshots) valem para todos.
            </li>
            <li>
              Também: melhor jogador por mapa, equipes com mais rounds vencidos e melhor aproveitamento, a tabela de
              todos os jogadores e uma página de cada jogador no campeonato (com o histórico mapa a mapa).
            </li>
          </ul>
        </Section>

        <Section id="premiacao" icon={Coins} title="Premiação">
          <ul>
            <li>
              <b>Arrecadação</b> = inscrição × inscrições pagas. O pagamento é feito fora do site; a organização informa
              quantas foram pagas (em branco, conta os inscritos).
            </li>
            <li>
              <b>Total distribuído</b> = arrecadação − custos operacionais, dividido pelos percentuais de cada colocação
              (centavos que sobram ficam com o 1º).
            </li>
            <li>
              <b>Colocação</b>: campeão e vice pela final; os eliminados nas semifinais (e fases anteriores) ficam na
              ordem da classificatória; os demais, pela classificação.
            </li>
          </ul>
          <Here>
            {formatMoney(c.entryFee)} por jogador × {players} = {formatMoney(prize.collected)}
            {c.costs > 0 && ` − ${formatMoney(c.costs)} de custos`} →{" "}
            {prize.prizes
              .map((p, i) => `${i + 1}º ${formatMoney(p)} (${c.prizeSplit[i]?.toLocaleString("pt-BR")}%)`)
              .join(" · ")}
            .
          </Here>
        </Section>

        <Section id="duvidas" icon={HelpCircle} title="Dúvidas comuns">
          <ul>
            <li>
              <b>O capitão não apareceu na adedonha ou no draft.</b> A organização joga ou escolhe por ele; no log
              aparece que foi a organização.
            </li>
            <li>
              <b>Escolheram o jogador errado.</b> A organização desfaz a última escolha e o capitão escolhe de novo.
            </li>
            <li>
              <b>O adversário não responde a proposta.</b> A organização pode marcar o jogo direto.
            </li>
            <li>
              <b>Um jogador da GC veio sem vínculo.</b> O placar entra normalmente; as estatísticas dele só contam
              depois que o ID da GC estiver ligado à conta (pela finalização de um mix ou pela Steam vinculada).
            </li>
            <li>
              <b>Importei a partida no jogo errado.</b> Apague o mapa (o último) e importe no jogo certo.
            </li>
            <li>
              <b>O campeonato mexe no meu ELO?</b> Não. Nada do campeonato altera os mixes.
            </li>
          </ul>
          <p className="flex items-center gap-2 text-xs text-subtle">
            <Hand className="size-3.5" aria-hidden /> Dúvidas sobre regras específicas deste campeonato: fale com a
            organização.
          </p>
        </Section>
      </div>
    </div>
  );
}
