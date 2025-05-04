
import type { Metadata } from "next";
// Corrected import for Geist Sans and Mono fonts - use named exports and alias them
import { GeistSans as GeistSansFn } from "geist/font/sans";
import { GeistMono as GeistMonoFn } from "geist/font/mono";
import "./globals.css";
import { Toaster } from "@/components/ui/toaster"; // Import Toaster

// Instantiate fonts correctly by calling the aliased named exports as functions
// and assign CSS variables
const geistSans = GeistSansFn({
  variable: "--font-geist-sans",
  subsets: ["latin"], // Optional: Specify subsets if needed
});

const geistMono = GeistMonoFn({
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
        className={`font-sans antialiased`} // Use template literal for clarity
      >
        {children}
        <Toaster /> {/* Add Toaster component */}
      </body>
    </html>
  );
}
