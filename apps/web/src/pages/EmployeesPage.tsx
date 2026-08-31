import { useEffect, useState } from 'react';
import { EmployeeFormModal } from '../components/EmployeeFormModal';
import { EmployeeTable } from '../components/EmployeeTable';
import {
  createEmployee,
  getEmployeeDepartments,
  getEmployees,
  updateEmployee,
} from '../services/employees.service';
import type { Employee, EmployeeInput } from '../types/employee';

export function EmployeesPage() {
  const [employees, setEmployees] = useState<Employee[]>([]);
  const [departments, setDepartments] = useState<string[]>([]);
  const [search, setSearch] = useState('');
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [isFormOpen, setIsFormOpen] = useState(false);
  const [selectedEmployee, setSelectedEmployee] = useState<Employee | null>(null);
  const [updatingId, setUpdatingId] = useState<string | null>(null);
  const [refreshKey, setRefreshKey] = useState(0);

  useEffect(() => {
    const controller = new AbortController();
    const timeout = window.setTimeout(() => {
      setIsLoading(true);
      setError(null);

      void Promise.all([
        getEmployees({ search, signal: controller.signal }),
        getEmployeeDepartments(controller.signal),
      ])
        .then(([employeeRecords, departmentRecords]) => {
          setEmployees(employeeRecords);
          setDepartments(departmentRecords);
        })
        .catch((loadError: unknown) => {
          if (loadError instanceof DOMException && loadError.name === 'AbortError') {
            return;
          }

          setError(
            loadError instanceof Error
              ? loadError.message
              : 'No fue posible cargar los empleados',
          );
        })
        .finally(() => {
          if (!controller.signal.aborted) {
            setIsLoading(false);
          }
        });
    }, 300);

    return () => {
      window.clearTimeout(timeout);
      controller.abort();
    };
  }, [search, refreshKey]);

  const openCreateForm = () => {
    setSelectedEmployee(null);
    setIsFormOpen(true);
  };

  const openEditForm = (employee: Employee) => {
    setSelectedEmployee(employee);
    setIsFormOpen(true);
  };

  const handleFormSubmit = async (values: EmployeeInput) => {
    if (selectedEmployee) {
      await updateEmployee(selectedEmployee.employeeCode, values);
    } else {
      await createEmployee(values);
    }

    setIsFormOpen(false);
    setSelectedEmployee(null);
    setRefreshKey((current) => current + 1);
  };

  const handleToggleActive = async (employee: Employee) => {
    setUpdatingId(employee.employeeCode);
    setError(null);

    try {
      const updated = await updateEmployee(employee.employeeCode, {
        active: !employee.active,
      });

      setEmployees((current) =>
        current.map((item) =>
          item.employeeCode === employee.employeeCode ? updated : item,
        ),
      );
    } catch (updateError) {
      setError(
        updateError instanceof Error
          ? updateError.message
          : 'No fue posible cambiar el estado del empleado',
      );
    } finally {
      setUpdatingId(null);
    }
  };

  return (
    <div className="page employees-page">
      <header className="page-header">
        <div>
          <span className="section-kicker">Gestión de personal</span>
          <h1>Empleados</h1>
          <p>Administra a las personas que utilizan el servicio de comedor.</p>
        </div>
        <button className="button button-primary new-employee-button" type="button" onClick={openCreateForm}>
          <svg viewBox="0 0 24 24" aria-hidden="true">
            <path d="M12 5v14M5 12h14" />
          </svg>
          Nuevo empleado
        </button>
      </header>

      <section className="employees-card" aria-labelledby="employees-list-title">
        <div className="employees-toolbar">
          <div>
            <h2 id="employees-list-title">Directorio de empleados</h2>
            <span className="result-count">
              {isLoading
                ? 'Consultando registros…'
                : `${employees.length} ${employees.length === 1 ? 'empleado' : 'empleados'}`}
            </span>
          </div>

          <label className="search-box">
            <svg viewBox="0 0 24 24" aria-hidden="true">
              <circle cx="11" cy="11" r="6.5" />
              <path d="m16 16 4 4" />
            </svg>
            <span className="sr-only">Buscar empleado</span>
            <input
              type="search"
              placeholder="Buscar por código o nombre"
              value={search}
              onChange={(event) => setSearch(event.target.value)}
            />
            {search && (
              <button
                type="button"
                aria-label="Limpiar búsqueda"
                onClick={() => setSearch('')}
              >
                ×
              </button>
            )}
          </label>
        </div>

        {error && (
          <div className="page-error" role="alert">
            <span>{error}</span>
            <button type="button" onClick={() => setRefreshKey((current) => current + 1)}>
              Reintentar
            </button>
          </div>
        )}

        <EmployeeTable
          employees={employees}
          isLoading={isLoading}
          updatingId={updatingId}
          onEdit={openEditForm}
          onToggleActive={handleToggleActive}
        />
      </section>

      {isFormOpen && (
        <EmployeeFormModal
          employee={selectedEmployee}
          departments={departments}
          onClose={() => {
            setIsFormOpen(false);
            setSelectedEmployee(null);
          }}
          onSubmit={handleFormSubmit}
        />
      )}
    </div>
  );
}
