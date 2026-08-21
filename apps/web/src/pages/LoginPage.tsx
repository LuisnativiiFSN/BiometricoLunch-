import { useState, type FormEvent } from 'react';
import { login } from '../services/auth.service';
import type { AuthUser } from '../types/auth';

interface LoginPageProps {
  onAuthenticated: (user: AuthUser) => void;
  onOpenConsultation: () => void;
}

export function LoginPage({ onAuthenticated, onOpenConsultation }: LoginPageProps) {
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const handleSubmit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setIsSubmitting(true);
    setError(null);

    try {
      const response = await login(username, password);
      onAuthenticated(response.user);
    } catch (loginError) {
      setError(loginError instanceof Error ? loginError.message : 'No fue posible iniciar sesión');
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <div className="page login-page">
      <div className="login-layout">
        <section className="login-intro">
          <span className="section-kicker">Acceso protegido</span>
          <h1>Control del comedor, según tu función.</h1>
          <p>Administración, Recursos Humanos y Cocina cuentan con espacios y permisos independientes.</p>
          <div className="access-role-list" aria-label="Roles disponibles">
            <span><i /> Administrador</span>
            <span><i /> Recursos Humanos</span>
            <span><i /> Chef</span>
          </div>
        </section>

        <section className="login-card" aria-labelledby="login-title">
          <span className="login-lock" aria-hidden="true">●</span>
          <span className="card-eyebrow">Portal interno</span>
          <h2 id="login-title">Iniciar sesión</h2>
          <p>Ingresa tus credenciales para continuar.</p>

          <form className="login-form" onSubmit={(event) => void handleSubmit(event)}>
            <label className="form-field">
              <span>Usuario</span>
              <input
                autoComplete="username"
                value={username}
                maxLength={50}
                disabled={isSubmitting}
                onChange={(event) => setUsername(event.target.value)}
              />
            </label>
            <label className="form-field">
              <span>Contraseña</span>
              <input
                type="password"
                autoComplete="current-password"
                value={password}
                maxLength={72}
                disabled={isSubmitting}
                onChange={(event) => setPassword(event.target.value)}
              />
            </label>
            {error && <div className="form-error" role="alert">{error}</div>}
            <button className="button button-primary login-submit" type="submit" disabled={isSubmitting || !username.trim() || !password}>
              {isSubmitting ? 'Verificando…' : 'Entrar al portal'}
            </button>
          </form>

          <button className="public-consultation-link" type="button" onClick={onOpenConsultation}>
            Soy empleado y quiero consultar mis comidas
          </button>
        </section>
      </div>
    </div>
  );
}
