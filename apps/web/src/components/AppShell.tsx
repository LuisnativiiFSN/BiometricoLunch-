import type { ReactNode } from 'react';
import { fasaniLogo } from '../assets/fasani-logo';
import type { AuthUser, UserRole } from '../types/auth';

export type AppPage = 'login' | 'consultation' | 'home' | 'employees' | 'deliveries' | 'pending' | 'manual' | 'users';

interface AppShellProps {
  activePage: AppPage;
  children: ReactNode;
  user: AuthUser | null;
  onNavigate: (page: AppPage) => void;
  onLogout: () => void;
}

const navigation: Array<{ id: AppPage; label: string; public?: boolean; roles?: UserRole[] }> = [
  { id: 'login', label: 'Iniciar sesión', public: true },
  { id: 'consultation', label: 'Consulta', public: true, roles: ['ADMIN', 'RH', 'CHEF'] },
  { id: 'home', label: 'Inicio' },
  { id: 'employees', label: 'Empleados', roles: ['ADMIN', 'RH'] },
  { id: 'deliveries', label: 'Entregas' },
  { id: 'pending', label: 'Pendientes' },
  { id: 'manual', label: 'Solicitud manual', roles: ['ADMIN'] },
  { id: 'users', label: 'Usuarios', roles: ['ADMIN'] },
];

function NavigationIcon({ page }: { page: AppPage }) {
  if (page === 'login' || page === 'consultation' || page === 'users') {
    const glyph = page === 'login' ? '↗' : page === 'consultation' ? '?' : 'U';
    return <span className="nav-glyph" aria-hidden="true">{glyph}</span>;
  }

  if (page === 'home') {
    return (
      <svg viewBox="0 0 24 24" aria-hidden="true">
        <path d="M3 11.5 12 4l9 7.5" />
        <path d="M5.5 10.5V20h13v-9.5M9.5 20v-6h5v6" />
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

  if (page === 'manual') {
    return (
      <svg viewBox="0 0 24 24" aria-hidden="true">
        <path d="M12 5v14M5 12h14" />
        <circle cx="12" cy="12" r="9" />
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
          <span className="nav-label">Menú principal</span>
          {visibleNavigation.map((item) => (
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
          ))}
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
