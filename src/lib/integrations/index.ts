import type { IntegrationProvider, IntegrationStatus } from "@/types/domain";

export interface IntegrationInfo {
  provider: IntegrationProvider;
  name: string;
  description: string;
  status: IntegrationStatus;
}

/**
 * Catálogo de integrações externas planejadas. Nenhuma está implementada;
 * o status reflete isso honestamente na interface.
 */
export const INTEGRATIONS: IntegrationInfo[] = [
  {
    provider: "steam",
    name: "Steam",
    description: "Vincular conta via Steam OpenID, importar avatar, nickname e Steam ID.",
    status: "not_implemented",
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
