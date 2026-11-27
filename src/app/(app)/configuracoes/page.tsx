import { redirect } from "next/navigation";

/** Configurações agora fica em Minha conta (links e avisos antigos continuam funcionando). */
export default function SettingsPage() {
  redirect("/conta");
}
