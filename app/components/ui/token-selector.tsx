"use client";

import * as React from "react";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";
import type { WalletToken } from "@/hooks/useWalletTokens";

interface TokenSelectorProps {
  tokens: WalletToken[];
  value: string | null;
  onChange: (mint: string) => void;
  isLoading?: boolean;
  className?: string;
}

function truncateAddress(addr: string) {
  return `${addr.slice(0, 4)}...${addr.slice(-4)}`;
}

export function TokenSelector({
  tokens,
  value,
  onChange,
  isLoading,
  className,
}: TokenSelectorProps) {
  const [open, setOpen] = React.useState(false);
  const [search, setSearch] = React.useState("");

  const selected = tokens.find((t) => t.mint === value);

  const filtered = React.useMemo(() => {
    if (!search) return tokens;
    const q = search.toLowerCase();
    return tokens.filter(
      (t) =>
        t.symbol?.toLowerCase().includes(q) ||
        t.name?.toLowerCase().includes(q) ||
        t.mint.toLowerCase().includes(q)
    );
  }, [tokens, search]);

  function handleSelect(mint: string) {
    onChange(mint);
    setOpen(false);
    setSearch("");
  }

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <Button
          type="button"
          variant="outline"
          className={cn(
            "w-full justify-start text-left font-normal",
            !value && "text-muted-foreground",
            className
          )}
        >
          {selected ? (
            <span className="flex items-center gap-2 truncate">
              {selected.logoURI ? (
                <img
                  src={selected.logoURI}
                  alt=""
                  className="size-5 rounded-full"
                  onError={(e) => {
                    (e.target as HTMLImageElement).style.display = "none";
                  }}
                />
              ) : (
                <span className="size-5 rounded-full bg-gray-600 flex items-center justify-center text-[10px] text-gray-400">
                  ?
                </span>
              )}
              <span className="text-sm text-gray-600 font-mono font-medium truncate">
                {selected.mint}
              </span>
            </span>
          ) : (
            "Select a token"
          )}
        </Button>
      </PopoverTrigger>

      <PopoverContent
        className="w-80 p-0 bg-gray-800 border-gray-700"
        align="start"
      >
        {/* Search */}
        <div className="p-2 border-b border-gray-700">
          <input
            type="text"
            placeholder="Search by name, symbol, or address"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="w-full bg-gray-700 border border-gray-600 rounded-md px-3 py-2 text-sm text-white placeholder-gray-500 outline-none focus:border-purple-500"
            autoFocus
          />
        </div>

        {/* Token list */}
        <div className="max-h-60 overflow-y-auto">
          {isLoading ? (
            <div className="flex items-center justify-center py-8">
              <svg
                className="animate-spin h-5 w-5 text-gray-400"
                viewBox="0 0 24 24"
                fill="none"
              >
                <circle
                  className="opacity-25"
                  cx="12"
                  cy="12"
                  r="10"
                  stroke="currentColor"
                  strokeWidth="4"
                />
                <path
                  className="opacity-75"
                  fill="currentColor"
                  d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"
                />
              </svg>
            </div>
          ) : tokens.length === 0 ? (
            <p className="text-center text-gray-500 text-sm py-8">
              No tokens in wallet
            </p>
          ) : filtered.length === 0 ? (
            <p className="text-center text-gray-500 text-sm py-8">
              No matches
            </p>
          ) : (
            filtered.map((token) => (
              <button
                key={token.mint}
                type="button"
                onClick={() => handleSelect(token.mint)}
                className={cn(
                  "w-full flex items-center gap-3 px-3 py-2.5 text-left hover:bg-gray-700 transition-colors",
                  token.mint === value && "bg-gray-700/60"
                )}
              >
                {token.logoURI ? (
                  <img
                    src={token.logoURI}
                    alt=""
                    className="size-7 rounded-full flex-shrink-0"
                    onError={(e) => {
                      (e.target as HTMLImageElement).style.display = "none";
                    }}
                  />
                ) : (
                  <span className="size-7 rounded-full bg-gray-600 flex items-center justify-center text-xs text-gray-400 flex-shrink-0">
                    ?
                  </span>
                )}
                <div className="flex-1 min-w-0">
                  <div className="text-sm text-white truncate">
                    {token.symbol ?? truncateAddress(token.mint)}
                  </div>
                  {token.name && (
                    <div className="text-xs text-gray-500 truncate">
                      {token.name}
                    </div>
                  )}
                </div>
                <span className="text-sm text-gray-400 flex-shrink-0">
                  {token.uiBalance.toLocaleString(undefined, {
                    maximumFractionDigits: 4,
                  })}
                </span>
              </button>
            ))
          )}
        </div>
      </PopoverContent>
    </Popover>
  );
}
