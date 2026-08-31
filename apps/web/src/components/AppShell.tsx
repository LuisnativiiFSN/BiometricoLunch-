import type { ReactNode } from 'react';
import { fasaniLogo } from '../assets/fasani-logo';
import type { AuthUser, UserRole } from '../types/auth';

export type AppPage = 'login' | 'consultation' | 'weekly-order' | 'weekly-menu' | 'meal-adjustments' | 'meal-audit' | 'home' | 'daily-results' | 'employees' | 'deliveries' | 'pending' | 'transfers' | 'users';

interface AppShellProps {
  activePage: AppPage;
  children: ReactNode;
  user: AuthUser | null;
  onNavigate: (page: AppPage) => void;
  onLogout: () => void;
}

const navigation: Array<{ id: AppPage; label: string; public?: boolean; roles?: UserRole[] }> = [
  { id: 'login', label: 'Iniciar sesión', public: true },
  { id: 'consultation', label: 'Consulta', public: true, roles: ['ADMIN', 'RH'] },
  { id: 'weekly-order', label: 'Encargar comida', public: true, roles: ['ADMIN', 'RH'] },
  { id: 'deliveries', label: 'Entregas' },
  { id: 'pending', label: 'Pendientes' },
  { id: 'daily-results', label: 'Resultados de hoy' },
  { id: 'home', label: 'Resultados semanales' },
  { id: 'weekly-menu', label: 'Menú de la semana', roles: ['ADMIN', 'RH'] },
  { id: 'meal-adjustments', label: 'Modificar almuerzo', roles: ['RH'] },
  { id: 'transfers', label: 'Transferencias', roles: ['ADMIN', 'RH'] },
  { id: 'meal-audit', label: 'Reportes', roles: ['ADMIN', 'RH'] },
  { id: 'employees', label: 'Empleados', roles: ['ADMIN', 'RH'] },
  { id: 'users', label: 'Usuarios', roles: ['ADMIN'] },
];

const navigationSections: Array<{ label: string; pages: AppPage[] }> = [
  {
    label: 'Acceso público',
    pages: ['consultation', 'weekly-order'],
  },
  {
    label: 'Operación diaria',
    pages: ['deliveries', 'pending', 'daily-results', 'home'],
  },
  {
    label: 'Configuración',
    pages: [
      'weekly-menu',
      'meal-adjustments',
      'transfers',
      'meal-audit',
      'employees',
      'users',
    ],
  },
];

function NavigationIcon({ page }: { page: AppPage }) {
  if (page === 'login' || page === 'consultation' || page === 'users' || page === 'transfers' || page === 'meal-adjustments' || page === 'meal-audit') {
    const glyph = page === 'login' ? '↗' : page === 'consultation' ? '?' : page === 'transfers' ? '⇄' : page === 'meal-adjustments' ? '✎' : page === 'meal-audit' ? '⇩' : 'U';
    return <span className="nav-glyph" aria-hidden="true">{glyph}</span>;
  }

  if (page === 'home') {
    return (
      <svg viewBox="0 0 24 24" aria-hidden="true">
        <path d="M4 20V10M10 20V5M16 20v-7M22 20H2" />
      </svg>
    );
  }

  if (page === 'daily-results') {
    return (
      <svg viewBox="0 0 24 24" aria-hidden="true">
        <circle cx="12" cy="12" r="8" />
        <path d="M12 4v8l5.5 5.5" />
      </svg>
    );
  }

  if (page === 'employees') {
    return (
      <svg viewBox="0 0 24 24" aria-hidden="true">
        <circle cx="9" cy="8" r="3" />
        <path d="M3.5 19c.4-3.4 2.2-5.2 5.5-5.2s5.1 1.8 5.5 5.2" />
        <path d="M15.5 6.2a3 3 0 0 1 0 5.6M16.2 14.2c2.5.5 3.9 2.1 4.3 4.8" />
      </svg>
    );
  }

  if (page === 'pending') {
    return (
      <svg viewBox="0 0 24 24" aria-hidden="true">
        <circle cx="12" cy="12" r="8" />
        <path d="M12 8v4l2.7 2" />
      </svg>
    );
  }

  return (
    <svg viewBox="0 0 24 24" aria-hidden="true">
      <path d="M7 3v3M17 3v3M4 9h16" />
      <rect x="4" y="5" width="16" height="16" rx="2" />
      <path d="m8 15 2.2 2.2L16 12" />
    </svg>
  );
}

const roleNames: Record<UserRole, string> = {
  ADMIN: 'Administrador',
  RH: 'Recursos Humanos',
  CHEF: 'Chef',
};

export function AppShell({ activePage, children, user, onNavigate, onLogout }: AppShellProps) {
  const visibleNavigation = navigation.filter((item) => {
    if (!user) return item.public === true;
    if (item.id === 'login') return false;
    return !item.roles || item.roles.includes(user.role);
  });
  const groupedNavigation = user?.role === 'ADMIN' || user?.role === 'RH';
  const renderNavigationItem = (item: (typeof navigation)[number]) => (
    <button
      className={`nav-item ${activePage === item.id ? 'is-active' : ''}`}
      type="button"
      key={item.id}
      aria-current={activePage === item.id ? 'page' : undefined}
      onClick={() => onNavigate(item.id)}
    >
      <NavigationIcon page={item.id} />
      <span>{item.label}</span>
    </button>
  );

  return (
    <div className="app-shell">
      <aside className="sidebar">
        <div className="brand">
          <span className="brand-mark">
            <img src={fasaniLogo} alt="Ícono de Fasani" />
          </span>
          <span className="brand-copy">
            <strong>Comedor</strong>
            <small>Fasani</small>
          </span>
        </div>

        <nav className="main-nav" aria-label="Navegación principal">
          {groupedNavigation ? navigationSections.map((section) => {
            const items = section.pages.flatMap((page) => {
              const item = visibleNavigation.find((candidate) => candidate.id === page);
              return item ? [item] : [];
            });
            if (items.length === 0) return null;
            return (
              <section className="nav-section" aria-label={section.label} key={section.label}>
                <span className="nav-label">{section.label}</span>
                {items.map(renderNavigationItem)}
              </section>
            );
          }) : (
            <>
              <span className="nav-label">Menú principal</span>
              {visibleNavigation.map(renderNavigationItem)}
            </>
          )}
        </nav>

        {user ? (
          <div className="sidebar-account">
            <span className="account-avatar" aria-hidden="true">{user.username.slice(0, 1).toUpperCase()}</span>
            <span className="account-copy"><strong>{user.username}</strong><small>{roleNames[user.role]}</small></span>
            <button type="button" onClick={onLogout}>Salir</button>
          </div>
        ) : (
          <div className="sidebar-footer"><span className="connection-dot" aria-hidden="true" /><span><strong>Acceso público</strong><small>Funciones restringidas</small></span></div>
        )}
      </aside>

      <main className="main-content">{children}</main>
    </div>
  );
}
