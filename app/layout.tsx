import type { Metadata } from "next";
import { Inter } from "next/font/google";
import "katex/dist/katex.min.css";
import "./globals.css";

const inter = Inter({ subsets: ["latin"] });

export const metadata: Metadata = {
  title: "Chalk — AI Math Visualization",
  description: "Like texting a mathematician. Interactive math visualizations powered by Claude.",
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
