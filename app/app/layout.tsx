import type { Metadata } from "next";
import { cookies } from "next/headers";
import { Geist, Geist_Mono } from "next/font/google";
import "./globals.css";
import { QueryProvider } from "@/providers/QueryProvider";
import { ClusterProvider } from "@/providers/ClusterProvider";
import { WalletProvider } from "@/providers/WalletProvider";
import { AnchorContextProvider } from "@/providers/AnchorProvider";
import {
  CLUSTER_STORAGE_KEY,
  DEFAULT_CLUSTER,
  parseCluster,
  resolveEnvCluster,
} from "@/lib/cluster";

const geistSans = Geist({
  variable: "--font-geist-sans",
  subsets: ["latin"],
});

const geistMono = Geist_Mono({
  variable: "--font-geist-mono",
  subsets: ["latin"],
});

export const metadata: Metadata = {
  title: "KarmaPi - Prediction Markets",
  description: "Decentralized prediction markets on Sonic SVM",
};

export default async function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  const cookieStore = await cookies();
  const cookieCluster = parseCluster(cookieStore.get(CLUSTER_STORAGE_KEY)?.value);
  const envRpcUrl = process.env.NEXT_PUBLIC_SOLANA_RPC_URL?.trim() || undefined;
  const envCluster = resolveEnvCluster({
    rpcUrl: envRpcUrl,
    cluster: process.env.NEXT_PUBLIC_SOLANA_CLUSTER,
  });
  const initialCluster = cookieCluster ?? envCluster ?? DEFAULT_CLUSTER;

  return (
    <html lang="en">
      <body
        className={`${geistSans.variable} ${geistMono.variable} antialiased`}
      >
        <QueryProvider>
          <ClusterProvider initialCluster={initialCluster}>
            <WalletProvider>
              <AnchorContextProvider>{children}</AnchorContextProvider>
            </WalletProvider>
          </ClusterProvider>
        </QueryProvider>
      </body>
    </html>
  );
}
