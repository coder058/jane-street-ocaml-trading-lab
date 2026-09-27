import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "Jane Street OCaml Trading Lab · Paper Monitor",
  description: "Live read-only evidence for an independent OCaml Alpaca paper trading experiment.",
};

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return <html lang="en"><body>{children}</body></html>;
}
