"use client";

import Link from "next/link";
import { WalletMultiButton } from "@solana/wallet-adapter-react-ui";
import { NetworkSelector } from "@/components/NetworkSelector";

interface HeaderProps {
  activeLink?: "markets" | "create" | "portfolio";
}

export function Header({ activeLink }: HeaderProps) {
  const linkClass = (link: HeaderProps["activeLink"]) =>
    link === activeLink
      ? "text-white font-medium hover:text-purple-400 transition-colors"
      : "text-gray-400 hover:text-white transition-colors";

  return (
    <header className="border-b border-gray-800 bg-gray-900/80 backdrop-blur-sm sticky top-0 z-50">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-4">
        <div className="flex items-center justify-between">
          <Link href="/" className="flex items-center gap-2">
            <span className="text-2xl font-bold bg-gradient-to-r from-purple-400 to-pink-500 bg-clip-text text-transparent">
              KarmaPi
            </span>
          </Link>
          <nav className="hidden md:flex items-center gap-8">
            <Link href="/" className={linkClass("markets")}>
              Markets
            </Link>
            <Link href="/create" className={linkClass("create")}>
              Create
            </Link>
            <Link href="/portfolio" className={linkClass("portfolio")}>
              Portfolio
            </Link>
          </nav>
          <div className="flex items-center gap-3">
            <NetworkSelector />
            <WalletMultiButton className="!bg-purple-600 hover:!bg-purple-700 !rounded-lg" />
          </div>
        </div>
      </div>
    </header>
  );
}
