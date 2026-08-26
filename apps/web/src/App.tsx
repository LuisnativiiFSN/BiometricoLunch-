import { useEffect, useState } from 'react';
import { AppShell } from './components/AppShell';
import type { AppPage } from './components/AppShell';
import { EmployeesPage } from './pages/EmployeesPage';
import { HomePage } from './pages/HomePage';
import { DailyResultsPage } from './pages/DailyResultsPage';
import { MealRequestsPage } from './pages/MealRequestsPage';
import { PendingMealsPage } from './pages/PendingMealsPage';
import { LoginPage } from './pages/LoginPage';
import { ConsultationPage } from './pages/ConsultationPage';
import { UsersPage } from './pages/UsersPage';
import { MealTransfersPage } from './pages/MealTransfersPage';
import { WeeklyMealOrderPage } from './pages/WeeklyMealOrderPage';
import { WeeklyMenuAdminPage } from './pages/WeeklyMenuAdminPage';
import { getCurrentSession, logout } from './services/auth.service';
import type { AuthUser } from './types/auth';

const pagesByRole: Record<AuthUser['role'], AppPage[]> = {
  ADMIN: ['home', 'daily-results', 'weekly-menu', 'weekly-order', 'employees', 'deliveries', 'pending', 'transfers', 'users', 'consultation'],
  RH: ['home', 'daily-results', 'weekly-menu', 'weekly-order', 'employees', 'deliveries', 'pending', 'transfers', 'consultation'],
  CHEF: ['home', 'daily-results', 'deliveries', 'pending'],
};

function getLandingPage(user: AuthUser | null): AppPage {
  return user?.role === 'CHEF' ? 'home' : 'weekly-order';
}

function App() {
  const [activePage, setActivePage] = useState<AppPage>('weekly-order');
  const [user, setUser] = useState<AuthUser | null>(null);
  const [isCheckingSession, setIsCheckingSession] = useState(true);

  useEffect(() => {
    const controller = new AbortController();
    void getCurrentSession(controller.signal)
      .then(({ user: sessionUser }) => {
        setUser(sessionUser);
        setActivePage(getLandingPage(sessionUser));
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
      setActivePage('weekly-order');
      setIsCheckingSession(false);
    };
    window.addEventListener('auth:unauthorized', handleUnauthorized);

    return () => {
      controller.abort();
      window.removeEventListener('auth:unauthorized', handleUnauthorized);
    };
  }, []);

  useEffect(() => {
    const allowedPages = user ? pagesByRole[user.role] : ['login', 'weekly-order', 'consultation'];
    if (!allowedPages.includes(activePage)) {
      setActivePage(getLandingPage(user));
    }
  }, [activePage, user]);

  const handleAuthenticated = (authenticatedUser: AuthUser) => {
    setUser(authenticatedUser);
    setActivePage(getLandingPage(authenticatedUser));
  };

  const handleLogout = async () => {
    try {
      await logout();
    } finally {
      setUser(null);
      setActivePage('weekly-order');
    }
  };

  if (isCheckingSession) {
    return <div className="session-loading"><span className="button-spinner" aria-hidden="true" /> Verificando acceso…</div>;
  }

  const currentPage = {
    login: <LoginPage onAuthenticated={handleAuthenticated} onOpenConsultation={() => setActivePage('consultation')} />,
    consultation: <ConsultationPage />,
    'weekly-order': <WeeklyMealOrderPage />,
    'weekly-menu': <WeeklyMenuAdminPage />,
    home: <HomePage />,
    'daily-results': <DailyResultsPage />,
    employees: <EmployeesPage />,
    deliveries: <MealRequestsPage />,
    pending: <PendingMealsPage />,
    transfers: <MealTransfersPage />,
    users: <UsersPage />,
  }[activePage];

  return (
    <AppShell activePage={activePage} user={user} onNavigate={setActivePage} onLogout={() => void handleLogout()}>
      {currentPage}
    </AppShell>
  );
}

export default App;
