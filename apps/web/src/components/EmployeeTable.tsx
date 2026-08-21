import type { Employee } from '../types/employee';
import { StatusBadge } from './StatusBadge';

interface EmployeeTableProps {
  employees: Employee[];
  isLoading: boolean;
  updatingId: string | null;
  onEdit: (employee: Employee) => void;
  onToggleActive: (employee: Employee) => void;
}

export function EmployeeTable({
  employees,
  isLoading,
  updatingId,
  onEdit,
  onToggleActive,
}: EmployeeTableProps) {
  if (isLoading) {
    return (
      <div className="table-loading" aria-label="Cargando empleados">
        {Array.from({ length: 5 }).map((_, index) => (
          <div className="skeleton-row" key={index}>
            {Array.from({ length: 6 }).map((__, cellIndex) => (
              <span key={cellIndex} />
            ))}
          </div>
        ))}
      </div>
    );
  }

  if (employees.length === 0) {
    return (
      <div className="empty-state">
        <span className="empty-state-icon" aria-hidden="true">
          <svg viewBox="0 0 24 24">
            <circle cx="9" cy="8" r="3" />
            <path d="M3.5 19c.5-3.5 2.3-5.2 5.5-5.2 3.3 0 5.1 1.7 5.5 5.2M16 8h5M18.5 5.5v5" />
          </svg>
        </span>
        <h3>No encontramos empleados</h3>
        <p>Prueba con otra búsqueda o registra un nuevo empleado.</p>
      </div>
    );
  }

  return (
    <div className="table-scroll">
      <table className="employees-table">
        <thead>
          <tr>
            <th>Código</th>
            <th>Empleado</th>
            <th>Correo</th>
            <th>Departamento</th>
            <th>Estado</th>
            <th className="actions-column">Acciones</th>
          </tr>
        </thead>
        <tbody>
          {employees.map((employee) => {
            const isUpdating = updatingId === employee.employeeCode;

            return (
              <tr key={employee.employeeCode}>
                <td>
                  <span className="employee-code" title={employee.employeeCode}>
                    {employee.employeeCode}
                  </span>
                </td>
                <td>
                  <div className="employee-identity">
                    <span className="employee-avatar" aria-hidden="true">
                      {employee.name.charAt(0).toUpperCase()}
                    </span>
                    <strong>{employee.name}</strong>
                  </div>
                </td>
                <td className="employee-email" title={employee.email}>
                  {employee.email}
                </td>
                <td>{employee.department}</td>
                <td>
                  <StatusBadge active={employee.active} />
                </td>
                <td>
                  <div className="row-actions">
                    <button
                      className="button button-quiet button-small"
                      type="button"
                      onClick={() => onEdit(employee)}
                    >
                      Editar
                    </button>
                    <button
                      className={`button button-small ${
                        employee.active ? 'button-danger-quiet' : 'button-success-quiet'
                      }`}
                      type="button"
                      disabled={isUpdating}
                      onClick={() => onToggleActive(employee)}
                    >
                      {isUpdating
                        ? 'Guardando…'
                        : employee.active
                          ? 'Desactivar'
                          : 'Activar'}
                    </button>
                  </div>
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}
