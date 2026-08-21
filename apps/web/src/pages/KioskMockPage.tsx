import { useEffect, useState } from 'react';
import { KioskResultPanel } from '../components/KioskResultPanel';
import { getEmployees } from '../services/employees.service';
import { requestMeal } from '../services/kiosk-mock.service';
import type { Employee } from '../types/employee';
import type { KioskState, MealRequestResult } from '../types/kiosk-mock';

const RESULT_DURATION_MS = 5_000;

const wait = (milliseconds: number) =>
  new Promise((resolve) => window.setTimeout(resolve, milliseconds));

export function KioskMockPage() {
  const [employees, setEmployees] = useState<Employee[]>([]);
  const [selectedEmployeeId, setSelectedEmployeeId] = useState('');
  const [isLoading, setIsLoading] = useState(true);
  const [kioskState, setKioskState] = useState<KioskState>('IDLE');
  const [result, setResult] = useState<MealRequestResult | null>(null);
  const [error, setError] = useState<string | null>(null);

  const resetKiosk = () => {
    setKioskState('IDLE');
    setResult(null);
    setError(null);
  };

  useEffect(() => {
    const controller = new AbortController();

    void getEmployees({ active: true, signal: controller.signal })
      .then((activeEmployees) => {
        setEmployees(activeEmployees);
        setSelectedEmployeeId(
          (current) => current || activeEmployees[0]?.employeeCode || '',
        );
      })
      .catch((loadError: unknown) => {
        if (loadError instanceof DOMException && loadError.name === 'AbortError') {
          return;
        }

        setError(
          loadError instanceof Error
            ? loadError.message
            : 'No fue posible consultar los empleados activos',
        );
        setKioskState('ERROR');
      })
      .finally(() => {
        if (!controller.signal.aborted) {
          setIsLoading(false);
        }
      });

    return () => controller.abort();
  }, []);

  useEffect(() => {
    if (kioskState === 'IDLE' || kioskState === 'PROCESSING') {
      return undefined;
    }

    const timeoutId = window.setTimeout(() => {
      setKioskState('IDLE');
      setResult(null);
      setError(null);
    }, RESULT_DURATION_MS);

    return () => window.clearTimeout(timeoutId);
  }, [kioskState]);

  const handleSimulate = async () => {
    if (!selectedEmployeeId) {
      setError('Selecciona un empleado activo');
      setKioskState('ERROR');
      return;
    }

    setError(null);
    setResult(null);
    setKioskState('PROCESSING');

    try {
      const [mealResult] = await Promise.all([
        requestMeal(selectedEmployeeId),
        wait(700),
      ]);
      setResult(mealResult);

      if (mealResult.status === 'EMPLOYEE_NOT_FOUND') {
        setError('No existe un empleado asociado con esta identificación.');
        setKioskState('ERROR');
        return;
      }

      setKioskState(mealResult.status);
    } catch (simulationError) {
      setError(
        simulationError instanceof Error
          ? simulationError.message
          : 'No fue posible simular la identificación',
      );
      setKioskState('ERROR');
    }
  };

  const isProcessing = kioskState === 'PROCESSING';
  const isIdle = kioskState === 'IDLE';

  return (
    <div className="page kiosk-page">
      <header className="page-header kiosk-header">
        <div>
          <span className="section-kicker">Herramienta temporal</span>
          <h1>Simulador de comedor</h1>
          <p>Simula la identificación y registra la entrega diaria de almuerzo.</p>
        </div>
        <span className="mock-badge">Modo simulación</span>
      </header>

      <div className={`kiosk-layout ${isIdle ? '' : 'has-active-state'}`}>
        <section className="kiosk-card" aria-labelledby="kiosk-card-title">
          <div className="kiosk-card-copy">
            <span className="kiosk-step">Paso 1</span>
            <h2 id="kiosk-card-title">Selecciona un empleado</h2>
            <p>El selector reemplaza temporalmente al lector biométrico.</p>
          </div>

          <label className="employee-select-field">
            <span>Empleado activo</span>
            <div className="select-wrap">
              <svg viewBox="0 0 24 24" aria-hidden="true">
                <circle cx="9" cy="8" r="3" />
                <path d="M3.5 19c.4-3.4 2.2-5.2 5.5-5.2s5.1 1.8 5.5 5.2M17 8h4M19 6v4" />
              </svg>
              <select
                value={selectedEmployeeId}
                disabled={isLoading || !isIdle || employees.length === 0}
                onChange={(event) => {
                  setSelectedEmployeeId(event.target.value);
                  resetKiosk();
                }}
              >
                {isLoading && <option value="">Consultando empleados…</option>}
                {!isLoading && employees.length === 0 && (
                  <option value="">No hay empleados activos</option>
                )}
                {employees.map((employee) => (
                  <option value={employee.employeeCode} key={employee.employeeCode}>
                    {employee.name} — {employee.employeeCode}
                  </option>
                ))}
              </select>
              <svg className="select-arrow" viewBox="0 0 24 24" aria-hidden="true">
                <path d="m8 10 4 4 4-4" />
              </svg>
            </div>
          </label>

          <div className={`fingerprint-stage ${isProcessing ? 'is-scanning' : ''}`}>
            <div className="fingerprint-rings" aria-hidden="true">
              <span />
              <span />
              <div className="fingerprint-icon">
                <svg viewBox="0 0 64 64">
                  <path d="M18 26c1.5-7 6.7-11 14-11s12.5 4 14 11" />
                  <path d="M14 32c0-10.5 7.1-18 18-18s18 7.5 18 18" />
                  <path d="M22 31c0-6.2 3.7-10 10-10s10 3.8 10 10c0 8-1.6 14.6-5 20" />
                  <path d="M28 32c0-2.7 1.3-4 4-4s4 1.3 4 4c0 10-2.7 17.3-8 22" />
                  <path d="M17 38c.8 8.2 4.2 14.2 10 18M47 36c-.2 6.4-1.9 12-5 17" />
                </svg>
              </div>
            </div>
            <div>
              <strong>{isProcessing ? 'Procesando identificación…' : 'Simulación de huella'}</strong>
              <span>
                {isProcessing
                  ? 'Buscando empleado y comida reservada'
                  : 'Presiona el botón para simular el lector'}
              </span>
            </div>
          </div>

          <button
            className="button button-primary simulate-button"
            type="button"
            disabled={isLoading || !isIdle || !selectedEmployeeId}
            onClick={() => void handleSimulate()}
          >
            {isProcessing ? (
              <>
                <span className="button-spinner" aria-hidden="true" />
                Procesando…
              </>
            ) : (
              <>
                <svg viewBox="0 0 24 24" aria-hidden="true">
                  <path d="M7 11c0-3.2 1.8-5 5-5s5 1.8 5 5c0 4.5-1 8-3 10M4 12c0-5 3-9 8-9s8 4 8 9" />
                  <path d="M10 12c0-1.3.7-2 2-2s2 .7 2 2c0 4-1 7-3 9M6 16c.6 2.1 1.5 3.8 2.8 5" />
                </svg>
                Simular huella
              </>
            )}
          </button>
        </section>

        <aside className="kiosk-info-panel">
          <KioskResultPanel
            state={kioskState}
            result={result}
            error={error}
            onReset={resetKiosk}
          />
        </aside>
      </div>
    </div>
  );
}
