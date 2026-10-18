import type { Metadata } from "next";
import type { ReactNode } from "react";
export const metadata: Metadata = { title: "MRK GitHub MCP", description: "Authenticated GitHub tools over Streamable HTTP MCP." };
export default function RootLayout({ children }: { children: ReactNode }) { return <html lang="en"><body style={{ fontFamily: "system-ui, sans-serif", margin: 0, padding: "3rem", maxWidth: 760 }}>{children}</body></html>; }
