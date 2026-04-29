import { lazy, Suspense } from 'react';
import {
  BrowserRouter,
  Routes,
  Route,
  Navigate,
  Outlet,
} from 'react-router-dom';
import { AuthProvider } from '@/lib/auth/AuthProvider';
import { AppShell } from '@/components/AppShell';
import { RequireAuth } from '@/components/RequireAuth';
import SignIn from '@/routes/SignIn';
import AuthCallback from '@/routes/AuthCallback';
import Quotes from '@/routes/Quotes';
import QuoteEditor from '@/routes/QuoteEditor';
import New from '@/routes/New';
import Narrate from '@/routes/Narrate';
import Settings from '@/routes/Settings';
import More from '@/routes/More';

// QuotePreview pulls in @react-pdf/renderer (~400 KB gzip). Lazy-load
// so the main bundle stays small for routes that don't need it.
const QuotePreview = lazy(() => import('@/routes/QuotePreview'));

/**
 * App router.
 * - Public routes: /sign-in, /auth/callback
 * - Auth-protected, AppShell-wrapped: most routes (bottom nav, mobile width)
 * - Auth-protected, full-screen: /quotes/:id/preview (the PDF viewer needs
 *   the whole viewport — no bottom nav, no max-w-md cage)
 */
export default function App() {
  return (
    <AuthProvider>
      <BrowserRouter>
        <Routes>
          {/* Public */}
          <Route path="/sign-in" element={<SignIn />} />
          <Route path="/auth/callback" element={<AuthCallback />} />

          {/* Auth-protected, FULL SCREEN — no AppShell. */}
          <Route
            element={
              <RequireAuth>
                <Outlet />
              </RequireAuth>
            }
          >
            <Route
              path="/quotes/:id/preview"
              element={
                <Suspense
                  fallback={
                    <div className="min-h-screen flex items-center justify-center text-sm text-[var(--color-muted)]">
                      Loading PDF preview…
                    </div>
                  }
                >
                  <QuotePreview />
                </Suspense>
              }
            />
          </Route>

          {/* Auth-protected, app shell + bottom nav. */}
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
            <Route path="/new" element={<New />} />
            <Route path="/quotes/new/narrate" element={<Narrate />} />
            <Route path="/settings" element={<Settings />} />
            <Route path="/more" element={<More />} />
            <Route path="*" element={<Navigate to="/quotes" replace />} />
          </Route>
        </Routes>
      </BrowserRouter>
    </AuthProvider>
  );
}
