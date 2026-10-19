import type { Metadata, Viewport } from "next";
import { Chakra_Petch, Inter } from "next/font/google";
import { Toaster } from "sonner";
import { PwaRegister } from "@/components/pwa/pwa";
import "./globals.css";

const inter = Inter({ subsets: ["latin"], variable: "--font-inter", display: "swap" });
const chakra = Chakra_Petch({
  subsets: ["latin"],
  weight: ["500", "600", "700"],
  variable: "--font-chakra",
  display: "swap",
});

export const metadata: Metadata = {
  title: { default: "MeuMix", template: "%s · MeuMix" },
  description: "Plataforma para organizar mixes de CS2, acompanhar desempenho e construir comunidades competitivas.",
  applicationName: "MeuMix",
  // App instalado no iPhone (Adicionar à Tela de Início).
  appleWebApp: { capable: true, title: "MeuMix", statusBarStyle: "black" },
  formatDetection: { telephone: false },
};

export const viewport: Viewport = {
  themeColor: "#08090B",
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="pt-BR" className={`${inter.variable} ${chakra.variable}`}>
      <body>
        {children}
        <PwaRegister />
        <Toaster
          theme="dark"
          position="bottom-right"
          toastOptions={{
            classNames: {
              toast: "!bg-surface-2 !border-border !text-fg !rounded-md",
              description: "!text-muted",
            },
          }}
        />
      </body>
    </html>
  );
}
