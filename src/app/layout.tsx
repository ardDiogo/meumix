import type { Metadata, Viewport } from "next";
import { Chakra_Petch, Inter } from "next/font/google";
import { Toaster } from "sonner";
import { PwaRegister } from "@/components/pwa/pwa";
import { AppRefresh } from "@/components/pwa/app-refresh";
import "./globals.css";

const inter = Inter({ subsets: ["latin"], variable: "--font-inter", display: "swap" });
const chakra = Chakra_Petch({
  subsets: ["latin"],
  weight: ["500", "600", "700"],
  variable: "--font-chakra",
  display: "swap",
});

/** Endereço público do site (links e imagens da prévia no WhatsApp precisam ser absolutos). */
const SITE_URL = process.env.VERCEL_PROJECT_PRODUCTION_URL
  ? `https://${process.env.VERCEL_PROJECT_PRODUCTION_URL}`
  : "https://meumix.vercel.app";

const DESCRIPTION =
  "Plataforma para organizar mixes de CS2, acompanhar desempenho e construir comunidades competitivas.";

export const metadata: Metadata = {
  metadataBase: new URL(SITE_URL),
  title: { default: "MeuMix", template: "%s · MeuMix" },
  description: DESCRIPTION,
  applicationName: "MeuMix",
  // Prévia do link (WhatsApp, Discord…): o ícone do MeuMix, em vez do ícone genérico.
  openGraph: {
    type: "website",
    siteName: "MeuMix",
    locale: "pt_BR",
    title: "MeuMix",
    description: DESCRIPTION,
    images: [{ url: "/pwa/icon-512.png", width: 512, height: 512, alt: "MeuMix" }],
  },
  twitter: { card: "summary", images: ["/pwa/icon-512.png"] },
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
        <AppRefresh />
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
