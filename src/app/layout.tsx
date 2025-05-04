
import type { Metadata } from "next";
// Corrected import for Geist Sans and Mono fonts - use named exports
import { GeistSans } from "geist/font/sans";
import { GeistMono } from "geist/font/mono";
import "./globals.css";
import { Toaster } from "@/components/ui/toaster"; // Import Toaster

// Instantiate fonts correctly by calling the named exports as functions
// and assign CSS variables
const geistSans = GeistSans({
  variable: "--font-geist-sans",
  subsets: ["latin"], // Optional: Specify subsets if needed
});

const geistMono = GeistMono({
  variable: "--font-geist-mono",
  subsets: ["latin"], // Optional: Specify subsets if needed
});

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
    <html lang="en" className={`${geistSans.variable} ${geistMono.variable}`}>
      {/* Apply base font style (sans-serif) to the body using Tailwind utility class */}
      {/* Tailwind's font-sans class is configured in tailwind.config.ts to use the CSS variable */}
      <body
        className={`font-sans antialiased`}
      >
        {children}
        <Toaster /> {/* Add Toaster component */}
      </body>
    </html>
  );
}
