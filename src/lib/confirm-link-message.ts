/** Mensagem (WhatsApp) que acompanha o link pessoal de confirmação. */
export function confirmLinkMessage(url: string, name?: string) {
  return [
    `${name ? `Fala, ${name}! ` : ""}Esse é o seu link pessoal do MeuMix 🎮`,
    "Abra uma vez neste celular: depois é só tocar no link do grupo para confirmar presença, sem login.",
    url,
    "",
    "⚠️ Não repasse: quem tiver o link confirma presença no seu nome.",
  ].join("\n");
}
