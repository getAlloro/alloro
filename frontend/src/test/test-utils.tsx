import type { ReactElement, ReactNode } from "react";
import { render, type RenderOptions } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { MemoryRouter } from "react-router-dom";

/**
 * Shared test harness for the frontend (code-constitution frontend-remediation, T0).
 *
 * `renderWithProviders` wraps a component in the providers nearly every screen
 * needs: a fresh React Query client (retries off + gcTime 0 so failed queries
 * fail fast and nothing leaks between tests) and a MemoryRouter. Components that
 * need more context (Auth / Location / GBP / Clarity) compose those providers on
 * top inside their own test file — this is the floor, not the ceiling.
 */
export function createTestQueryClient(): QueryClient {
  return new QueryClient({
    defaultOptions: {
      queries: { retry: false, gcTime: 0 },
      mutations: { retry: false },
    },
  });
}

export function AppTestProviders({
  children,
  route = "/",
}: {
  children: ReactNode;
  route?: string;
}) {
  return (
    <QueryClientProvider client={createTestQueryClient()}>
      <MemoryRouter initialEntries={[route]}>{children}</MemoryRouter>
    </QueryClientProvider>
  );
}

export function renderWithProviders(
  ui: ReactElement,
  options: { route?: string } & Omit<RenderOptions, "wrapper"> = {},
) {
  const { route, ...rest } = options;
  return render(ui, {
    wrapper: ({ children }) => (
      <AppTestProviders route={route}>{children}</AppTestProviders>
    ),
    ...rest,
  });
}

// Re-export RTL so tests pull screen / fireEvent / waitFor from one place.
export * from "@testing-library/react";
