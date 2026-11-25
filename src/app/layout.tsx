import type { Metadata } from "next";
import { Geist, Geist_Mono } from "next/font/google";
import { I18nProvider } from "@/lib/i18n";
import "./globals.css";

const geistSans = Geist({
  variable: "--font-geist-sans",
  subsets: ["latin"],
});

const geistMono = Geist_Mono({
  variable: "--font-geist-mono",
  subsets: ["latin"],
});

const appTitle = "Biashara Mkononi — Biashara yako. Udhibiti wako. Popote.";
const appDescription =
  "Biashara Mkononi ni mfumo wa usimamizi wa biashara za Tanzania uliotengenezwa na LESNEDY Solution: mauzo, bidhaa, stoo, wateja na ripoti sehemu moja.";

export const metadata: Metadata = {
  title: {
    default: appTitle,
    template: "%s | Biashara Mkononi",
  },
  description: appDescription,
  applicationName: "Biashara Mkononi",
  icons: {
    icon: "/favicon.ico",
  },
  openGraph: {
    type: "website",
    siteName: "Biashara Mkononi",
    title: appTitle,
    description: appDescription,
  },
  twitter: {
    card: "summary",
    title: appTitle,
    description: appDescription,
  },
};

export default function RootLayout({ children }: LayoutProps<"/">) {
  return (
    <html
      lang="sw"
      className={`${geistSans.variable} ${geistMono.variable} h-full antialiased`}
    >
      <body className="min-h-full flex flex-col">
        <I18nProvider>{children}</I18nProvider>
      </body>
    </html>
  );
}
