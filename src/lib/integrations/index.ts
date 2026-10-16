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
    description:
      "Link do perfil no CSRep (montado pela Steam) e análise por IA do print da tela Overview: pontos fortes, fracos e sugestões de treino. Informativo, fora do ELO.",
    status: "available",
  },
  {
    provider: "twitch",
    name: "Twitch",
    description: "Vincular transmissões e importar clipes dos mixes.",
    status: "not_implemented",
  },
];
