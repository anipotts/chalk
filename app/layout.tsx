import type { Metadata } from "next";
import { Inter } from "next/font/google";
import "katex/dist/katex.min.css";
import "./globals.css";

const inter = Inter({ subsets: ["latin"] });

export const metadata: Metadata = {
  title: "Chalk — YouTube Video Learning Assistant",
  description: "Paste a YouTube URL, pause the video, and ask AI anything about what you're watching.",
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="en" className="dark">
      <body className={`${inter.className} bg-chalk-bg text-chalk-text h-screen overflow-hidden`}>
        {children}
      </body>
    </html>
  );
}
