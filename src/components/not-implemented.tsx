"use client";

import { toast } from "sonner";
import { Button, type ButtonProps } from "./ui/button";

/**
 * Botão para ações ainda não implementadas: em vez de parecer funcionar,
 * informa claramente o usuário.
 */
export function NotImplementedButton({ feature, children, ...props }: ButtonProps & { feature: string }) {
  return (
    <Button
      {...props}
      onClick={() =>
        toast.info(`${feature} ainda não está disponível`, {
          description: "Esta funcionalidade será habilitada nas próximas versões do MeuMix.",
        })
      }
    >
      {children}
    </Button>
  );
}
