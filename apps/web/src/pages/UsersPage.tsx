import { useEffect, useState, type FormEvent } from 'react';
import {
  changeUserPassword,
  changeUserStatus,
  createUser,
  getUsers,
} from '../services/users.service';
import type { ManagedUser } from '../types/auth';

export function UsersPage() {
  const [users, setUsers] = useState<ManagedUser[]>([]);
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [passwordConfirmation, setPasswordConfirmation] = useState('');
  const [role, setRole] = useState<'RH' | 'CHEF'>('RH');
  const [resetUser, setResetUser] = useState<ManagedUser | null>(null);
  const [newPassword, setNewPassword] = useState('');
  const [newPasswordConfirmation, setNewPasswordConfirmation] = useState('');
  const [isLoading, setIsLoading] = useState(true);
  const [isSaving, setIsSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);

  const loadUsers = (signal?: AbortSignal) => {
    setIsLoading(true);
    setError(null);
    void getUsers(signal)
      .then(setUsers)
      .catch((loadError: unknown) => {
        if (loadError instanceof DOMException && loadError.name === 'AbortError') return;
        setError(loadError instanceof Error ? loadError.message : 'No fue posible consultar los usuarios');
      })
      .finally(() => {
        if (!signal?.aborted) setIsLoading(false);
      });
  };

  useEffect(() => {
    const controller = new AbortController();
    loadUsers(controller.signal);
    return () => controller.abort();
  }, []);

  const handleCreate = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (password !== passwordConfirmation) {
      setError('Las contraseñas de la nueva cuenta no coinciden');
      return;
    }

    setIsSaving(true);
    setError(null);
    setSuccess(null);

    try {
      const created = await createUser(username.trim(), password, role);
      setUsers((current) => [...current, created].sort((left, right) => left.username.localeCompare(right.username)));
      setUsername('');
      setPassword('');
      setPasswordConfirmation('');
      setSuccess(`Usuario ${created.username} creado correctamente.`);
    } catch (saveError) {
      setError(saveError instanceof Error ? saveError.message : 'No fue posible crear el usuario');
    } finally {
      setIsSaving(false);
    }
  };

  const handleStatus = async (user: ManagedUser) => {
    setIsSaving(true);
    setError(null);
    setSuccess(null);

    try {
      const updated = await changeUserStatus(user.id, !user.active);
      setUsers((current) => current.map((item) => item.id === updated.id ? updated : item));
      setSuccess(`${updated.username} quedó ${updated.active ? 'activo' : 'inactivo'}.`);
    } catch (statusError) {
      setError(statusError instanceof Error ? statusError.message : 'No fue posible cambiar el estado');
    } finally {
      setIsSaving(false);
    }
  };

  const handlePasswordReset = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (!resetUser) return;
    if (newPassword !== newPasswordConfirmation) {
      setError('Las nuevas contraseñas no coinciden');
      return;
    }

    setIsSaving(true);
    setError(null);
    setSuccess(null);

    try {
      await changeUserPassword(resetUser.id, newPassword);
      setSuccess(`Contraseña de ${resetUser.username} actualizada.`);
      setResetUser(null);
      setNewPassword('');
      setNewPasswordConfirmation('');
    } catch (passwordError) {
      setError(passwordError instanceof Error ? passwordError.message : 'No fue posible cambiar la contraseña');
    } finally {
      setIsSaving(false);
    }
  };

  const roleLabel = (userRole: ManagedUser['role']) => ({ ADMIN: 'Administrador', RH: 'Recursos Humanos', CHEF: 'Chef' })[userRole];

  const closePasswordModal = () => {
    setResetUser(null);
    setNewPassword('');
    setNewPasswordConfirmation('');
    setError(null);
  };

  return (
    <div className="page users-page">
      <header className="page-header">
        <div>
          <span className="section-kicker">Solo administrador</span>
          <h1>Usuarios y accesos</h1>
          <p>Crea cuentas para Recursos Humanos y Cocina, y controla su acceso.</p>
        </div>
        <span className="security-badge">Permisos protegidos</span>
      </header>

      <div className="users-layout">
        <section className="user-create-card" aria-labelledby="create-user-title">
          <span className="card-eyebrow">Nueva cuenta</span>
          <h2 id="create-user-title">Agregar usuario</h2>
          <form className="user-form" onSubmit={(event) => void handleCreate(event)}>
            <label className="form-field"><span>Nombre de usuario</span><input value={username} minLength={3} maxLength={50} required disabled={isSaving} onChange={(event) => setUsername(event.target.value)} /></label>
            <label className="form-field"><span>Contraseña inicial</span><input type="password" autoComplete="new-password" value={password} minLength={10} maxLength={72} required disabled={isSaving} onChange={(event) => setPassword(event.target.value)} /></label>
            <label className="form-field"><span>Confirmar contraseña</span><input type="password" autoComplete="new-password" value={passwordConfirmation} minLength={10} maxLength={72} required disabled={isSaving} onChange={(event) => setPasswordConfirmation(event.target.value)} /></label>
            <label className="form-field">
              <span>Rol</span>
              <div className="select-wrap">
                <select value={role} disabled={isSaving} onChange={(event) => setRole(event.target.value as 'RH' | 'CHEF')}>
                  <option value="RH">Recursos Humanos</option>
                  <option value="CHEF">Chef</option>
                </select>
              </div>
            </label>
            {passwordConfirmation && password !== passwordConfirmation && <span className="field-hint field-hint-error">Las contraseñas no coinciden.</span>}
            <button className="button button-primary" type="submit" disabled={isSaving || username.trim().length < 3 || password.length < 10 || password !== passwordConfirmation}>{isSaving ? 'Guardando…' : 'Crear usuario'}</button>
          </form>
        </section>

        <section className="users-list-card" aria-labelledby="users-list-title">
          <div className="users-list-heading"><div><span className="card-eyebrow">Cuentas registradas</span><h2 id="users-list-title">Acceso al portal</h2></div><span>{isLoading ? '—' : users.length}</span></div>
          {error && <div className="form-error users-message" role="alert">{error}</div>}
          {success && <div className="users-success users-message" role="status">{success}</div>}
          <div className="table-scroll">
            <table className="meals-table users-table">
              <thead><tr><th>Usuario</th><th>Rol</th><th>Estado</th><th>Último acceso</th><th>Acciones</th></tr></thead>
              <tbody>
                {isLoading ? <tr><td colSpan={5} className="history-empty">Consultando usuarios…</td></tr> : users.map((user) => (
                  <tr key={user.id}>
                    <td data-label="Usuario"><strong>{user.username}</strong>{(user.passwordLocked || user.role === 'ADMIN') && <small className="protected-account">Cuenta protegida</small>}</td>
                    <td data-label="Rol">{roleLabel(user.role)}</td>
                    <td data-label="Estado"><span className={`meal-status ${user.active ? 'status-approved' : 'status-rejected'}`}>{user.active ? 'Activo' : 'Inactivo'}</span></td>
                    <td data-label="Último acceso">{user.lastLoginAt ? new Intl.DateTimeFormat('es-GT', { dateStyle: 'short', timeStyle: 'short' }).format(new Date(user.lastLoginAt)) : 'Nunca'}</td>
                    <td data-label="Acciones">
                      {user.passwordLocked || user.role === 'ADMIN' ? <span className="locked-action">Sin cambios</span> : <span className="user-actions"><button type="button" disabled={isSaving} onClick={() => { setResetUser(user); setNewPassword(''); setNewPasswordConfirmation(''); setError(null); }}>Cambiar contraseña</button><button type="button" disabled={isSaving} onClick={() => void handleStatus(user)}>{user.active ? 'Desactivar' : 'Activar'}</button></span>}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </section>
      </div>

      {resetUser && <div className="modal-backdrop" role="presentation" onMouseDown={(event) => { if (event.target === event.currentTarget && !isSaving) closePasswordModal(); }}><section className="password-modal" role="dialog" aria-modal="true" aria-labelledby="password-modal-title"><button className="modal-close" type="button" aria-label="Cerrar" disabled={isSaving} onClick={closePasswordModal}>×</button><span className="card-eyebrow">Restablecer acceso</span><h2 id="password-modal-title">Nueva contraseña para {resetUser.username}</h2><p>Debe contener al menos 10 caracteres.</p><form onSubmit={(event) => void handlePasswordReset(event)}><label className="form-field"><span>Nueva contraseña</span><input type="password" autoComplete="new-password" value={newPassword} minLength={10} maxLength={72} required autoFocus disabled={isSaving} onChange={(event) => setNewPassword(event.target.value)} /></label><label className="form-field"><span>Confirmar contraseña</span><input type="password" autoComplete="new-password" value={newPasswordConfirmation} minLength={10} maxLength={72} required disabled={isSaving} onChange={(event) => setNewPasswordConfirmation(event.target.value)} /></label>{newPasswordConfirmation && newPassword !== newPasswordConfirmation && <span className="field-hint field-hint-error">Las contraseñas no coinciden.</span>}<button className="button button-primary" type="submit" disabled={isSaving || newPassword.length < 10 || newPassword !== newPasswordConfirmation}>{isSaving ? 'Actualizando…' : 'Guardar contraseña'}</button></form></section></div>}
    </div>
  );
}
