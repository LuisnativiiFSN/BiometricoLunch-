import { useEffect, useState } from 'react';
import { AppShell } from './components/AppShell';
import type { AppPage } from './components/AppShell';
import { EmployeesPage } from './pages/EmployeesPage';
import { HomePage } from './pages/HomePage';
import { ManualMealRequestPage } from './pages/ManualMealRequestPage';
import { MealRequestsPage } from './pages/MealRequestsPage';
import { PendingMealsPage } from './pages/PendingMealsPage';
import { LoginPage } from './pages/LoginPage';
import { ConsultationPage } from './pages/ConsultationPage';
import { UsersPage } from './pages/UsersPage';
import { getCurrentSession, logout } from './services/auth.service';
import type { AuthUser } from './types/auth';

const pagesByRole: Record<AuthUser['role'], AppPage[]> = {
  ADMIN: ['home', 'employees', 'deliveries', 'pending', 'manual', 'users', 'consultation'],
  RH: ['home', 'employees', 'deliveries', 'pending', 'consultation'],
  CHEF: ['home', 'deliveries', 'pending', 'consultation'],
};

function App() {
  const [activePage, setActivePage] = useState<AppPage>('login');
  const [user, setUser] = useState<AuthUser | null>(null);
  const [isCheckingSession, setIsCheckingSession] = useState(true);

  useEffect(() => {
    const controller = new AbortController();
    void getCurrentSession(controller.signal)
      .then(({ user: sessionUser }) => {
        setUser(sessionUser);
        setActivePage('home');
      })
      .catch((error: unknown) => {
        if (error instanceof DOMException && error.name === 'AbortError') return;
        setUser(null);
      })
      .finally(() => {
        if (!controller.signal.aborted) setIsCheckingSession(false);
      });

    const handleUnauthorized = () => {
      setUser(null);
      setActivePage('login');
      setIsCheckingSession(false);
    };
    window.addEventListener('auth:unauthorized', handleUnauthorized);

    return () => {
      controller.abort();
      window.removeEventListener('auth:unauthorized', handleUnauthorized);
    };
  }, []);

  useEffect(() => {
    const allowedPages = user ? pagesByRole[user.role] : ['login', 'consultation'];
    if (!allowedPages.includes(activePage)) {
      setActivePage(user ? 'home' : 'login');
    }
  }, [activePage, user]);

  const handleAuthenticated = (authenticatedUser: AuthUser) => {
    setUser(authenticatedUser);
    setActivePage('home');
  };

  const handleLogout = async () => {
    try {
      await logout();
    } finally {
      setUser(null);
      setActivePage('login');
    }
  };

  if (isCheckingSession) {
    return <div className="session-loading"><span className="button-spinner" aria-hidden="true" /> Verificando acceso…</div>;
  }

  const currentPage = {
    login: <LoginPage onAuthenticated={handleAuthenticated} onOpenConsultation={() => setActivePage('consultation')} />,
    consultation: <ConsultationPage />,
    home: <HomePage />,
    employees: <EmployeesPage />,
    deliveries: <MealRequestsPage />,
    pending: <PendingMealsPage />,
    manual: <ManualMealRequestPage />,
    users: <UsersPage />,
  }[activePage];

  return (
    <AppShell activePage={activePage} user={user} onNavigate={setActivePage} onLogout={() => void handleLogout()}>
      {currentPage}
    </AppShell>
  );
}

export default App;
