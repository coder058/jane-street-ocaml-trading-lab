import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "OCaml Paper Market Lab · Live Monitor",
  description: "Live read-only evidence for an independent OCaml Alpaca paper trading experiment.",
};

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return <html lang="en"><body>{children}</body></html>;
}
