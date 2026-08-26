import { useEffect, useMemo, useState, type CSSProperties } from 'react';
import { getCurrentWeeklyMenu, getWeeklyOrderSummary } from '../services/meals.service';
import type { WeeklyOrderSummary } from '../types/weekly-meal';

function formatWeek(start: string, end: string) {
  const formatter = new Intl.DateTimeFormat('es-GT', { day: 'numeric', month: 'long' });
  return `${formatter.format(new Date(`${start}T12:00:00`))} al ${formatter.format(new Date(`${end}T12:00:00`))}`;
}

function formatDate(date: string) {
  return new Intl.DateTimeFormat('es-GT', { day: 'numeric', month: 'short' }).format(new Date(`${date}T12:00:00`));
}

function moveWeek(weekStart: string, amount: number) {
  const date = new Date(`${weekStart}T00:00:00.000Z`);
  date.setUTCDate(date.getUTCDate() + amount * 7);
  return date.toISOString().slice(0, 10);
}

function getTodayDate() {
  const parts = new Intl.DateTimeFormat('en-US', { timeZone: 'America/Guatemala', year: 'numeric', month: '2-digit', day: '2-digit' }).formatToParts(new Date());
  const values = Object.fromEntries(parts.map((part) => [part.type, part.value]));
  return `${values.year}-${values.month}-${values.day}`;
}

export function HomePage() {
  const [weeklySummary, setWeeklySummary] = useState<WeeklyOrderSummary | null>(null);
  const [currentWeekStart, setCurrentWeekStart] = useState('');
  const [isLoadingWeek, setIsLoadingWeek] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [refreshKey, setRefreshKey] = useState(0);

  useEffect(() => {
    const controller = new AbortController();
    setIsLoadingWeek(true);
    setError(null);
    void getCurrentWeeklyMenu(controller.signal)
      .then(async (menu) => {
        setCurrentWeekStart(menu.weekStart);
        setWeeklySummary(await getWeeklyOrderSummary(menu.weekStart, controller.signal));
      })
      .catch((loadError: unknown) => {
        if (loadError instanceof DOMException && loadError.name === 'AbortError') return;
        setError(loadError instanceof Error ? loadError.message : 'No fue posible consultar los resultados semanales');
      })
      .finally(() => {
        if (!controller.signal.aborted) setIsLoadingWeek(false);
      });
    return () => controller.abort();
  }, [refreshKey]);

  const loadWeek = async (weekStart: string) => {
    setIsLoadingWeek(true);
    setError(null);
    try { setWeeklySummary(await getWeeklyOrderSummary(weekStart)); }
    catch (loadError) { setError(loadError instanceof Error ? loadError.message : 'No fue posible consultar esa semana'); }
    finally { setIsLoadingWeek(false); }
  };

  const todayLabel = new Intl.DateTimeFormat('es-GT', { weekday: 'long', day: 'numeric', month: 'long' }).format(new Date());
  const todayOrders = weeklySummary?.days.find((day) => day.date === getTodayDate())?.total ?? 0;
  const differentMeals = useMemo(() => weeklySummary?.days.reduce((total, day) => total + day.meals.filter((meal) => meal.total > 0).length, 0) ?? 0, [weeklySummary]);

  return (
    <div className="page home-dashboard weekly-results-dashboard">
      <header className="page-header dashboard-header">
        <div><span className="section-kicker">Resultados semanales</span><h1>Pedidos por comida</h1><p>Totales y desglose por cada día de la semana para preparar el reporte del Chef.</p></div>
        <button className="button button-secondary" type="button" onClick={() => setRefreshKey((current) => current + 1)}>Actualizar datos</button>
      </header>

      {error && <div className="history-error dashboard-error" role="alert">{error}</div>}

      {weeklySummary && (
        <div className="week-banner results-week-navigation-banner">
          <div>
            <span>Semana consultada</span>
            <strong>{formatWeek(weeklySummary.weekStart, weeklySummary.weekEnd)}</strong>
            <p>Lunes {formatDate(weeklySummary.weekStart)} — Viernes {formatDate(weeklySummary.weekEnd)}</p>
          </div>
          <div className="week-navigation" aria-label="Cambiar semana de resultados">
            <button type="button" aria-label="Semana anterior" disabled={isLoadingWeek} onClick={() => void loadWeek(moveWeek(weeklySummary.weekStart, -1))}>‹</button>
            {weeklySummary.weekStart !== currentWeekStart && <button className="current-week-button" type="button" disabled={isLoadingWeek} onClick={() => void loadWeek(currentWeekStart)}>Semana actual</button>}
            <button type="button" aria-label="Semana siguiente" disabled={isLoadingWeek} onClick={() => void loadWeek(moveWeek(weeklySummary.weekStart, 1))}>›</button>
          </div>
        </div>
      )}

      <div className="weekly-result-metrics">
        <article><span>Total de la semana</span><strong>{isLoadingWeek ? '—' : weeklySummary?.totalReservations ?? 0}</strong><small>comidas reservadas</small></article>
        <article><span>Solicitudes de hoy</span><strong>{isLoadingWeek ? '—' : todayOrders}</strong><small>{todayLabel}</small></article>
        <article><span>Opciones con pedidos</span><strong>{isLoadingWeek ? '—' : differentMeals}</strong><small>platos diferentes por día</small></article>
      </div>

      <section className="weekly-results-card" aria-labelledby="weekly-results-title">
        <div className="weekly-results-heading"><div><span className="card-eyebrow">Desglose para el Chef</span><h2 id="weekly-results-title">Cantidad solicitada por comida</h2></div><span className="live-indicator"><i /> Datos actuales</span></div>
        {isLoadingWeek ? <div className="weekly-loading"><span className="button-spinner" /> Calculando totales…</div> : (
          <div className="chef-results-grid">
            {weeklySummary?.days.map((day) => {
              const maxTotal = Math.max(1, ...day.meals.map((meal) => meal.total));
              return (
                <article className="chef-day-result" key={day.date}>
                  <header><div><span>{day.dayName}</span><small>{formatDate(day.date)} · Cierre {day.cutoffTime}</small></div><strong>{day.total}<small> pedidos</small></strong></header>
                  <div className="chef-meal-bars">
                    {day.meals.length === 0 ? <p className="chef-empty-day">No hay menú configurado.</p> : day.meals.map((meal) => (
                      <div className="chef-meal-bar" key={meal.mealId}>
                        <div><span>{meal.name}</span><strong>{meal.total}</strong></div>
                        <div className="chef-bar-track"><i style={{ '--chef-bar-width': `${Math.round((meal.total / maxTotal) * 100)}%` } as CSSProperties} /></div>
                      </div>
                    ))}
                  </div>
                  <footer className={day.isClosed ? 'is-closed' : ''}><i />{day.isClosed ? 'Conteo cerrado' : 'Recibiendo solicitudes'}</footer>
                </article>
              );
            })}
          </div>
        )}
      </section>
    </div>
  );
}
