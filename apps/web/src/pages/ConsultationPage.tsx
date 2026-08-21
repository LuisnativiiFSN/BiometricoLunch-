import { useState, type CSSProperties, type FormEvent } from 'react';
import { getEmployeeMonthlyConsultation } from '../services/consultations.service';
import type { EmployeeMonthlyConsultation } from '../types/consultation';

function getCurrentMonth() {
  const parts = new Intl.DateTimeFormat('en-US', {
    timeZone: 'America/Guatemala',
    year: 'numeric',
    month: '2-digit',
  }).formatToParts(new Date());
  const values = Object.fromEntries(parts.map((part) => [part.type, part.value]));
  return `${values.year}-${values.month}`;
}

function parseDateOnly(date: string) {
  return new Date(`${date}T12:00:00`);
}

function formatDay(date: string) {
  return new Intl.DateTimeFormat('es-GT', {
    weekday: 'short',
    day: '2-digit',
    month: 'short',
  }).format(parseDateOnly(date));
}

function formatWeek(startDate: string, endDate: string) {
  const day = new Intl.DateTimeFormat('es-GT', { day: 'numeric' });
  return `${day.format(parseDateOnly(startDate))}–${day.format(parseDateOnly(endDate))}`;
}

export function ConsultationPage() {
  const currentMonth = getCurrentMonth();
  const [employeeCode, setEmployeeCode] = useState('');
  const [month, setMonth] = useState(currentMonth);
  const [result, setResult] = useState<EmployeeMonthlyConsultation | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const handleSubmit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (!employeeCode.trim() || !month) return;
    setIsLoading(true);
    setError(null);
    setResult(null);

    try {
      setResult(await getEmployeeMonthlyConsultation(employeeCode, month));
    } catch (consultationError) {
      setError(consultationError instanceof Error ? consultationError.message : 'No fue posible consultar el historial');
    } finally {
      setIsLoading(false);
    }
  };

  const monthLabel = result
    ? new Intl.DateTimeFormat('es-GT', { month: 'long', year: 'numeric' })
      .format(new Date(`${result.month}-15T12:00:00`))
    : '';
  const maxWeeklyCount = Math.max(1, ...(result?.weeks.map((week) => week.count) ?? []));

  return (
    <div className="page consultation-page">
      <header className="page-header consultation-header">
        <div>
          <span className="section-kicker">Consulta para empleados</span>
          <h1>Tu historial de almuerzos</h1>
          <p>Consulta tus reservaciones del mes actual o revisa cualquier mes anterior.</p>
        </div>
        <span className="public-access-badge">Acceso sin sesión</span>
      </header>

      <section className="consultation-search-card consultation-search-wide" aria-labelledby="consultation-title">
        <div>
          <span className="card-eyebrow">Resumen personal</span>
          <h2 id="consultation-title">Busca por código y mes</h2>
          <p>Usa tu código de empleado. No es posible seleccionar meses futuros.</p>
        </div>
        <form className="consultation-form functional-consultation-form" onSubmit={(event) => void handleSubmit(event)}>
          <label className="form-field">
            <span>Código de empleado</span>
            <input value={employeeCode} maxLength={50} inputMode="numeric" autoComplete="off" placeholder="Ej. 18358" disabled={isLoading} onChange={(event) => { setEmployeeCode(event.target.value); setError(null); }} />
          </label>
          <label className="form-field">
            <span>Mes a consultar</span>
            <input type="month" value={month} max={currentMonth} disabled={isLoading} onChange={(event) => { setMonth(event.target.value); setError(null); }} />
          </label>
          <button className="button button-primary consultation-submit" type="submit" disabled={isLoading || !employeeCode.trim() || !month}>{isLoading ? 'Consultando…' : 'Ver mi resumen'}</button>
        </form>
        {error && <div className="form-error consultation-error" role="alert">{error}</div>}
      </section>

      {result && (
        <div className="consultation-results" aria-live="polite">
          <section className="consultation-result-heading">
            <div><span className="card-eyebrow">{monthLabel}</span><h2>{result.employee.name}</h2><span className="consultation-employee-code">Código {result.employee.code}</span></div>
            <div className="consultation-metrics">
              <article className="consultation-metric metric-total"><span>Total del mes</span><strong>{result.summary.totalLunches}</strong><small>almuerzos</small></article>
              <article><span>Entregados</span><strong>{result.summary.delivered}</strong><small>reclamados</small></article>
              <article><span>Pendientes</span><strong>{result.summary.pending}</strong><small>sin reclamar</small></article>
            </div>
          </section>

          <section className="consultation-chart-card" aria-labelledby="weekly-chart-title">
            <div className="consultation-section-heading"><div><span className="card-eyebrow">Distribución semanal</span><h2 id="weekly-chart-title">Almuerzos por semana</h2></div><span className="chart-month-total">{result.summary.totalLunches} en el mes</span></div>
            <div className="weekly-bars" role="img" aria-label={`Gráfico de ${result.summary.totalLunches} almuerzos durante ${monthLabel}`}>
              {result.weeks.map((week) => {
                const height = week.count === 0 ? 4 : Math.max(18, Math.round((week.count / maxWeeklyCount) * 100));
                return <div className="weekly-bar-column" key={week.startDate}><strong>{week.count}</strong><div className="weekly-bar-track"><i style={{ '--bar-height': `${height}%` } as CSSProperties} /></div><span>{formatWeek(week.startDate, week.endDate)}</span></div>;
              })}
            </div>
          </section>

          <section className="consultation-history-card" aria-labelledby="consultation-history-title">
            <div className="consultation-section-heading"><div><span className="card-eyebrow">Detalle del mes</span><h2 id="consultation-history-title">Almuerzos registrados</h2></div><span className="history-count">{result.items.length} registros</span></div>
            <div className="table-scroll">
              <table className="meals-table consultation-table">
                <thead><tr><th>Fecha</th><th>Almuerzo</th><th>Cantidad</th><th>Estado</th><th>Hora de entrega</th></tr></thead>
                <tbody>
                  {result.items.length === 0 ? <tr><td colSpan={5} className="history-empty">No hay almuerzos registrados para este mes.</td></tr> : result.items.map((item) => (
                    <tr key={item.id}>
                      <td data-label="Fecha" className="consultation-date">{formatDay(item.date)}</td>
                      <td data-label="Almuerzo"><strong>{item.mealName}</strong></td>
                      <td data-label="Cantidad">{item.quantity}</td>
                      <td data-label="Estado"><span className={`meal-status ${item.status === 'DELIVERED' ? 'status-approved' : 'status-pending'}`}>{item.status === 'DELIVERED' ? 'Entregado' : 'Pendiente'}</span></td>
                      <td data-label="Hora de entrega">{item.deliveredAt ? new Intl.DateTimeFormat('es-GT', { timeZone: 'America/Guatemala', hour: '2-digit', minute: '2-digit' }).format(new Date(item.deliveredAt)) : '—'}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </section>
        </div>
      )}
    </div>
  );
}
