import type { IntegrationProvider, IntegrationStatus } from "@/types/domain";

export interface IntegrationInfo {
  provider: IntegrationProvider;
  name: string;
  description: string;
  status: IntegrationStatus;
}

/**
 * Catálogo de integrações externas. O status reflete honestamente na
 * interface o que já funciona.
 */
export const INTEGRATIONS: IntegrationInfo[] = [
  {
    provider: "steam",
    name: "Steam",
    description: "Cole o link do seu perfil Steam em Perfil para importar a foto e o Steam ID.",
    status: "available",
  },
  {
    provider: "csrep",
    name: "CSRep",
    description: "Consultar reputação e histórico competitivo dos jogadores.",
    status: "not_implemented",
  },
  {
    provider: "twitch",
    name: "Twitch",
    description: "Vincular transmissões e importar clipes dos mixes.",
    status: "not_implemented",
  },
];
