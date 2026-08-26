import { useEffect, useState, type CSSProperties } from 'react';
import { getPendingToday, getTodayMealSummary } from '../services/meals.service';
import type { PendingMealItem, TodayMealSummary } from '../types/meal-history';

const emptySummary: TodayMealSummary = { reserved: 0, collected: 0, pending: 0, duplicateAttempts: 0 };

export function DailyResultsPage() {
  const [pendingMeals, setPendingMeals] = useState<PendingMealItem[]>([]);
  const [summary, setSummary] = useState<TodayMealSummary>(emptySummary);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [refreshKey, setRefreshKey] = useState(0);

  useEffect(() => {
    const controller = new AbortController();
    setIsLoading(true);
    setError(null);
    void Promise.all([
      getPendingToday('', controller.signal),
      getTodayMealSummary(controller.signal),
    ])
      .then(([pending, todaySummary]) => {
        setPendingMeals(pending);
        setSummary(todaySummary);
      })
      .catch((loadError: unknown) => {
        if (loadError instanceof DOMException && loadError.name === 'AbortError') return;
        setError(loadError instanceof Error ? loadError.message : 'No fue posible consultar la operación de hoy');
      })
      .finally(() => {
        if (!controller.signal.aborted) setIsLoading(false);
      });
    return () => controller.abort();
  }, [refreshKey]);

  const collectedPercentage = summary.reserved > 0 ? Math.round((summary.collected / summary.reserved) * 100) : 0;
  const todayLabel = new Intl.DateTimeFormat('es-GT', { weekday: 'long', day: 'numeric', month: 'long' }).format(new Date());

  return (
    <div className="page home-dashboard daily-results-dashboard">
      <header className="page-header dashboard-header">
        <div><span className="section-kicker">Operación diaria</span><h1>Entregas y pendientes de hoy</h1><p>Seguimiento de las comidas reclamadas y de las personas que todavía tienen una entrega pendiente.</p></div>
        <button className="button button-secondary" type="button" onClick={() => setRefreshKey((current) => current + 1)}>Actualizar datos</button>
      </header>

      <div className="daily-results-date"><span>Fecha consultada</span><strong>{todayLabel}</strong></div>
      {error && <div className="history-error dashboard-error" role="alert">{error}</div>}

      <div className="dashboard-grid">
        <section className="dashboard-card pending-preview" aria-labelledby="pending-title">
          <div className="card-heading"><div><span className="card-eyebrow">Pendientes de entrega</span><h2 id="pending-title">Aún no han reclamado</h2></div><span className="count-pill">{isLoading ? '—' : summary.pending}</span></div>
          <div className="table-scroll dashboard-table-scroll"><table className="meals-table dashboard-table"><thead><tr><th>Código</th><th>Empleado</th><th>Comida solicitada</th></tr></thead><tbody>
            {isLoading ? <tr><td colSpan={3} className="history-empty">Consultando pendientes…</td></tr> : pendingMeals.length === 0 ? <tr><td colSpan={3} className="history-empty success-empty">Todas las comidas solicitadas ya fueron entregadas.</td></tr> : pendingMeals.map((item) => (
              <tr key={item.employeeCode}><td data-label="Código" className="history-code">{item.employeeCode}</td><td data-label="Empleado"><span className="person-cell"><span className="mini-avatar" aria-hidden="true">{item.name.slice(0, 1).toUpperCase()}</span><strong>{item.name}</strong></span></td><td data-label="Comida">{item.meal}</td></tr>
            ))}
          </tbody></table></div>
        </section>

        <section className="dashboard-card comparison-card" aria-labelledby="comparison-title">
          <div className="card-heading"><div><span className="card-eyebrow">Estado del comedor</span><h2 id="comparison-title">Entregadas vs. pendientes</h2></div><span className="live-indicator"><i /> En vivo</span></div>
          <div className="chart-area"><div className="donut-chart" style={{ '--chart-progress': `${collectedPercentage}%` } as CSSProperties} role="img" aria-label={`${summary.collected} comidas entregadas y ${summary.pending} pendientes`}><div className="donut-center"><strong>{isLoading ? '—' : `${collectedPercentage}%`}</strong><span>entregado</span></div></div><div className="chart-legend"><div className="legend-item delivered-legend"><span className="legend-swatch" /><div><span>Ya reclamaron</span><strong>{isLoading ? '—' : summary.collected}</strong></div></div><div className="legend-item pending-legend"><span className="legend-swatch" /><div><span>Aún pendientes</span><strong>{isLoading ? '—' : summary.pending}</strong></div></div></div></div>
          <div className="chart-total"><span>Total solicitado hoy</span><strong>{isLoading ? '—' : summary.reserved}</strong></div>
        </section>
      </div>
    </div>
  );
}
