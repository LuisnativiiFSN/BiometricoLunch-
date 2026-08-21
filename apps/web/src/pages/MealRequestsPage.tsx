import { useEffect, useState } from 'react';
import { getDeliveredMeals } from '../services/meals.service';
import type { MealHistoryItem } from '../types/meal-history';

export function MealRequestsPage() {
  const [items, setItems] = useState<MealHistoryItem[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [refreshKey, setRefreshKey] = useState(0);

  useEffect(() => {
    const controller = new AbortController();
    setIsLoading(true);
    setError(null);

    void getDeliveredMeals(controller.signal)
      .then(setItems)
      .catch((loadError: unknown) => {
        if (loadError instanceof DOMException && loadError.name === 'AbortError') return;
        setError(loadError instanceof Error ? loadError.message : 'No fue posible consultar las entregas');
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
          <span className="section-kicker">Registro completo</span>
          <h1>Entregas</h1>
          <p>Todas las personas que ya recibieron su comida.</p>
        </div>
        <button className="button button-secondary history-refresh" type="button" onClick={() => setRefreshKey((current) => current + 1)}>
          Actualizar
        </button>
      </header>

      <section className="history-card" aria-labelledby="deliveries-title">
        <div className="history-toolbar">
          <div>
            <h2 id="deliveries-title">Comidas entregadas</h2>
            <span>{isLoading ? 'Consultando…' : `${items.length} entregas registradas`}</span>
          </div>
          <span className="approved-filter"><i /> Solo entregadas</span>
        </div>

        {error && <div className="history-error" role="alert">{error}</div>}

        <div className="table-scroll">
          <table className="meals-table">
            <thead>
              <tr>
                <th>Fecha</th><th>Hora</th><th>Código</th><th>Empleado</th><th>Comida entregada</th><th>Estado</th>
              </tr>
            </thead>
            <tbody>
              {isLoading ? (
                <tr><td colSpan={6} className="history-empty">Cargando entregas…</td></tr>
              ) : items.length === 0 ? (
                <tr><td colSpan={6} className="history-empty">Todavía no hay entregas registradas.</td></tr>
              ) : (
                items.map((item) => (
                  <tr key={item.id}>
                    <td data-label="Fecha">{item.date}</td>
                    <td data-label="Hora" className="history-time">{item.time}</td>
                    <td data-label="Código" className="history-code">{item.employeeCode}</td>
                    <td data-label="Empleado">{item.employeeName}</td>
                    <td data-label="Comida">{item.mealName ?? <span className="missing-meal">Sin vínculo histórico</span>}</td>
                    <td data-label="Estado"><span className="meal-status status-approved">Entregado</span></td>
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
