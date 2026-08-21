import { useEffect, useState } from 'react';
import { getPendingToday } from '../services/meals.service';
import type { PendingMealItem } from '../types/meal-history';

export function PendingMealsPage() {
  const [items, setItems] = useState<PendingMealItem[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [refreshKey, setRefreshKey] = useState(0);

  useEffect(() => {
    const controller = new AbortController();
    setIsLoading(true);
    setError(null);

    void getPendingToday(controller.signal)
      .then(setItems)
      .catch((loadError: unknown) => {
        if (loadError instanceof DOMException && loadError.name === 'AbortError') return;
        setError(loadError instanceof Error ? loadError.message : 'No fue posible consultar los pendientes');
      })
      .finally(() => {
        if (!controller.signal.aborted) setIsLoading(false);
      });

    return () => controller.abort();
  }, [refreshKey]);

  return (
    <div className="page meals-history-page">
      <header className="page-header meals-history-header">
        <div>
          <span className="section-kicker">Solo el día actual</span>
          <h1>Pendientes</h1>
          <p>Personas que solicitaron comida y todavía no la han reclamado.</p>
        </div>
        <button className="button button-secondary history-refresh" type="button" onClick={() => setRefreshKey((current) => current + 1)}>
          Actualizar
        </button>
      </header>

      <section className="history-card" aria-labelledby="pending-list-title">
        <div className="history-toolbar">
          <div>
            <h2 id="pending-list-title">Por entregar hoy</h2>
            <span>{isLoading ? 'Consultando…' : `${items.length} personas pendientes`}</span>
          </div>
          <span className="pending-filter"><i /> Pendientes de hoy</span>
        </div>

        {error && <div className="history-error" role="alert">{error}</div>}

        <div className="table-scroll">
          <table className="meals-table pending-meals-table">
            <thead>
              <tr><th>Código</th><th>Empleado</th><th>Comida solicitada</th><th>Estado</th></tr>
            </thead>
            <tbody>
              {isLoading ? (
                <tr><td colSpan={4} className="history-empty">Cargando pendientes…</td></tr>
              ) : items.length === 0 ? (
                <tr><td colSpan={4} className="history-empty success-empty">No quedan entregas pendientes para hoy.</td></tr>
              ) : (
                items.map((item) => (
                  <tr key={item.employeeCode}>
                    <td data-label="Código" className="history-code">{item.employeeCode}</td>
                    <td data-label="Empleado">
                      <span className="person-cell">
                        <span className="mini-avatar" aria-hidden="true">{item.name.slice(0, 1).toUpperCase()}</span>
                        <strong>{item.name}</strong>
                      </span>
                    </td>
                    <td data-label="Comida">{item.meal}</td>
                    <td data-label="Estado"><span className="meal-status status-pending">Por entregar</span></td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </section>
    </div>
  );
}
