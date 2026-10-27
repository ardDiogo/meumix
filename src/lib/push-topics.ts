/** Tipos de aviso no celular; cada aparelho escolhe quais quer receber. */
export const PUSH_TOPICS = [
  { key: "inscricoes", label: "Inscrições", description: "Lista abrindo em instantes e vagas sobrando" },
  {
    key: "pick",
    label: "Votação, capitães e PICK",
    description: "Lista fechada para votar, capitães definidos e cada pick do mix",
  },
  { key: "bolao", label: "Bolão", description: "Times definidos e bolão fechando" },
  { key: "resultado", label: "Resultado", description: "Seu ELO no mix e seus pontos no bolão" },
  { key: "live", label: "Ao vivo na Twitch", description: "Quando um jogador do MeuMix abre a live" },
] as const;

export type PushTopic = (typeof PUSH_TOPICS)[number]["key"];

export const ALL_TOPICS: PushTopic[] = PUSH_TOPICS.map((t) => t.key);

export const isPushTopic = (v: unknown): v is PushTopic => ALL_TOPICS.includes(v as PushTopic);
