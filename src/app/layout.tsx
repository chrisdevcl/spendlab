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
        {/* Restore saved theme + set bg immediately + record splash start time */}
        <script dangerouslySetInnerHTML={{ __html: `try{var t=localStorage.getItem('spendlab-theme');if(t==='dark'||t==='light')document.documentElement.setAttribute('data-theme',t);document.documentElement.style.background=t==='light'?'#f5f5f3':'#111110';}catch(e){}window.__splashStart=Date.now();` }} />
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
        {/* iOS PWA startup images — prevent black screen during WebKit init */}
        <link rel="apple-touch-startup-image" href="/splash/apple-splash-750-1334.png"  media="(device-width:375px) and (device-height:667px) and (-webkit-device-pixel-ratio:2)" />
        <link rel="apple-touch-startup-image" href="/splash/apple-splash-1125-2436.png" media="(device-width:375px) and (device-height:812px) and (-webkit-device-pixel-ratio:3)" />
        <link rel="apple-touch-startup-image" href="/splash/apple-splash-828-1792.png"  media="(device-width:414px) and (device-height:896px) and (-webkit-device-pixel-ratio:2)" />
        <link rel="apple-touch-startup-image" href="/splash/apple-splash-1242-2688.png" media="(device-width:414px) and (device-height:896px) and (-webkit-device-pixel-ratio:3)" />
        <link rel="apple-touch-startup-image" href="/splash/apple-splash-1080-2340.png" media="(device-width:360px) and (device-height:780px) and (-webkit-device-pixel-ratio:3)" />
        <link rel="apple-touch-startup-image" href="/splash/apple-splash-1170-2532.png" media="(device-width:390px) and (device-height:844px) and (-webkit-device-pixel-ratio:3)" />
        <link rel="apple-touch-startup-image" href="/splash/apple-splash-1284-2778.png" media="(device-width:428px) and (device-height:926px) and (-webkit-device-pixel-ratio:3)" />
        <link rel="apple-touch-startup-image" href="/splash/apple-splash-1179-2556.png" media="(device-width:393px) and (device-height:852px) and (-webkit-device-pixel-ratio:3)" />
        <link rel="apple-touch-startup-image" href="/splash/apple-splash-1290-2796.png" media="(device-width:430px) and (device-height:932px) and (-webkit-device-pixel-ratio:3)" />
        <style dangerouslySetInnerHTML={{ __html: `
          #splash{position:fixed;inset:0;z-index:9999;display:flex;flex-direction:column;align-items:center;justify-content:center;gap:2rem;background:#111110;}
          html[data-theme='light'] #splash{background:#f5f5f3;}
          @media(prefers-color-scheme:light){html:not([data-theme='dark']) #splash{background:#f5f5f3;}}
          #splash-wordmark{font-family:"Iowan Old Style","Palatino Linotype",Palatino,ui-serif,Georgia,serif;font-size:2rem;font-weight:500;letter-spacing:-0.02em;color:#f0efed;}
          html[data-theme='light'] #splash-wordmark{color:#1a1a18;}
          @media(prefers-color-scheme:light){html:not([data-theme='dark']) #splash-wordmark{color:#1a1a18;}}
          @keyframes splash-spin{to{transform:rotate(360deg);}}
          #splash-spinner{width:24px;height:24px;border-radius:50%;border:2px solid rgba(240,239,237,0.15);border-top-color:#0D9488;animation:splash-spin 0.75s linear infinite;}
          html[data-theme='light'] #splash-spinner{border-color:rgba(26,26,24,0.12);}
          @media(prefers-color-scheme:light){html:not([data-theme='dark']) #splash-spinner{border-color:rgba(26,26,24,0.12);}}
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
