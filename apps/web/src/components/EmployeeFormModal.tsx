import { useEffect, useMemo, useState } from 'react';
import type { FormEvent, MouseEvent } from 'react';
import type { Employee, EmployeeInput } from '../types/employee';

interface EmployeeFormModalProps {
  employee: Employee | null;
  departments: string[];
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

function getDepartmentKey(value: string) {
  return value
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/\s+/g, ' ')
    .trim()
    .toLocaleUpperCase('es');
}

export function EmployeeFormModal({
  employee,
  departments,
  onClose,
  onSubmit,
}: EmployeeFormModalProps) {
  const [values, setValues] = useState<EmployeeInput>(emptyForm);
  const [isSaving, setIsSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [isDepartmentOpen, setIsDepartmentOpen] = useState(false);
  const [pendingValues, setPendingValues] = useState<EmployeeInput | null>(null);

  const matchingDepartment = useMemo(() => {
    const key = getDepartmentKey(values.department);
    return departments.find((department) => getDepartmentKey(department) === key) ?? null;
  }, [departments, values.department]);
  const filteredDepartments = useMemo(() => {
    const search = getDepartmentKey(values.department);
    return departments.filter((department) =>
      !search || getDepartmentKey(department).includes(search));
  }, [departments, values.department]);

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
    setPendingValues(null);
    setIsDepartmentOpen(false);
  }, [employee]);

  useEffect(() => {
    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = 'hidden';

    const handleEscape = (event: KeyboardEvent) => {
      if (event.key === 'Escape' && !isSaving) {
        if (pendingValues) {
          setPendingValues(null);
          return;
        }
        if (isDepartmentOpen) {
          setIsDepartmentOpen(false);
          return;
        }
        onClose();
      }
    };

    window.addEventListener('keydown', handleEscape);

    return () => {
      document.body.style.overflow = previousOverflow;
      window.removeEventListener('keydown', handleEscape);
    };
  }, [isDepartmentOpen, isSaving, onClose, pendingValues]);

  const handleBackdropClick = (event: MouseEvent<HTMLDivElement>) => {
    if (event.target === event.currentTarget && !isSaving && !pendingValues) {
      onClose();
    }
  };

  const saveEmployee = async (employeeValues: EmployeeInput) => {
    setError(null);
    setIsSaving(true);

    try {
      await onSubmit(employeeValues);
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

  const handleSubmit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    const employeeValues: EmployeeInput = {
      employeeCode: values.employeeCode.trim(),
      name: values.name.trim(),
      email: values.email.trim(),
      department: matchingDepartment ?? values.department.trim().replace(/\s+/g, ' '),
      active: values.active,
    };

    if (!matchingDepartment) {
      setPendingValues(employeeValues);
      setIsDepartmentOpen(false);
      return;
    }

    await saveEmployee(employeeValues);
  };

  const confirmNewDepartment = async () => {
    if (!pendingValues) return;
    const employeeValues = pendingValues;
    setPendingValues(null);
    await saveEmployee(employeeValues);
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

          <div className="form-field department-field">
            <label htmlFor="employee-department">Departamento</label>
            <div className="department-combobox">
              <input
                id="employee-department"
                required
                maxLength={100}
                type="text"
                role="combobox"
                aria-autocomplete="list"
                aria-expanded={isDepartmentOpen}
                aria-controls="employee-department-options"
                autoComplete="off"
                placeholder="Busca o escribe un departamento"
                value={values.department}
                onFocus={() => setIsDepartmentOpen(true)}
                onBlur={() => setIsDepartmentOpen(false)}
                onChange={(event) => {
                  setValues((current) => ({
                    ...current,
                    department: event.target.value,
                  }));
                  setIsDepartmentOpen(true);
                }}
              />
              <button
                type="button"
                aria-label={isDepartmentOpen ? 'Cerrar departamentos' : 'Mostrar departamentos'}
                aria-expanded={isDepartmentOpen}
                disabled={isSaving}
                onMouseDown={(event) => event.preventDefault()}
                onClick={() => setIsDepartmentOpen((current) => !current)}
              >
                <svg viewBox="0 0 24 24" aria-hidden="true"><path d="m7 10 5 5 5-5" /></svg>
              </button>
              {isDepartmentOpen && (
                <div className="department-options" id="employee-department-options" role="listbox">
                  {filteredDepartments.length === 0 ? (
                    <div className="department-empty-option">No hay departamentos que coincidan.</div>
                  ) : filteredDepartments.map((department) => (
                    <button
                      type="button"
                      role="option"
                      aria-selected={matchingDepartment === department}
                      className={matchingDepartment === department ? 'is-selected' : ''}
                      key={department}
                      onMouseDown={(event) => event.preventDefault()}
                      onClick={() => {
                        setValues((current) => ({ ...current, department }));
                        setIsDepartmentOpen(false);
                      }}
                    >
                      <span>{department}</span>
                      {matchingDepartment === department && <strong aria-hidden="true">✓</strong>}
                    </button>
                  ))}
                  {values.department.trim() && !matchingDepartment && (
                    <div className="department-new-hint">
                      “{values.department.trim()}” se guardará como un departamento nuevo.
                    </div>
                  )}
                </div>
              )}
            </div>
            <small>Selecciona uno existente para mantener los empleados agrupados correctamente.</small>
          </div>

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

      {pendingValues && (
        <div
          className="department-confirmation-layer"
          role="presentation"
          onMouseDown={(event) => {
            if (event.target === event.currentTarget && !isSaving) {
              setPendingValues(null);
            }
          }}
        >
          <section
            className="department-confirmation-modal"
            role="alertdialog"
            aria-modal="true"
            aria-labelledby="department-confirmation-title"
            aria-describedby="department-confirmation-description"
          >
            <span className="department-confirmation-icon" aria-hidden="true">?</span>
            <div>
              <span className="section-kicker">Nuevo departamento</span>
              <h3 id="department-confirmation-title">¿Estás seguro de crear un nuevo departamento?</h3>
              <p id="department-confirmation-description">
                No encontramos <strong>“{pendingValues.department}”</strong> entre los departamentos existentes. Si continúas, quedará disponible para futuros empleados.
              </p>
            </div>
            <footer>
              <button className="button button-secondary" type="button" disabled={isSaving} onClick={() => setPendingValues(null)}>No, revisar</button>
              <button className="button button-primary" type="button" disabled={isSaving} onClick={() => void confirmNewDepartment()}>
                {isSaving ? <><span className="button-spinner" aria-hidden="true" /> Guardando…</> : 'Sí, crear departamento'}
              </button>
            </footer>
          </section>
        </div>
      )}
    </div>
  );
}
