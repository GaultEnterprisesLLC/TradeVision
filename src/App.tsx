import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom';
import { AuthProvider } from '@/lib/auth/AuthProvider';
import { AppShell } from '@/components/AppShell';
import { RequireAuth } from '@/components/RequireAuth';
import SignIn from '@/routes/SignIn';
import AuthCallback from '@/routes/AuthCallback';
import Quotes from '@/routes/Quotes';
import New from '@/routes/New';
import Settings from '@/routes/Settings';
import More from '@/routes/More';

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
