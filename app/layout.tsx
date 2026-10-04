import type { Metadata } from "next";
import { Cormorant_Garamond, Jost } from "next/font/google";
import "./globals.css";
import { LangProvider } from "@/components/LangProvider";
import { PhotoProvider } from "@/components/PhotoProvider";
import { Nav } from "@/components/Nav";
import { Footer } from "@/components/Footer";
import { RsvpFab } from "@/components/RsvpFab";
import { LoadingSplash } from "@/components/LoadingSplash";

const cormorant = Cormorant_Garamond({
  variable: "--font-cormorant",
  subsets: ["latin"],
  weight: ["400", "500", "600"],
  style: ["normal", "italic"],
});

const jost = Jost({
  variable: "--font-jost",
  subsets: ["latin"],
  weight: ["300", "400", "500", "600"],
});

export const metadata: Metadata = {
  title: "Robin & Annami — 5 December 2026",
  description: "Join us as we celebrate our wedding at Bona Bona Game Reserve, 5 December 2026.",
};

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="en" className={`${cormorant.variable} ${jost.variable}`}>
      <body className="font-body" style={{ background: "var(--c-bg-2)" }}>
        <LangProvider>
          <PhotoProvider>
            <LoadingSplash />
            <Nav />
            <main>{children}</main>
            <Footer />
            <RsvpFab />
          </PhotoProvider>
        </LangProvider>
      </body>
    </html>
  );
}
