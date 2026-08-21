import type { KioskState, MealRequestResult } from '../types/kiosk-mock';

interface KioskResultPanelProps {
  state: KioskState;
  result: MealRequestResult | null;
  error: string | null;
  onReset: () => void;
}

function formatTime12Hour(time: string) {
  const [hourText = '0', minute = '00'] = time.split(':');
  const hour = Number(hourText);
  const suffix = hour >= 12 ? 'PM' : 'AM';
  const displayHour = hour % 12 || 12;

  return `${displayHour}:${minute} ${suffix}`;
}

function IdlePanel() {
  return (
    <div className="simulation-explainer">
      <span className="kiosk-step">¿Qué sucede aquí?</span>
      <h2>Flujo biométrico simulado</h2>
      <ol>
        <li><span>1</span><div><strong>Seleccionas al empleado</strong><small>Representa el dedo sobre el lector.</small></div></li>
        <li><span>2</span><div><strong>NestJS valida la identidad</strong><small>Confirma que existe y está activo.</small></div></li>
        <li><span>3</span><div><strong>Busca la reserva de hoy</strong><small>Solo entrega la comida previamente solicitada.</small></div></li>
      </ol>
      <p>No se captura, genera ni almacena ninguna huella real.</p>
    </div>
  );
}

function ProcessingPanel() {
  return (
    <div className="kiosk-processing-screen" role="status">
      <span className="processing-pulse" aria-hidden="true">
        <svg viewBox="0 0 24 24">
          <path d="M7 11c0-3.2 1.8-5 5-5s5 1.8 5 5c0 4.5-1 8-3 10M4 12c0-5 3-9 8-9s8 4 8 9" />
          <path d="M10 12c0-1.3.7-2 2-2s2 .7 2 2c0 4-1 7-3 9M6 16c.6 2.1 1.5 3.8 2.8 5" />
        </svg>
      </span>
      <span className="kiosk-step">Procesando</span>
      <h2>Validando empleado y reserva</h2>
      <p>Espera un momento. Estamos consultando la comida asignada.</p>
    </div>
  );
}

export function KioskResultPanel({
  state,
  result,
  error,
  onReset,
}: KioskResultPanelProps) {
  if (state === 'IDLE') {
    return <IdlePanel />;
  }

  if (state === 'PROCESSING') {
    return <ProcessingPanel />;
  }

  const employee = result && 'employee' in result ? result.employee : null;
  const isApproved = state === 'APPROVED' && result?.status === 'APPROVED';
  const isDuplicate = state === 'DUPLICATE' && result?.status === 'DUPLICATE';
  const mealName =
    result && 'meal' in result ? result.meal.name : null;
  const title = {
    APPROVED: 'APROBADO',
    DUPLICATE: 'COMIDA YA RETIRADA',
    NO_MEAL_RESERVED: 'SIN ALMUERZO SOLICITADO',
    EMPLOYEE_INACTIVE: 'EMPLEADO INACTIVO',
    ERROR: 'NO FUE POSIBLE PROCESAR',
  }[state];
  const tone = state.toLowerCase().replaceAll('_', '-');

  return (
    <div className={`kiosk-result-screen state-${tone}`} role="status">
      <span className="kiosk-result-symbol" aria-hidden="true">
        {isApproved ? '✓' : '×'}
      </span>
      <span className="kiosk-result-title">{title}</span>

      {employee && (
        <div className="kiosk-result-employee">
          <h2>{employee.name}</h2>
          <span>Empleado {employee.code}</span>
        </div>
      )}

      {(isApproved || isDuplicate) && mealName && (
        <div className="kiosk-meal-highlight">
          <span>Comida</span>
          <strong>{mealName}</strong>
        </div>
      )}

      {isApproved && (
        <time className="kiosk-result-time">
          {formatTime12Hour(result.requestedAt.slice(11, 19))}
        </time>
      )}

      {isDuplicate && (
        <div className="kiosk-duplicate-time">
          <span>Retirada:</span>
          <strong>{formatTime12Hour(result.previousRequest.time)}</strong>
        </div>
      )}

      {state === 'NO_MEAL_RESERVED' && (
        <p className="kiosk-result-message">
          No tiene comida registrada para el día de hoy.
        </p>
      )}

      {state === 'EMPLOYEE_INACTIVE' && (
        <p className="kiosk-result-message">
          El empleado está inactivo. No se autorizó ninguna entrega.
        </p>
      )}

      {state === 'ERROR' && (
        <p className="kiosk-result-message">
          {error ?? 'Ocurrió un error inesperado durante la identificación.'}
        </p>
      )}

      <div className="kiosk-auto-reset">
        <span>Regresando al inicio en 5 segundos</span>
        <button type="button" onClick={onReset}>Continuar</button>
        <i aria-hidden="true" />
      </div>
    </div>
  );
}
