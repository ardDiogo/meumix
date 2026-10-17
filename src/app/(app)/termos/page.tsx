import type { Metadata } from "next";
import Link from "next/link";
import { ContactEmail, LegalPage, Section } from "@/components/legal/legal-page";
import { LEGAL } from "@/lib/legal";

export const metadata: Metadata = { title: "Termos de Uso" };

export default function TermsPage() {
  return (
    <LegalPage title="Termos de Uso">
      <p>
        Estes termos regem o uso do <strong>MeuMix</strong>, plataforma gratuita de organização de mixes de
        Counter-Strike 2 mantida por {LEGAL.controller}. Ao criar uma conta você concorda com eles e com a{" "}
        <Link href="/privacidade">Política de Privacidade</Link>.
      </p>

      <Section title="1. Conta">
        <ul className="list-disc space-y-1 pl-5">
          <li>Você precisa ter 18 anos ou mais e informar um e-mail válido.</li>
          <li>Uma conta por pessoa. Não compartilhe sua senha nem o seu link pessoal de confirmação.</li>
          <li>Você é responsável pelo que for feito com a sua conta; avise-nos se suspeitar de uso indevido.</li>
        </ul>
      </Section>

      <Section title="2. O que é público">
        <p>
          Nick, foto, nível, ELO, estatísticas, histórico de partidas, insígnias, clipes e as contas que você vincular
          (Steam, Twitch, CSRep) aparecem para qualquer visitante. Isso faz parte do serviço: rankings, placares e
          equilíbrio de times dependem disso.
        </p>
      </Section>

      <Section title="3. Mixes, ELO e penalidades">
        <ul className="list-disc space-y-1 pl-5">
          <li>Os organizadores definem datas, regras de inscrição, sorteio de times e mapas.</li>
          <li>
            O ELO e o nível são calculados pelos resultados e podem ser ajustados pelos administradores para corrigir
            erros ou equilibrar a comunidade.
          </li>
          <li>
            Faltas, atrasos e desistências podem gerar penalidades (por exemplo, atraso para se inscrever no próximo
            mix).
          </li>
        </ul>
      </Section>

      <Section title="4. Conduta">
        <p>É proibido:</p>
        <ul className="list-disc space-y-1 pl-5">
          <li>usar cheats, contas de terceiros ou combinar resultados;</li>
          <li>ofender, discriminar ou assediar outros jogadores;</li>
          <li>enviar clipes ou conteúdos de terceiros sem direito de uso, ou conteúdos ilegais;</li>
          <li>tentar acessar dados ou funções sem permissão, sobrecarregar ou burlar o site.</li>
        </ul>
        <p>Violações podem levar a penalidades, remoção de conteúdo ou exclusão da conta.</p>
      </Section>

      <Section title="5. Conteúdo que você envia">
        <p>
          Ao enviar clipes, links ou prints, você declara ter o direito de compartilhá-los e autoriza o MeuMix a
          exibi-los na plataforma. Você pode excluir seus clipes a qualquer momento.
        </p>
      </Section>

      <Section title="6. Serviços de terceiros">
        <p>
          Integrações com Steam, Twitch, Gamers Club, Faceit, Allstar e CSRep dependem desses serviços e podem parar de
          funcionar sem aviso. O MeuMix não tem vínculo com eles.
        </p>
      </Section>

      <Section title="7. Disponibilidade e responsabilidade">
        <p>
          O MeuMix é oferecido gratuitamente, “no estado em que se encontra”, sem garantia de funcionamento contínuo.
          Fazemos o possível para manter os dados corretos e seguros, mas não respondemos por resultados de partidas,
          decisões dos organizadores ou falhas de serviços de terceiros.
        </p>
      </Section>

      <Section title="8. Encerramento">
        <p>
          Você pode excluir sua conta a qualquer momento em <Link href="/conta">Minha conta</Link>. Podemos suspender ou
          encerrar contas que violem estes termos.
        </p>
      </Section>

      <Section title="9. Contato e alterações">
        <p>
          Dúvidas: <ContactEmail />. Podemos atualizar estes termos; a versão e a data ficam no topo da página e
          mudanças relevantes serão avisadas no site. Aplica-se a lei brasileira.
        </p>
      </Section>
    </LegalPage>
  );
}
