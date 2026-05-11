import type { Metadata } from "next";
import { Fredoka, Inter } from "next/font/google";
import "./globals.css";
import { BackgroundMusic } from "@/components/background-music";
import { SoundProvider } from "@/components/sound-provider";
import { CustomCursor } from "@/components/custom-cursor";

const fredoka = Fredoka({
  variable: "--font-fredoka",
  subsets: ["latin"],
  weight: ["400", "500", "600", "700"],
});

const inter = Inter({
  variable: "--font-inter",
  subsets: ["latin"],
});

export const metadata: Metadata = {
  title: "Prompt Golf",
  description: "Jackbox-style party game. Shortest prompt wins.",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html
      lang="en"
      className={`${fredoka.variable} ${inter.variable} h-full antialiased`}
    >
      <body className="min-h-full flex flex-col bg-[#FFF8E7] text-[#0A0A0A]">
        <SoundProvider>
          {children}
          <BackgroundMusic />
          <CustomCursor />
        </SoundProvider>
      </body>
    </html>
    
  );
}
