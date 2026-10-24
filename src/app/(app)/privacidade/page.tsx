import type { Metadata } from "next";
import Link from "next/link";
import { ContactEmail, LegalPage, Section } from "@/components/legal/legal-page";
import { LEGAL } from "@/lib/legal";

export const metadata: Metadata = { title: "Política de Privacidade" };

export default function PrivacyPage() {
  return (
    <LegalPage title="Política de Privacidade">
      <p>
        Esta política explica quais dados pessoais o <strong>MeuMix</strong> — plataforma de organização de mixes de
        Counter-Strike 2 — trata, para quê, com quem compartilha, por quanto tempo guarda e como você exerce seus
        direitos, conforme a Lei Geral de Proteção de Dados (Lei nº 13.709/2018, “LGPD”).
      </p>

      <Section title="1. Quem é o responsável">
        <p>
          O controlador dos dados é {LEGAL.controller}. Contato para qualquer assunto de privacidade, inclusive pedidos
          do titular: <ContactEmail />.
        </p>
      </Section>

      <Section title="2. Quais dados tratamos e por quê">
        <ul className="list-disc space-y-2 pl-5">
          <li>
            <strong>Conta:</strong> e-mail e senha (guardada só como hash), para login, recuperação de senha e avisos da
            conta. <em>Base legal: execução do contrato (art. 7º, V).</em>
          </li>
          <li>
            <strong>Perfil público:</strong> nick, nível, ELO, estatísticas, histórico de partidas, insígnias e clipes,
            que aparecem para qualquer visitante — é a finalidade do serviço (ranking, placares e equilíbrio de times).{" "}
            <em>Base legal: execução do contrato.</em>
          </li>
          <li>
            <strong>Nome completo (opcional):</strong> visível só para os administradores, para identificar os
            participantes. <em>Base legal: legítimo interesse (art. 7º, IX).</em>
          </li>
          <li>
            <strong>Contas que você vincula (opcional):</strong> Steam (SteamID, link e foto), canal da Twitch e link do
            CSRep, usados para foto do perfil, transmissões, clipes e análises que você pede. Você pode desvincular a
            qualquer momento. <em>Base legal: execução do contrato, a seu pedido.</em>
          </li>
          <li>
            <strong>Participação nos mixes:</strong> inscrições, votos de mapa e capitão, palpites do bolão (que ficam
            visíveis para todos depois que o bolão fecha), penalidades por faltas e atrasos.{" "}
            <em>Base legal: execução do contrato; penalidades por legítimo interesse.</em>
          </li>
          <li>
            <strong>Avisos no celular (opcional):</strong> o endereço de entrega e as chaves de criptografia que o
            navegador do seu aparelho gera ao ativar os avisos, o navegador usado e os tipos de aviso escolhidos. Você
            desativa em Configurações. <em>Base legal: consentimento (art. 7º, I).</em>
          </li>
          <li>
            <strong>Registros de segurança:</strong> endereço IP, navegador, tipo de aparelho e horários das inscrições,
            e o registro das ações administrativas, para prevenir fraudes na fila de inscrição e apurar incidentes.{" "}
            <em>
              Base legal: legítimo interesse e, quando aplicável, guarda de registros de acesso (Marco Civil, art. 15).
            </em>
          </li>
          <li>
            <strong>Crônica do mix:</strong> texto bem-humorado sobre cada mix finalizado, escrito por inteligência
            artificial a partir dos nicks e das estatísticas da partida (os mesmos dados públicos do placar).
          </li>
          <li>
            <strong>Prints de placares:</strong> imagens enviadas por administradores para ler o placar com inteligência
            artificial. As imagens não são guardadas; só o resultado.
          </li>
        </ul>
        <p>Não vendemos dados, não usamos publicidade e não fazemos perfilamento para fins comerciais.</p>
      </Section>

      <Section title="3. Com quem compartilhamos">
        <ul className="list-disc space-y-2 pl-5">
          <li>
            <strong>Supabase</strong> (banco de dados e login), <strong>Vercel</strong> (hospedagem) e{" "}
            <strong>Google</strong> (envio de e-mails pelo Gmail; leitura de prints e escrita da crônica do mix pela IA
            Gemini) — fornecedores que tratam os dados em nosso nome. Alguns ficam fora do Brasil (principalmente nos
            EUA); a transferência segue as garantias contratuais desses fornecedores (LGPD, art. 33).
          </li>
          <li>
            <strong>Steam, Twitch, Faceit, Allstar e CSRep:</strong> consultamos dados públicos usando o identificador
            que você vinculou (SteamID, canal ou sala). Não enviamos seu e-mail nem outros dados a eles.
          </li>
          <li>
            <strong>Serviço de avisos do seu navegador</strong> (Google, Apple ou Mozilla), se você ativar os avisos:
            recebe cada aviso criptografado só para entregá-lo ao seu aparelho.
          </li>
          <li>Autoridades, quando houver obrigação legal ou ordem judicial.</li>
        </ul>
      </Section>

      <Section title="4. Por quanto tempo guardamos">
        <ul className="list-disc space-y-2 pl-5">
          <li>Conta, perfil e contas vinculadas: enquanto a conta existir.</li>
          <li>
            Ao excluir a conta: perfil, inscrições, votos, palpites, aparelhos com avisos, crônicas dos mixes que você
            jogou, clipes, insígnias, penalidades e histórico de ELO são apagados. Nos placares de mixes já jogados, o
            nick passa a aparecer como “Jogador removido”, para não alterar os resultados dos demais jogadores.
          </li>
          <li>Aparelhos com avisos: até você desativar (ou o navegador invalidar o endereço).</li>
          <li>IP e navegador dos registros de segurança: até 6 meses.</li>
          <li>Registro de ações administrativas: até 24 meses, sem dados que identifiquem quem excluiu a conta.</li>
          <li>Cópias de segurança: apagadas conforme o ciclo de backups (até 6 meses).</li>
        </ul>
      </Section>

      <Section title="5. Seus direitos">
        <p>
          Você pode pedir confirmação e acesso aos seus dados, correção, anonimização ou eliminação, portabilidade,
          informação sobre compartilhamentos e revisão de decisões — e se opor a tratamentos baseados em legítimo
          interesse (LGPD, art. 18). Pelo próprio site, em <Link href="/conta">Minha conta</Link>, você:
        </p>
        <ul className="list-disc space-y-1 pl-5">
          <li>baixa uma cópia dos seus dados (arquivo JSON);</li>
          <li>exclui a sua conta;</li>
          <li>altera a senha e, em Configurações, desvincula Steam, Twitch e CSRep.</li>
        </ul>
        <p>
          Outros pedidos: <ContactEmail />. Respondemos em até 15 dias. Você também pode reclamar à Autoridade Nacional
          de Proteção de Dados (ANPD).
        </p>
      </Section>

      <Section title="6. Segurança">
        <p>
          Senhas guardadas como hash, conexões criptografadas (HTTPS), controle de acesso no banco de dados (cada
          usuário só altera o que é dele; ações administrativas só no servidor) e registro das ações sensíveis. Em caso
          de incidente de segurança com risco relevante, avisaremos os titulares afetados e a ANPD.
        </p>
      </Section>

      <Section title="7. Cookies">
        <p>
          Usamos apenas cookies necessários para login e para o link pessoal de confirmação. Detalhes na{" "}
          <Link href="/cookies">Política de Cookies</Link>.
        </p>
      </Section>

      <Section title="8. Menores de idade">
        <p>
          O MeuMix não é direcionado a menores de 18 anos. Se você é responsável por um menor que criou uma conta, peça
          a exclusão pelo e-mail acima.
        </p>
      </Section>

      <Section title="9. Mudanças">
        <p>
          Podemos atualizar esta política. A versão e a data ficam no topo da página; mudanças relevantes serão avisadas
          no site.
        </p>
      </Section>
    </LegalPage>
  );
}
