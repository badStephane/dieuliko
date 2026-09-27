import type { Metadata } from "next";
import localFont from "next/font/local";
import { SITE } from "@/config/site";
import { Footer } from "@/components/layout/Footer";
import { Header } from "@/components/layout/Header";
import "./globals.css";

// Same static Google Fonts files the Framer original serves (the variable versions wrap text slightly differently).
const redditSans = localFont({
  variable: "--font-reddit-sans",
  src: [
    { path: "./fonts/reddit-600.woff2", weight: "600", style: "normal" },
    { path: "./fonts/reddit-700.woff2", weight: "700", style: "normal" },
    { path: "./fonts/reddit-800.woff2", weight: "800", style: "normal" },
  ],
});

const hankenGrotesk = localFont({
  variable: "--font-hanken-grotesk",
  src: [
    { path: "./fonts/hanken-400.woff2", weight: "400", style: "normal" },
    { path: "./fonts/hanken-400-italic.woff2", weight: "400", style: "italic" },
    { path: "./fonts/hanken-500.woff2", weight: "500", style: "normal" },
    { path: "./fonts/hanken-600.woff2", weight: "600", style: "normal" },
    { path: "./fonts/hanken-700.woff2", weight: "700", style: "normal" },
  ],
});

export const metadata: Metadata = {
  title: {
    default: `${SITE.name} — ${SITE.tagline}`,
    template: `%s | ${SITE.name}`,
  },
  description: SITE.description,
  openGraph: { siteName: SITE.name, locale: SITE.locale, type: "website" },
};

export default function RootLayout({ children }: LayoutProps<"/">) {
  return (
    <html lang="fr" className={`${redditSans.variable} ${hankenGrotesk.variable}`}>
      <body className="flex min-h-screen flex-col">
        <Header />
        <main className="flex-1">{children}</main>
        <Footer />
      </body>
    </html>
  );
}
