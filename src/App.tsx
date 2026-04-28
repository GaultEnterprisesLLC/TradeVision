import { lazy, Suspense } from 'react';
import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom';
import { AuthProvider } from '@/lib/auth/AuthProvider';
import { AppShell } from '@/components/AppShell';
import { RequireAuth } from '@/components/RequireAuth';
import SignIn from '@/routes/SignIn';
import AuthCallback from '@/routes/AuthCallback';
import Quotes from '@/routes/Quotes';
import QuoteEditor from '@/routes/QuoteEditor';
import New from '@/routes/New';
import Settings from '@/routes/Settings';
import More from '@/routes/More';

// QuotePreview pulls in @react-pdf/renderer (~400 KB gzip). Lazy-load
// so the main bundle stays small for routes that don't need it.
const QuotePreview = lazy(() => import('@/routes/QuotePreview'));

/**
 * App router.
 * - Public routes: /sign-in, /auth/callback
 * - Authenticated routes: everything inside <RequireAuth><AppShell />
 */
export default function App() {
  return (
    <AuthProvider>
      <BrowserRouter>
        <Routes>
          {/* Public */}
          <Route path="/sign-in" element={<SignIn />} />
          <Route path="/auth/callback" element={<AuthCallback />} />

          {/* Authenticated app shell */}
          <Route
            element={
              <RequireAuth>
                <AppShell />
              </RequireAuth>
            }
          >
            <Route index element={<Navigate to="/quotes" replace />} />
            <Route path="/quotes" element={<Quotes />} />
            <Route path="/quotes/:id/edit" element={<QuoteEditor />} />
            <Route
              path="/quotes/:id/preview"
              element={
                <Suspense
                  fallback={
                    <div className="px-4 py-12 text-center text-sm text-[var(--color-muted)]">
                      Loading PDF preview…
                    </div>
                  }
                >
                  <QuotePreview />
                </Suspense>
              }
            />
            <Route path="/new" element={<New />} />
            <Route path="/settings" element={<Settings />} />
            <Route path="/more" element={<More />} />
            <Route path="*" element={<Navigate to="/quotes" replace />} />
          </Route>
        </Routes>
      </BrowserRouter>
    </AuthProvider>
  );
}
