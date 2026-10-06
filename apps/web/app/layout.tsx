import type { Metadata, Viewport } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "JARVIS — segundo cérebro",
  description: "Capture, conecte e converse com tudo que você aprende.",
  manifest: "/manifest.webmanifest",
};

export const viewport: Viewport = { themeColor: "#1e1e1e" };

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="pt-BR" className="h-full antialiased">
      <body className="min-h-full">{children}</body>
    </html>
  );
}
