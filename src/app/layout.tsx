import type { Metadata } from "next";
import Link from "next/link";
import { Plus_Jakarta_Sans } from "next/font/google";
import "./globals.css";

const jakarta = Plus_Jakarta_Sans({
  subsets: ["latin"],
  weight: ["400", "500", "600", "700"],
  variable: "--font-jakarta",
  display: "swap",
});

export const metadata: Metadata = {
  title: "Candidature Auto",
  description: "Recherche d'offres et génération automatique de lettres de motivation",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="fr" className={`${jakarta.variable} h-full antialiased`}>
      <body className="min-h-full flex flex-col bg-background text-foreground">
        {children}
        <footer className="mt-auto border-t border-border py-5 text-center text-xs text-muted-foreground">
          <Link href="/privacy" className="transition-colors hover:text-foreground hover:underline">
            Politique de confidentialité
          </Link>
        </footer>
      </body>
    </html>
  );
}
