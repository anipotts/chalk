import type { Metadata, Viewport } from "next";
import { Inter } from "next/font/google";
import "katex/dist/katex.min.css";
import "./globals.css";

const inter = Inter({ subsets: ["latin"] });

export const viewport: Viewport = {
  width: 'device-width',
  initialScale: 1,
  maximumScale: 1,
  viewportFit: 'cover',
  themeColor: '#000000',
  interactiveWidget: 'resizes-content',
};

export const metadata: Metadata = {
  title: "Chalk — YouTube Video Learning Assistant",
  description: "Paste a YouTube URL, pause the video, and ask AI anything about what you're watching.",
  appleWebApp: {
    capable: true,
    statusBarStyle: 'black-translucent',
    title: 'Chalk',
  },
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="en" className="dark">
      <body suppressHydrationWarning className={`${inter.className} bg-chalk-bg text-chalk-text h-[100dvh] overflow-hidden`}>
        {children}
      </body>
    </html>
  );
}
