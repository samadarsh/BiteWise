import type { Metadata } from "next";
import Script from "next/script";
import "./globals.css";
import { AuthProvider } from "../lib/auth-context";
import { ThemeProvider, THEME_NO_FLASH_SCRIPT } from "../lib/theme-context";
import { AuthModal } from "../components/AuthModal";

export const metadata: Metadata = {
  title: "BiteWise | Food Intelligence Platform",
  description: "A food intelligence platform combining NutriOrder AI for health-aware food ordering and SmartPantry AI for household pantry and grocery planning.",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en" className="h-full antialiased" suppressHydrationWarning>
      <head>
        {/* Set the theme class before paint to avoid a flash of the wrong theme. */}
        <script dangerouslySetInnerHTML={{ __html: THEME_NO_FLASH_SCRIPT }} />
        <Script
          src="https://accounts.google.com/gsi/client"
          strategy="afterInteractive"
        />
      </head>
      <body className="min-h-full flex flex-col">
        <ThemeProvider>
          <AuthProvider>
            {children}
            <AuthModal />
          </AuthProvider>
        </ThemeProvider>
      </body>
    </html>
  );
}
