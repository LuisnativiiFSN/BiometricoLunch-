import { useState, type CSSProperties, type FormEvent } from 'react';
import {
  getEmployeeRangeConsultation,
  getEmployeeRecentWeeksConsultation,
} from '../services/consultations.service';
import type {
  ConsultationItem,
  EmployeeRangeConsultation,
  EmployeeRecentWeeksConsultation,
} from '../types/consultation';

type ConsultationMode = 'recent' | 'range';
type ConsultationResult = EmployeeRecentWeeksConsultation | EmployeeRangeConsultation;

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

function shiftDate(date: string, days: number) {
  const shifted = new Date(`${date}T12:00:00Z`);
  shifted.setUTCDate(shifted.getUTCDate() + days);
  return shifted.toISOString().slice(0, 10);
}

function parseDateOnly(date: string) {
  return new Date(`${date}T12:00:00`);
}

function formatDay(date: string) {
  return new Intl.DateTimeFormat('es-GT', {
    weekday: 'short',
    day: '2-digit',
    month: 'short',
    year: 'numeric',
  }).format(parseDateOnly(date));
}

function formatPeriod(startDate: string, endDate: string) {
  const formatter = new Intl.DateTimeFormat('es-GT', {
    day: 'numeric',
    month: 'short',
    year: 'numeric',
  });
  return `${formatter.format(parseDateOnly(startDate))} – ${formatter.format(parseDateOnly(endDate))}`;
}

function formatWeek(startDate: string, endDate: string) {
  const start = parseDateOnly(startDate);
  const end = parseDateOnly(endDate);
  const sameMonth = start.getMonth() === end.getMonth();
  const startFormatter = new Intl.DateTimeFormat('es-GT', {
    day: 'numeric',
    ...(sameMonth ? {} : { month: 'short' as const }),
  });
  const endFormatter = new Intl.DateTimeFormat('es-GT', {
    day: 'numeric',
    month: 'short',
  });

  return `${startFormatter.format(start)}–${endFormatter.format(end)}`;
}

function ConsultationHistory({
  items,
  mode,
}: {
  items: ConsultationItem[];
  mode: ConsultationMode;
}) {
  return (
    <section className="consultation-history-card" aria-labelledby="consultation-history-title">
      <div className="consultation-section-heading">
        <div>
          <span className="card-eyebrow">Detalle del período</span>
          <h2 id="consultation-history-title">Almuerzos registrados</h2>
        </div>
        <span className="history-count">{items.length} registros</span>
      </div>
      <div className="table-scroll">
        <table className="meals-table consultation-table">
          <thead>
            <tr><th>Fecha</th><th>Almuerzo</th><th>Cantidad</th><th>Estado</th><th>Hora de entrega</th></tr>
          </thead>
          <tbody>
            {items.length === 0 ? (
              <tr>
                <td colSpan={5} className="history-empty">
                  No hay almuerzos registrados en {mode === 'recent' ? 'las últimas cuatro semanas' : 'este período'}.
                </td>
              </tr>
            ) : items.map((item) => (
              <tr key={item.id}>
                <td data-label="Fecha" className="consultation-date">{formatDay(item.date)}</td>
                <td data-label="Almuerzo"><strong>{item.mealName}</strong></td>
                <td data-label="Cantidad">{item.quantity}</td>
                <td data-label="Estado">
                  <span className={`meal-status ${item.status === 'DELIVERED' ? 'status-approved' : 'status-pending'}`}>
                    {item.status === 'DELIVERED' ? 'Entregado' : 'Pendiente'}
                  </span>
                </td>
                <td data-label="Hora de entrega">
                  {item.deliveredAt
                    ? new Intl.DateTimeFormat('es-GT', {
                      timeZone: 'America/Guatemala',
                      hour: '2-digit',
                      minute: '2-digit',
                    }).format(new Date(item.deliveredAt))
                    : '—'}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </section>
  );
}

export function ConsultationPage() {
  const today = getGuatemalaDate();
  const [mode, setMode] = useState<ConsultationMode>('recent');
  const [employeeCode, setEmployeeCode] = useState('');
  const [startDate, setStartDate] = useState(shiftDate(today, -30));
  const [endDate, setEndDate] = useState(today);
  const [result, setResult] = useState<ConsultationResult | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const selectMode = (nextMode: ConsultationMode) => {
    setMode(nextMode);
    setResult(null);
    setError(null);
  };

  const handleSubmit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (!employeeCode.trim()) return;

    if (mode === 'range' && (!startDate || !endDate || startDate > endDate)) {
      setError('Selecciona un período válido: la fecha final no puede ser anterior a la inicial.');
      return;
    }

    setIsLoading(true);
    setError(null);
    setResult(null);

    try {
      const response = mode === 'recent'
        ? await getEmployeeRecentWeeksConsultation(employeeCode)
        : await getEmployeeRangeConsultation(employeeCode, startDate, endDate);
      setResult(response);
    } catch (consultationError) {
      setError(consultationError instanceof Error
        ? consultationError.message
        : 'No fue posible consultar el historial');
    } finally {
      setIsLoading(false);
    }
  };

  const recentResult = result?.mode === 'RECENT_WEEKS' ? result : null;
  const maxWeeklyCount = Math.max(
    1,
    ...(recentResult?.weeks.map((week) => week.count) ?? []),
  );
  const periodLabel = result
    ? formatPeriod(result.period.startDate, result.period.endDate)
    : '';

  return (
    <div className="page consultation-page">
      <header className="page-header consultation-header">
        <div>
          <span className="section-kicker">Consulta para empleados</span>
          <h1>Tu historial de almuerzos</h1>
          <p>Revisa tus últimas cuatro semanas laborales o consulta un período específico.</p>
        </div>
        <span className="public-access-badge">Acceso sin sesión</span>
      </header>

      <section className="consultation-search-card consultation-search-wide" aria-labelledby="consultation-title">
        <div className="consultation-search-intro">
          <span className="card-eyebrow">Resumen personal</span>
          <h2 id="consultation-title">Consulta por código</h2>
          <p>Todos los platos reservados se incluyen en el total, incluso si quedaron pendientes de recoger.</p>
          <div className="consultation-mode-tabs" role="tablist" aria-label="Tipo de consulta">
            <button
              type="button"
              role="tab"
              aria-selected={mode === 'recent'}
              className={mode === 'recent' ? 'active' : ''}
              onClick={() => selectMode('recent')}
            >
              Últimas 4 semanas
            </button>
            <button
              type="button"
              role="tab"
              aria-selected={mode === 'range'}
              className={mode === 'range' ? 'active' : ''}
              onClick={() => selectMode('range')}
            >
              Período de fechas
            </button>
          </div>
        </div>

        <form
          className={`consultation-form functional-consultation-form ${mode === 'range' ? 'range-mode' : ''}`}
          onSubmit={(event) => void handleSubmit(event)}
        >
          <label className="form-field">
            <span>Código de empleado</span>
            <input
              value={employeeCode}
              maxLength={50}
              inputMode="numeric"
              autoComplete="off"
              placeholder="Ej. 18358"
              disabled={isLoading}
              onChange={(event) => { setEmployeeCode(event.target.value); setError(null); }}
            />
          </label>

          {mode === 'range' && (
            <>
              <label className="form-field">
                <span>Desde</span>
                <input
                  type="date"
                  value={startDate}
                  disabled={isLoading}
                  onChange={(event) => { setStartDate(event.target.value); setError(null); }}
                />
              </label>
              <label className="form-field">
                <span>Hasta</span>
                <input
                  type="date"
                  value={endDate}
                  min={startDate}
                  disabled={isLoading}
                  onChange={(event) => { setEndDate(event.target.value); setError(null); }}
                />
              </label>
            </>
          )}

          <button
            className="button button-primary consultation-submit"
            type="submit"
            disabled={isLoading || !employeeCode.trim() || (mode === 'range' && (!startDate || !endDate))}
          >
            {isLoading ? 'Consultando…' : mode === 'recent' ? 'Ver últimas 4 semanas' : 'Consultar período'}
          </button>
        </form>
        {error && <div className="form-error consultation-error" role="alert">{error}</div>}
      </section>

      {result && (
        <div className="consultation-results" aria-live="polite">
          {recentResult ? (
            <div className="consultation-overview-grid">
              <section className="consultation-chart-card" aria-labelledby="weekly-chart-title">
                <div className="consultation-section-heading">
                  <div>
                    <span className="card-eyebrow">Cuatro semanas · lunes a viernes</span>
                    <h2 id="weekly-chart-title">Almuerzos por semana laboral</h2>
                  </div>
                </div>
                <div className="weekly-bars" role="img" aria-label={`Gráfico de almuerzos del ${periodLabel}`}>
                  {recentResult.weeks.map((week) => {
                    const height = week.count === 0
                      ? 4
                      : Math.max(18, Math.round((week.count / maxWeeklyCount) * 100));
                    return (
                      <div className="weekly-bar-column" key={week.startDate}>
                        <strong>{week.count}</strong>
                        <div className="weekly-bar-track">
                          <i style={{ '--bar-height': `${height}%` } as CSSProperties} />
                        </div>
                        <span>{formatWeek(week.startDate, week.endDate)}</span>
                      </div>
                    );
                  })}
                </div>
              </section>

              <aside className="consultation-summary-card">
                <div className="consultation-person-summary">
                  <span className="card-eyebrow">{periodLabel}</span>
                  <h2>{result.employee.name}</h2>
                  <span className="consultation-employee-code">Código {result.employee.code}</span>
                </div>
                <div className="consultation-metrics">
                  <article className="metric-total"><span>Total de 4 semanas</span><strong>{result.summary.totalLunches}</strong><small>platos a cobrar</small></article>
                  <article><span>Entregados</span><strong>{result.summary.delivered}</strong><small>retirados</small></article>
                  <article><span>Pendientes</span><strong>{result.summary.pending}</strong><small>también se cobran</small></article>
                </div>
              </aside>
            </div>
          ) : (
            <section className="consultation-range-summary" aria-label="Resumen del período consultado">
              <div className="consultation-person-summary">
                <span className="card-eyebrow">Período consultado · {periodLabel}</span>
                <h2>{result.employee.name}</h2>
                <span className="consultation-employee-code">Código {result.employee.code}</span>
              </div>
              <div className="consultation-metrics">
                <article className="metric-total"><span>Total del período</span><strong>{result.summary.totalLunches}</strong><small>platos a cobrar</small></article>
                <article><span>Entregados</span><strong>{result.summary.delivered}</strong><small>retirados</small></article>
                <article><span>Pendientes</span><strong>{result.summary.pending}</strong><small>también se cobran</small></article>
              </div>
            </section>
          )}

          <ConsultationHistory
            items={result.items}
            mode={result.mode === 'RECENT_WEEKS' ? 'recent' : 'range'}
          />
        </div>
      )}
    </div>
  );
}
