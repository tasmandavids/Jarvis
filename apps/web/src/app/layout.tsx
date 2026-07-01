import type { Metadata } from "next";
import "./globals.css";
import VoiceOrbLoader from "@/components/voice/VoiceOrbLoader";

export const metadata: Metadata = {
  title: "CYPHER",
  description: "Personal Intelligence System",
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <body>
        {children}
      </body>
    </html>
  );
}
