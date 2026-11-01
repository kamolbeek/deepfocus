import type { Metadata, Viewport } from "next";
import Script from "next/script";
import "./globals.css";

export const metadata: Metadata = {
  title: "DeepFokus",
  description: "Fokus taymer va kompanyon: vazifalar, streak va o'sib boruvchi do'stingiz bilan chuqur ishlang.",
  appleWebApp: { capable: true, title: "DeepFokus", statusBarStyle: "default" },
};

export const viewport: Viewport = {
  themeColor: "#F5F5F7",
  width: "device-width",
  initialScale: 1,
  viewportFit: "cover",
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="uz" className="h-full antialiased">
      <body className="min-h-full bg-[#F5F5F7]">
        <Script src="https://telegram.org/js/telegram-web-app.js" strategy="beforeInteractive" />
        {children}
      </body>
    </html>
  );
}
