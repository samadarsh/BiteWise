import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "NutriOrder AI | Food Intelligence Platform",
  description: "AI health coach and household food assistant powered by Swiggy MCP. Personalized meal ordering, pantry intelligence, recipe suggestions, and grocery cart preview.",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en" className="h-full antialiased">
      <body
        className="min-h-full flex flex-col"
        style={{ fontFamily: "'Inter', -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, 'Helvetica Neue', Arial, sans-serif" }}
      >
        {children}
      </body>
    </html>
  );
}
