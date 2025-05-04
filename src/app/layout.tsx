
import type { Metadata } from "next";
// Corrected import for Geist Sans and Mono fonts - use named exports
import { GeistSans } from "geist/font/sans";
import { GeistMono } from "geist/font/mono";
import "./globals.css";
import { Toaster } from "@/components/ui/toaster"; // Import Toaster


// No need to call the font objects as functions.
// Their properties (like .variable or .className) are accessed directly.

export const metadata: Metadata = {
  title: "GhostLine P2P Chat", // Updated title
  description: "Real-time P2P chat application using WebRTC", // Updated description
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    // Apply font variables directly to the <html> tag for global availability
    // Access the 'variable' property directly from the imported font objects
    <html lang="en" className={`${GeistSans.variable} ${GeistMono.variable}`}>
      {/* Apply base font style (sans-serif) to the body using Tailwind utility class */}
      {/* Tailwind's font-sans class is configured in tailwind.config.ts to use the CSS variable */}
      <body
        className={`font-sans antialiased`} // Use template literal for clarity
      >
        {children}
        <Toaster /> {/* Add Toaster component */}
      </body>
    </html>
  );
}
