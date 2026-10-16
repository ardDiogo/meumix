"use client";

import { createContext, useContext } from "react";
import { LEVELS, type LevelDef } from "@/lib/levels";

const LevelsContext = createContext<readonly LevelDef[]>(LEVELS);

/** Disponibiliza as faixas de nível configuradas no admin para os componentes. */
export function LevelsProvider({ levels, children }: { levels: readonly LevelDef[]; children: React.ReactNode }) {
  return <LevelsContext.Provider value={levels}>{children}</LevelsContext.Provider>;
}

export const useLevels = () => useContext(LevelsContext);
