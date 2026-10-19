import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "Contínuo — Goodea Studio",
  description: "Da primeira cena ao filme completo. Biblioteca oficial, roteiro e continuidade em um só estúdio.",
  icons: {
    icon: "/favicon.svg",
    shortcut: "/favicon.svg",
  },
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="pt-BR">
      <body className="antialiased">{children}</body>
    </html>
  );
}
