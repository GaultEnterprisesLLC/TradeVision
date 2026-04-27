import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom';
import { AppShell } from '@/components/AppShell';
import Quotes from '@/routes/Quotes';
import New from '@/routes/New';
import Settings from '@/routes/Settings';

/**
 * App router.
 * Authenticated layout wraps all routes for now (auth landing page
 * will slot in at Stage 6+ when multi-tenant signup is real).
 */
export default function App() {
  return (
    <BrowserRouter>
      <Routes>
        <Route element={<AppShell />}>
          <Route index element={<Navigate to="/quotes" replace />} />
          <Route path="/quotes" element={<Quotes />} />
          <Route path="/new" element={<New />} />
          <Route path="/settings" element={<Settings />} />
          <Route path="*" element={<Navigate to="/quotes" replace />} />
        </Route>
      </Routes>
    </BrowserRouter>
  );
}
