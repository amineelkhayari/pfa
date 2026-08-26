import { useState, useEffect, useCallback, Suspense } from 'react';
import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom';
import { lazyWithRetry as lazy } from './utils/lazyWithRetry';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { Loader2 } from 'lucide-react';
import { Layout } from './components/Layout';
import { ToastProvider } from './components/Toast';
import { useRole, type UserRole } from './hooks/useRole';
import { RoleProvider } from './components/RoleProvider';
import { ErrorBoundary } from './components/ErrorBoundary';
import { API_BASE_URL } from './services/api';
import { clearActorState, resolveStartupValidation } from './utils/authLifecycle';
import './App.css';

const Login = lazy(() => import('./pages/Login').then(m => ({ default: m.Login })));
const Landing = lazy(() => import('./pages/Landing').then(m => ({ default: m.Landing })));
const Dashboard = lazy(() => import('./pages/Dashboard').then(m => ({ default: m.Dashboard })));
const Sessions = lazy(() => import('./pages/Sessions').then(m => ({ default: m.Sessions })));
const Chats = lazy(() => import('./pages/Chats').then(m => ({ default: m.Chats })));
const Webhooks = lazy(() => import('./pages/Webhooks').then(m => ({ default: m.Webhooks })));
const Templates = lazy(() => import('./pages/Templates').then(m => ({ default: m.Templates })));
const Logs = lazy(() => import('./pages/Logs').then(m => ({ default: m.Logs })));
const ApiKeys = lazy(() => import('./pages/ApiKeys').then(m => ({ default: m.ApiKeys })));
const MessageTester = lazy(() => import('./pages/MessageTester').then(m => ({ default: m.MessageTester })));
const Infrastructure = lazy(() => import('./pages/Infrastructure').then(m => ({ default: m.Infrastructure })));
const Stores = lazy(() => import('./pages/Stores').then(m => ({ default: m.Stores })));
const Plugins = lazy(() => import('./pages/Plugins'));
const Account = lazy(() => import('./pages/Account').then(m => ({ default: m.Account })));
const AdminUsers = lazy(() => import('./pages/AdminUsers').then(m => ({ default: m.AdminUsers })));
const AdminDashboard = lazy(() => import('./pages/AdminDashboard').then(m => ({ default: m.AdminDashboard })));
const PaymentSettings = lazy(() => import('./pages/PaymentSettings').then(m => ({ default: m.PaymentSettings })));
const AiSettings = lazy(() => import('./pages/AiSettings').then(m => ({ default: m.AiSettings })));
const AiTestChat = lazy(() => import('./pages/AiTestChat').then(m => ({ default: m.AiTestChat })));
const Campaigns = lazy(() => import('./pages/Campaigns').then(m => ({ default: m.Campaigns })));
const Contacts = lazy(() => import('./pages/Contacts').then(m => ({ default: m.Contacts })));

const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      staleTime: 30_000,
      retry: 1,
      refetchOnWindowFocus: true,
    },
  },
});

function AppContent() {
  // Initialize from sessionStorage to avoid setState in effect
  const savedKey = sessionStorage.getItem('openwa_access_token');
  const [isAuthenticated, setIsAuthenticated] = useState(!!savedKey);
  const [publicView, setPublicView] = useState<'landing' | 'signin' | 'signup'>('landing');
  const [, setApiKey] = useState(savedKey || '');
  const { setRole, role } = useRole();

  const handleLogin = async (key: string) => {
    setApiKey(key);
    sessionStorage.setItem('openwa_access_token', key);

    // Fetch the role from API
    try {
      const response = await fetch(`${API_BASE_URL}/auth/validate`, {
        method: 'POST',
        headers: { Authorization: `Bearer ${key}` },
      });
      if (response.ok) {
        const data = await response.json();
        setRole(data.role as UserRole);
      }
    } catch {
      // Default to viewer if we can't fetch role
      setRole('viewer');
    }

    setIsAuthenticated(true);
  };

  const handleLogout = useCallback(() => {
    setApiKey('');
    setIsAuthenticated(false);
    setRole(null);
    sessionStorage.removeItem('openwa_access_token');
    // Wipe the React Query cache too: it is keyed by resource, not actor, so without a full
    // clear a logout → login in the same tab with a different key/scope shows the previous
    // actor's sessions/messages/apiKeys/audit rows.
    clearActorState(queryClient);
  }, [setRole]);

  // Re-validate and refresh the role on mount if already authenticated
  useEffect(() => {
    if (!savedKey) return;

    fetch(`${API_BASE_URL}/auth/validate`, {
      method: 'POST',
      headers: { Authorization: `Bearer ${savedKey}` },
    })
      .then(async res => {
        const decision = resolveStartupValidation(res.status, await res.json().catch(() => null));
        if (decision.action === 'logout') {
          handleLogout();
        } else if (decision.action === 'role') {
          setRole(decision.role);
        }
      })
      .catch(() => {
        // Network failure (API unreachable): keep the cached role so a transient outage at
        // page load doesn't eject the user — an explicit 401/403 above still logs out.
      });
  }, [savedKey, setRole, handleLogout]);

  const loadingFallback = (
    <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', minHeight: '100vh' }}>
      <Loader2 className="animate-spin" size={32} />
    </div>
  );

  if (!isAuthenticated) {
    return (
      <Suspense fallback={loadingFallback}>
        {publicView === 'landing' ? (
          <Landing onSignIn={() => setPublicView('signin')} onSignUp={() => setPublicView('signup')} />
        ) : (
          <Login onLogin={handleLogin} initialMode={publicView} onBack={() => setPublicView('landing')} />
        )}
      </Suspense>
    );
  }

  return (
    <ToastProvider>
      <BrowserRouter>
        <Suspense fallback={loadingFallback}>
          <Routes>
            <Route path="/" element={<Layout onLogout={handleLogout} userRole={role} />}>
              <Route index element={role === 'admin' ? <AdminDashboard /> : <Dashboard />} />
              {role !== 'admin' && <Route path="sessions" element={<Sessions />} />}
              {role !== 'admin' && <Route path="stores" element={<Stores />} />}
              {role !== 'admin' && <Route path="chats" element={<Chats />} />}
              {role !== 'admin' && <Route path="contacts" element={<Contacts />} />}
              {role !== 'admin' && <Route path="webhooks" element={<Webhooks />} />}
              {role !== 'admin' && <Route path="templates" element={<Templates />} />}
              {role !== 'admin' && <Route path="campaigns" element={<Campaigns />} />}
              {role === 'admin' && <Route path="api-keys" element={<ApiKeys />} />}
              <Route path="logs" element={<Logs />} />
              {role !== 'admin' && <Route path="message-tester" element={<MessageTester />} />}
              <Route path="account" element={<Account />} />
              {role !== 'admin' && <Route path="ai-test" element={<AiTestChat />} />}
              {role === 'admin' && <Route path="admin/users" element={<AdminUsers />} />}
              {role === 'admin' && <Route path="admin/payments" element={<PaymentSettings />} />}
              {role === 'admin' && <Route path="admin/ai" element={<AiSettings />} />}
              {role === 'admin' && <Route path="infrastructure" element={<Infrastructure />} />}
              {role === 'admin' && <Route path="plugins" element={<Plugins />} />}
              <Route path="*" element={<Navigate to="/" replace />} />
            </Route>
          </Routes>
        </Suspense>
      </BrowserRouter>
    </ToastProvider>
  );
}

function App() {
  return (
    <ErrorBoundary>
      <QueryClientProvider client={queryClient}>
        <RoleProvider>
          <AppContent />
        </RoleProvider>
      </QueryClientProvider>
    </ErrorBoundary>
  );
}

export default App;
