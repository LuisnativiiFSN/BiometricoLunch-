import { useEffect, useState } from 'react';
import type { FormEvent, MouseEvent } from 'react';
import type { Employee, EmployeeInput } from '../types/employee';

interface EmployeeFormModalProps {
  employee: Employee | null;
  onClose: () => void;
  onSubmit: (values: EmployeeInput) => Promise<void>;
}

const emptyForm: EmployeeInput = {
  employeeCode: '',
  name: '',
  email: '',
  department: '',
  active: true,
};

export function EmployeeFormModal({
  employee,
  onClose,
  onSubmit,
}: EmployeeFormModalProps) {
  const [values, setValues] = useState<EmployeeInput>(emptyForm);
  const [isSaving, setIsSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    setValues(
      employee
        ? {
            employeeCode: employee.employeeCode,
            name: employee.name,
            email: employee.email,
            department: employee.department,
            active: employee.active,
          }
        : emptyForm,
    );
  }, [employee]);

  useEffect(() => {
    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = 'hidden';

    const handleEscape = (event: KeyboardEvent) => {
      if (event.key === 'Escape' && !isSaving) {
        onClose();
      }
    };

    window.addEventListener('keydown', handleEscape);

    return () => {
      document.body.style.overflow = previousOverflow;
      window.removeEventListener('keydown', handleEscape);
    };
  }, [isSaving, onClose]);

  const handleBackdropClick = (event: MouseEvent<HTMLDivElement>) => {
    if (event.target === event.currentTarget && !isSaving) {
      onClose();
    }
  };

  const handleSubmit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setError(null);
    setIsSaving(true);

    try {
      await onSubmit({
        employeeCode: values.employeeCode.trim(),
        name: values.name.trim(),
        email: values.email.trim(),
        department: values.department.trim(),
        active: values.active,
      });
    } catch (submitError) {
      setError(
        submitError instanceof Error
          ? submitError.message
          : 'No fue posible guardar el empleado',
      );
    } finally {
      setIsSaving(false);
    }
  };

  return (
    <div
      className="modal-backdrop"
      role="presentation"
      onMouseDown={handleBackdropClick}
    >
      <section
        className="employee-modal"
        role="dialog"
        aria-modal="true"
        aria-labelledby="employee-form-title"
      >
        <div className="modal-header">
          <div>
            <span className="section-kicker">
              {employee ? 'Actualizar información' : 'Nuevo registro'}
            </span>
            <h2 id="employee-form-title">
              {employee ? 'Editar empleado' : 'Crear empleado'}
            </h2>
          </div>
          <button
            className="modal-close"
            type="button"
            aria-label="Cerrar formulario"
            disabled={isSaving}
            onClick={onClose}
          >
            <svg viewBox="0 0 24 24" aria-hidden="true">
              <path d="m6 6 12 12M18 6 6 18" />
            </svg>
          </button>
        </div>

        <form className="employee-form" onSubmit={handleSubmit}>
          {error && (
            <div className="form-error" role="alert">
              <svg viewBox="0 0 24 24" aria-hidden="true">
                <circle cx="12" cy="12" r="9" />
                <path d="M12 7.5v5.3M12 16.5h.01" />
              </svg>
              <span>{error}</span>
            </div>
          )}

          <label className="form-field">
            <span>Código de empleado</span>
            <input
              autoFocus
              required
              maxLength={50}
              type="text"
              placeholder="Ej. 18358"
              value={values.employeeCode}
              onChange={(event) =>
                setValues((current) => ({
                  ...current,
                  employeeCode: event.target.value,
                }))
              }
            />
          </label>

          <label className="form-field">
            <span>Nombre completo</span>
            <input
              required
              maxLength={150}
              type="text"
              placeholder="Ej. Carlos Hernández"
              value={values.name}
              onChange={(event) =>
                setValues((current) => ({
                  ...current,
                  name: event.target.value,
                }))
              }
            />
          </label>

          <label className="form-field">
            <span>Correo electrónico</span>
            <input
              required
              maxLength={254}
              type="email"
              placeholder="nombre@empresa.com"
              value={values.email}
              onChange={(event) =>
                setValues((current) => ({
                  ...current,
                  email: event.target.value,
                }))
              }
            />
          </label>

          <label className="form-field">
            <span>Departamento</span>
            <input
              required
              maxLength={100}
              type="text"
              placeholder="Ej. Producción"
              value={values.department}
              onChange={(event) =>
                setValues((current) => ({
                  ...current,
                  department: event.target.value,
                }))
              }
            />
          </label>

          <label className="status-control">
            <span>
              <strong>Estado del empleado</strong>
              <small>
                Los empleados inactivos conservan todo su historial.
              </small>
            </span>
            <span className="toggle-wrap">
              <input
                type="checkbox"
                checked={values.active}
                onChange={(event) =>
                  setValues((current) => ({
                    ...current,
                    active: event.target.checked,
                  }))
                }
              />
              <span className="toggle" aria-hidden="true" />
              <span className="toggle-label">
                {values.active ? 'Activo' : 'Inactivo'}
              </span>
            </span>
          </label>

          <div className="modal-actions">
            <button
              className="button button-secondary"
              type="button"
              disabled={isSaving}
              onClick={onClose}
            >
              Cancelar
            </button>
            <button className="button button-primary" type="submit" disabled={isSaving}>
              {isSaving ? (
                <>
                  <span className="button-spinner" aria-hidden="true" />
                  Guardando…
                </>
              ) : (
                'Guardar empleado'
              )}
            </button>
          </div>
        </form>
      </section>
    </div>
  );
}
