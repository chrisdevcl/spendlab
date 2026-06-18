import type { Metadata } from "next";
import { Geist, Geist_Mono } from "next/font/google";
import SplashHider from "@/components/splash-hider";
import "./globals.css";

const geistSans = Geist({
  variable: "--font-geist-sans",
  subsets: ["latin"],
});

const geistMono = Geist_Mono({
  variable: "--font-geist-mono",
  subsets: ["latin"],
});

export const metadata: Metadata = {
  title: "SpendLab",
  description: "Gastos compartidos sin drama",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="es" className={`${geistSans.variable} ${geistMono.variable}`} suppressHydrationWarning>
      <head>
        {/* Restore saved theme + record splash start time before first paint */}
        <script dangerouslySetInnerHTML={{ __html: `try{var t=localStorage.getItem('spendlab-theme');if(t==='dark'||t==='light')document.documentElement.setAttribute('data-theme',t)}catch(e){}window.__splashStart=Date.now();` }} />
        <meta name="viewport" content="width=device-width, initial-scale=1, viewport-fit=cover" />
        <meta name="theme-color" content="#0D9488" />
        <meta name="apple-mobile-web-app-capable" content="yes" />
        <meta name="apple-mobile-web-app-status-bar-style" content="black-translucent" />
        <meta name="apple-mobile-web-app-title" content="SpendLab" />
        {/* title is also declared via metadata export; this satisfies IDE inspections */}
        <title>SpendLab</title>
        <link rel="icon" href="/favicon.svg" type="image/svg+xml" />
        <link rel="icon" href="/favicon.png" type="image/png" sizes="32x32" />
        <link rel="apple-touch-icon" href="/apple-touch-icon.png" />
        <link rel="manifest" href="/manifest.json" />
        <style dangerouslySetInnerHTML={{ __html: `
          #splash {
            position: fixed;
            inset: 0;
            z-index: 9999;
            display: flex;
            flex-direction: column;
            align-items: center;
            justify-content: center;
            gap: 2rem;
            background: #111110;
          }
          @media (prefers-color-scheme: light) {
            html:not([data-theme='dark']) #splash { background: #f5f5f3; }
          }
          html[data-theme='light'] #splash { background: #f5f5f3; }
          #splash-wordmark {
            font-family: "Iowan Old Style", "Palatino Linotype", Palatino, ui-serif, Georgia, serif;
            font-size: 2rem;
            font-weight: 500;
            letter-spacing: -0.02em;
            color: #f0efed;
          }
          html[data-theme='light'] #splash-wordmark { color: #1a1a18; }
          @media (prefers-color-scheme: light) {
            html:not([data-theme='dark']) #splash-wordmark { color: #1a1a18; }
          }
          @keyframes splash-spin { to { transform: rotate(360deg); } }
          #splash-spinner {
            width: 24px;
            height: 24px;
            border-radius: 50%;
            border: 2px solid rgba(240,239,237,0.15);
            border-top-color: #0D9488;
            animation: splash-spin 0.75s linear infinite;
          }
          html[data-theme='light'] #splash-spinner,
          @media (prefers-color-scheme: light) {
            html:not([data-theme='dark']) #splash-spinner { border-color: rgba(26,26,24,0.12); border-top-color: #0D9488; }
          }
        ` }} />
      </head>
      <body>
        <div id="splash" aria-hidden="true">
          <span id="splash-wordmark">SpendLab</span>
          <div id="splash-spinner" />
        </div>
        <SplashHider />
        {children}
      </body>
    </html>
  );
}
