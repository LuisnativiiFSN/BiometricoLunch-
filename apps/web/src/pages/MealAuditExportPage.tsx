import { useMemo, useState, type FormEvent } from 'react';
import {
  downloadDailyMealOrders,
  downloadEmployeeMealAudit,
  downloadPayrollMealReport,
  downloadWeeklyMealOrders,
} from '../services/meal-audits.service';

type ReportMode = 'individual' | 'payroll' | 'orders';
type ExportKind = 'individual' | 'payroll' | 'daily' | 'weekly';

function getGuatemalaDate() {
  const parts = new Intl.DateTimeFormat('en-US', {
    timeZone: 'America/Guatemala',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).formatToParts(new Date());
  const values = Object.fromEntries(parts.map((part) => [part.type, part.value]));
  return `${values.year}-${values.month}-${values.day}`;
}

function getMonthStart(date: string) {
  return `${date.slice(0, 7)}-01`;
}

function moveDate(date: string, days: number) {
  const value = new Date(`${date}T00:00:00.000Z`);
  value.setUTCDate(value.getUTCDate() + days);
  return value.toISOString().slice(0, 10);
}

function getMonday(date: string) {
  const value = new Date(`${date}T00:00:00.000Z`);
  const day = value.getUTCDay();
  value.setUTCDate(value.getUTCDate() + (day === 0 ? -6 : 1 - day));
  return value.toISOString().slice(0, 10);
}

function formatDate(date: string, includeYear = false) {
  return new Intl.DateTimeFormat('es-GT', {
    day: 'numeric',
    month: 'long',
    ...(includeYear ? { year: 'numeric' } : {}),
  }).format(new Date(`${date}T12:00:00`));
}

function formatWeek(start: string) {
  return `${formatDate(start)} al ${formatDate(moveDate(start, 4), true)}`;
}

function formatDayOption(date: string) {
  const value = new Intl.DateTimeFormat('es-GT', {
    weekday: 'long',
    day: 'numeric',
    month: 'long',
  }).format(new Date(`${date}T12:00:00`));
  return value.charAt(0).toUpperCase() + value.slice(1);
}

function formatWeekdayShort(date: string) {
  const value = new Intl.DateTimeFormat('es-GT', { weekday: 'short' })
    .format(new Date(`${date}T12:00:00`))
    .replace('.', '');
  return value.charAt(0).toUpperCase() + value.slice(1);
}

function saveDownload(exported: { blob: Blob; fileName: string }) {
  const url = URL.createObjectURL(exported.blob);
  const link = document.createElement('a');
  link.href = url;
  link.download = exported.fileName;
  document.body.appendChild(link);
  link.click();
  link.remove();
  URL.revokeObjectURL(url);
}

export function MealAuditExportPage() {
  const today = getGuatemalaDate();
  const currentWeekStart = getMonday(today);
  const todayDay = new Date(`${today}T00:00:00.000Z`).getUTCDay();
  const defaultOrderDate = todayDay >= 1 && todayDay <= 5
    ? today
    : currentWeekStart;
  const [mode, setMode] = useState<ReportMode>('orders');
  const [employeeCode, setEmployeeCode] = useState('');
  const [startDate, setStartDate] = useState(getMonthStart(today));
  const [endDate, setEndDate] = useState(today);
  const [weekStart, setWeekStart] = useState(currentWeekStart);
  const [orderDate, setOrderDate] = useState(defaultOrderDate);
  const [exporting, setExporting] = useState<ExportKind | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);
  const weekDates = useMemo(
    () => Array.from({ length: 5 }, (_, index) => moveDate(weekStart, index)),
    [weekStart],
  );

  const changeMode = (nextMode: ReportMode) => {
    setMode(nextMode);
    setError(null);
    setSuccess(null);
  };

  const validateRange = () => {
    if (!startDate || !endDate || startDate > endDate) {
      setError('La fecha final debe ser igual o posterior a la fecha inicial.');
      return false;
    }
    return true;
  };

  const download = async (
    kind: ExportKind,
    action: () => Promise<{ blob: Blob; fileName: string }>,
  ) => {
    setExporting(kind);
    setError(null);
    setSuccess(null);
    try {
      const exported = await action();
      saveDownload(exported);
      setSuccess(`Archivo generado con los datos actuales: ${exported.fileName}`);
    } catch (exportError) {
      setError(
        exportError instanceof Error
          ? exportError.message
          : 'No fue posible generar el reporte',
      );
    } finally {
      setExporting(null);
    }
  };

  const handleAuditExport = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (!validateRange() || (mode === 'individual' && !employeeCode.trim())) return;
    if (mode === 'individual') {
      await download('individual', () =>
        downloadEmployeeMealAudit(employeeCode, startDate, endDate));
    } else {
      await download('payroll', () => downloadPayrollMealReport(startDate, endDate));
    }
  };

  const selectWeek = (nextWeek: string) => {
    setWeekStart(nextWeek);
    setOrderDate(nextWeek === currentWeekStart && todayDay >= 1 && todayDay <= 5
      ? today
      : nextWeek);
    setError(null);
    setSuccess(null);
  };

  const isIndividual = mode === 'individual';
  const isPayroll = mode === 'payroll';
  const isOrders = mode === 'orders';
  const isBusy = exporting !== null;

  return (
    <div className="page meal-audit-page">
      <header className="page-header meal-audit-header">
        <div>
          <span className="section-kicker">Centro de exportaciones</span>
          <h1>Reportes</h1>
          <p>Genera archivos actualizados para el proveedor, auditoría o nómina.</p>
        </div>
        <span className="restricted-access-badge">Administrador y RH</span>
      </header>

      <div className="meal-report-tabs" role="tablist" aria-label="Tipo de reporte">
        <button type="button" role="tab" aria-selected={isOrders} className={isOrders ? 'active' : ''} onClick={() => changeMode('orders')}>
          <span>01</span><strong>Pedidos para el proveedor</strong><small>Reporte diario o semanal</small>
        </button>
        <button type="button" role="tab" aria-selected={isIndividual} className={isIndividual ? 'active' : ''} onClick={() => changeMode('individual')}>
          <span>02</span><strong>Auditoría individual</strong><small>Detalle de una persona</small>
        </button>
        <button type="button" role="tab" aria-selected={isPayroll} className={isPayroll ? 'active' : ''} onClick={() => changeMode('payroll')}>
          <span>03</span><strong>Reporte de nómina</strong><small>Consolidado de todo el personal</small>
        </button>
      </div>

      <section className="meal-audit-card" aria-labelledby="meal-audit-form-title">
        <div className="meal-audit-intro">
          <span className="audit-icon" aria-hidden="true">⇩</span>
          <div>
            <span className="card-eyebrow">Exportación privada</span>
            <h2 id="meal-audit-form-title">
              {isOrders
                ? 'Pedidos diarios y semanales'
                : isIndividual
                  ? 'Selecciona a la persona y el período'
                  : 'Selecciona el período de nómina'}
            </h2>
            <p>
              {isOrders
                ? 'Incluye todas las reservaciones solicitadas, aunque ya se hayan entregado.'
                : isIndividual
                  ? 'Obtendrás cada reservación, su comida y su estado de entrega.'
                  : 'Cada reservación se cobra aunque esté pendiente. Si fue transferida, se asigna al beneficiario.'}
            </p>
          </div>
        </div>

        {isOrders ? (
          <div className="orders-report-controls">
            <div className="report-week-picker">
              <div>
                <span>Semana seleccionada</span>
                <strong>{formatWeek(weekStart)}</strong>
                <small>El reporte semanal siempre abarca de lunes a viernes.</small>
              </div>
              <div className="report-week-nav" aria-label="Cambiar semana del reporte">
                <button type="button" disabled={isBusy} onClick={() => selectWeek(moveDate(weekStart, -7))} aria-label="Semana anterior">‹</button>
                {weekStart !== currentWeekStart && (
                  <button type="button" className="current-week-button" disabled={isBusy} onClick={() => selectWeek(currentWeekStart)}>Semana actual</button>
                )}
                <button type="button" disabled={isBusy || weekStart >= currentWeekStart} onClick={() => selectWeek(moveDate(weekStart, 7))} aria-label="Semana siguiente">›</button>
              </div>
            </div>

            <div className="order-day-field">
              <div className="order-day-heading">
                <span id="order-day-label">Día para el reporte diario</span>
                <small>{formatDayOption(orderDate)}</small>
              </div>
              <div className="order-day-options" role="radiogroup" aria-labelledby="order-day-label">
                {weekDates.map((date) => (
                  <button
                    key={date}
                    type="button"
                    role="radio"
                    aria-checked={orderDate === date}
                    className={orderDate === date ? 'is-selected' : ''}
                    disabled={isBusy}
                    onClick={() => setOrderDate(date)}
                  >
                    <span>{formatWeekdayShort(date)}</span>
                    <strong>{formatDate(date)}</strong>
                  </button>
                ))}
              </div>
            </div>

            <div className="orders-export-actions">
              <button className="button button-secondary" type="button" disabled={isBusy} onClick={() => void download('daily', () => downloadDailyMealOrders(orderDate))}>
                {exporting === 'daily' ? <><span className="button-spinner" /> Generando diario…</> : 'Exportar pedidos del día'}
              </button>
              <button className="button button-primary" type="button" disabled={isBusy} onClick={() => void download('weekly', () => downloadWeeklyMealOrders(weekStart))}>
                {exporting === 'weekly' ? <><span className="button-spinner" /> Generando semana…</> : 'Exportar pedidos de la semana'}
              </button>
            </div>
            <div className="orders-report-note">
              <span aria-hidden="true">✓</span>
              <p>Cada descarga consulta nuevamente la base de datos. El Excel contiene el detalle ordenado por departamento y código, más una hoja con totales por comida y por día.</p>
            </div>
          </div>
        ) : (
          <form className={`meal-audit-form ${isIndividual ? '' : 'payroll-form'}`} onSubmit={(event) => void handleAuditExport(event)}>
            {isIndividual && (
              <label className="form-field audit-code-field">
                <span>Código de empleado</span>
                <input value={employeeCode} maxLength={50} inputMode="numeric" autoComplete="off" placeholder="Ej. 18908" disabled={isBusy} onChange={(event) => { setEmployeeCode(event.target.value); setError(null); setSuccess(null); }} />
              </label>
            )}
            <label className="form-field">
              <span>Desde</span>
              <input type="date" value={startDate} disabled={isBusy} onChange={(event) => { setStartDate(event.target.value); setError(null); setSuccess(null); }} />
            </label>
            <label className="form-field">
              <span>Hasta</span>
              <input type="date" value={endDate} min={startDate} disabled={isBusy} onChange={(event) => { setEndDate(event.target.value); setError(null); setSuccess(null); }} />
            </label>
            <button className="button button-primary meal-audit-submit" type="submit" disabled={isBusy || (isIndividual && !employeeCode.trim()) || !startDate || !endDate}>
              {isBusy
                ? <><span className="button-spinner" /> Generando Excel…</>
                : isIndividual ? 'Descargar registro individual' : 'Descargar reporte de nómina'}
            </button>
          </form>
        )}

        {error && <div className="form-error meal-audit-message" role="alert">{error}</div>}
        {success && <div className="meal-audit-success meal-audit-message" role="status">{success}</div>}
      </section>

      <section className="meal-audit-information" aria-label="Contenido y reglas de los reportes">
        <article><span aria-hidden="true">01</span><div><strong>Datos actuales</strong><p>El archivo se reconstruye en cada clic con las reservaciones vigentes.</p></div></article>
        <article><span aria-hidden="true">02</span><div><strong>Totales para el proveedor</strong><p>Cada plato aparece separado por día, con subtotal diario y total general.</p></div></article>
        <article><span aria-hidden="true">03</span><div><strong>Acceso restringido</strong><p>Solo Administrador y RH pueden abrir Reportes y generar las descargas.</p></div></article>
      </section>
    </div>
  );
}
