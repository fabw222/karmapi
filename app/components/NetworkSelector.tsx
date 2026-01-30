"use client";

import { useState, useRef, useEffect } from "react";
import { useCluster, Cluster } from "@/providers/ClusterProvider";

const CLUSTERS: { value: Cluster; label: string; color: string }[] = [
  { value: "localnet", label: "Localnet", color: "bg-blue-400" },
  { value: "devnet", label: "Devnet", color: "bg-green-400" },
  { value: "testnet", label: "Testnet", color: "bg-yellow-400" },
  { value: "mainnet-beta", label: "Mainnet", color: "bg-red-400" },
];

export function NetworkSelector() {
  const { cluster, setCluster } = useCluster();
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);

  const current = CLUSTERS.find((c) => c.value === cluster)!;

  useEffect(() => {
    function handleClick(e: MouseEvent) {
      if (ref.current && !ref.current.contains(e.target as Node)) {
        setOpen(false);
      }
    }
    document.addEventListener("mousedown", handleClick);
    return () => document.removeEventListener("mousedown", handleClick);
  }, []);

  return (
    <div className="relative" ref={ref}>
      <button
        onClick={() => setOpen((o) => !o)}
        className="flex items-center gap-2 px-3 py-1.5 rounded-lg bg-gray-800 border border-gray-700 hover:border-gray-600 transition-colors text-sm text-white"
      >
        <span className={`w-2 h-2 rounded-full ${current.color}`} />
        {current.label}
        <svg
          className={`w-3.5 h-3.5 text-gray-400 transition-transform ${open ? "rotate-180" : ""}`}
          fill="none"
          viewBox="0 0 24 24"
          stroke="currentColor"
        >
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
        </svg>
      </button>

      {open && (
        <div className="absolute right-0 mt-2 w-44 bg-gray-800 border border-gray-700 rounded-lg shadow-xl z-50 py-1">
          {CLUSTERS.map((c) => (
            <button
              key={c.value}
              onClick={() => {
                setCluster(c.value);
                setOpen(false);
              }}
              className="flex items-center gap-2 w-full px-4 py-2 text-sm text-left hover:bg-gray-700 transition-colors"
            >
              <span className={`w-2 h-2 rounded-full ${c.color}`} />
              <span className={c.value === cluster ? "text-white font-medium" : "text-gray-300"}>
                {c.label}
              </span>
              {c.value === cluster && (
                <svg className="w-4 h-4 text-purple-400 ml-auto" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
                </svg>
              )}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}
