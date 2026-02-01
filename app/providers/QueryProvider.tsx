"use client";

import { FC, ReactNode, useState } from "react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";

export const QueryProvider: FC<{ children: ReactNode }> = ({ children }) => {
  const [queryClient] = useState(
    () =>
      new QueryClient({
        defaultOptions: {
          queries: {
            staleTime: 30 * 1000, // 30 seconds
            refetchInterval: 60 * 1000, // 60 seconds
            refetchOnWindowFocus: true,
            retry: (failureCount, error) => {
              // Don't retry "account not found" — it won't resolve on retry
              const msg =
                error instanceof Error ? error.message : String(error);
              if (
                msg.includes("Account does not exist") ||
                msg.includes("could not find account")
              ) {
                return false;
              }
              return failureCount < 3;
            },
            retryDelay: (attempt) =>
              Math.min(1000 * Math.pow(2, attempt), 15000),
          },
        },
      })
  );

  return (
    <QueryClientProvider client={queryClient}>{children}</QueryClientProvider>
  );
};
