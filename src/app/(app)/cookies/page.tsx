import type { Metadata } from "next";
import { ContactEmail, LegalPage, Section } from "@/components/legal/legal-page";

export const metadata: Metadata = { title: "Política de Cookies" };

const COOKIES = [
  ["sb-…-auth-token", "Necessário", "Mantém você conectado (sessão do login).", "Até sair ou expirar"],
  ["mm-remember", "Necessário", "Lembra se você marcou “Lembrar de mim”.", "Conforme a escolha"],
  ["mm_confirm", "Necessário", "Link pessoal: confirma presença no mix sem login.", "1 ano (ou até sair)"],
] as const;

export default function CookiesPage() {
  return (
    <LegalPage title="Política de Cookies">
      <p>
        O MeuMix usa <strong>apenas cookies necessários</strong> para o site funcionar. Não usamos cookies de
        publicidade, de rastreamento nem de análise de terceiros — por isso não pedimos consentimento para cookies.
      </p>

      <Section title="Cookies que usamos">
        <div className="overflow-x-auto">
          <table className="w-full min-w-[32rem] text-left text-sm">
            <thead className="text-xs text-subtle uppercase">
              <tr>
                <th className="py-2 pr-3 font-semibold">Nome</th>
                <th className="py-2 pr-3 font-semibold">Tipo</th>
                <th className="py-2 pr-3 font-semibold">Para quê</th>
                <th className="py-2 font-semibold">Duração</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-border">
              {COOKIES.map(([name, type, purpose, duration]) => (
                <tr key={name}>
                  <td className="py-2 pr-3 font-mono text-xs text-fg">{name}</td>
                  <td className="py-2 pr-3">{type}</td>
                  <td className="py-2 pr-3">{purpose}</td>
                  <td className="py-2">{duration}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </Section>

      <Section title="Armazenamento local do navegador">
        <p>
          O site guarda no seu navegador (localStorage) se a música de fundo está muda e uma inscrição pendente na fila,
          para não perder sua vez. Nada disso é enviado a terceiros.
        </p>
      </Section>

      <Section title="Conteúdo incorporado">
        <p>
          Lives, gravações e clipes da Twitch e do Allstar tocam dentro do site por players desses serviços, que podem
          usar os próprios cookies conforme as políticas deles.
        </p>
      </Section>

      <Section title="Como controlar">
        <p>
          Você pode apagar os cookies nas configurações do navegador; isso desconecta sua conta. Dúvidas:{" "}
          <ContactEmail />.
        </p>
      </Section>
    </LegalPage>
  );
}
