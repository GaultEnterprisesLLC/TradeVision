import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { registerSW } from 'virtual:pwa-register';
import './index.css';
import App from './App';

/**
 * Service-worker registration. `autoUpdate` strategy means new versions
 * apply on next page load — the right default for a contractor PWA where
 * you want bug fixes to arrive without a manual prompt.
 */
registerSW({ immediate: true });

/**
 * TanStack Query client.
 * Defaults tuned for a field tool: don't refetch on window focus (the
 * tech is on a phone, not switching tabs); retry once on network failure.
 */
const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      refetchOnWindowFocus: false,
      retry: 1,
      staleTime: 30_000,
    },
  },
});

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <QueryClientProvider client={queryClient}>
      <App />
    </QueryClientProvider>
  </StrictMode>,
);
