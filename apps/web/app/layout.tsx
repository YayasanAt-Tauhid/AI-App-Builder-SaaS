/**
 * layout.tsx — Root layout. Sets metadata, applies the theme before paint to
 * avoid a flash, and wraps the app in client providers (theme + SWR).
 */
import type { Metadata } from "next";
import "./globals.css";
import { Providers } from "./providers";

export const metadata: Metadata = {
  title: "AI App Builder",
  description: "Generate, preview, edit, and export web apps from natural language.",
};

// Runs before React hydrates so the correct theme class is on <html> at paint.
const themeScript = `(function(){try{var t=localStorage.getItem('aiab_theme')||'dark';if(t==='light')document.documentElement.classList.add('light');}catch(e){}})();`;

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en" suppressHydrationWarning>
      <head>
        <script dangerouslySetInnerHTML={{ __html: themeScript }} />
      </head>
      <body>
        <Providers>{children}</Providers>
      </body>
    </html>
  );
}
