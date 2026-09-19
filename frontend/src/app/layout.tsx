import type { Metadata, Viewport } from "next";
import "./globals.css";
import { ServiceWorkerRegister } from "@/components/pwa/ServiceWorkerRegister";

/**
 * metadataBase vem de NEXT_PUBLIC_SITE_URL (opcional): sem ela o Next monta as
 * URLs de Open Graph relativas, o que quebra a previa em WhatsApp/Slack. Em
 * producao, defina com a URL final do site.
 */
const siteUrl = process.env.NEXT_PUBLIC_SITE_URL;

export const metadata: Metadata = {
  ...(siteUrl ? { metadataBase: new URL(siteUrl) } : {}),
  title: {
    default: "FluxPay — Gateway de pagamentos PIX",
    template: "%s · FluxPay",
  },
  description:
    "Cobranças PIX, checkout hospedado, webhooks assinados e painel em tempo real. API para desenvolvedores, painel para o time financeiro.",
  applicationName: "FluxPay",
  manifest: "/manifest.webmanifest",
  icons: {
    icon: [
      { url: "/favicon.ico", sizes: "any" },
      { url: "/icons/icon-192.png", type: "image/png", sizes: "192x192" },
    ],
    apple: [{ url: "/icons/apple-touch-icon.png", sizes: "180x180" }],
  },
  appleWebApp: {
    capable: true,
    title: "FluxPay",
    statusBarStyle: "black-translucent",
  },
  formatDetection: { telephone: false },
  openGraph: {
    type: "website",
    siteName: "FluxPay",
    locale: "pt_BR",
    title: "FluxPay — Gateway de pagamentos PIX",
    description:
      "Cobranças PIX, checkout hospedado, webhooks assinados e painel em tempo real.",
    images: [{ url: "/og-image.png", width: 1200, height: 630, alt: "FluxPay" }],
  },
  twitter: {
    card: "summary_large_image",
    title: "FluxPay — Gateway de pagamentos PIX",
    description:
      "Cobranças PIX, checkout hospedado, webhooks assinados e painel em tempo real.",
    images: ["/og-image.png"],
  },
  robots: { index: true, follow: true },
};

export const viewport: Viewport = {
  themeColor: "#0A0A0A",
  colorScheme: "dark",
  width: "device-width",
  initialScale: 1,
  // viewport-fit=cover: sem isso o app instalado no iPhone deixa faixas
  // brancas no notch e na barra inferior.
  viewportFit: "cover",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="pt-BR">
      <body className="antialiased">
        {children}
        <ServiceWorkerRegister />
      </body>
    </html>
  );
}
