import type { Metadata } from "next";

import { I18nProvider } from "@/lib/i18n";
import { sitePath } from "@/lib/site-url";

import "./globals.css";

export const metadata: Metadata = {
  title: "ClawCross — Workflow Community",
  description: "Community Workflow Marketplace",
  metadataBase: new URL(process.env.NEXT_PUBLIC_SITE_URL || "https://clawcross.net"),
  alternates: {
    canonical: "/"
  },
  openGraph: {
    url: process.env.NEXT_PUBLIC_SITE_URL || "https://clawcross.net",
    siteName: "ClawCross",
    title: "ClawCross — Workflow Community",
    description: "Community Workflow Marketplace"
  },
  icons: {
    icon: sitePath("/icon.svg")
  }
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="zh-CN">
      <body>
        <I18nProvider>{children}</I18nProvider>
      </body>
    </html>
  );
}
