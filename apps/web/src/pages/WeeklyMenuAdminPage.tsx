import { useEffect, useMemo, useState, type FormEvent } from 'react';
import {
  getCurrentWeeklyMenu,
  getWeeklyMenuForAdministration,
  saveCurrentWeeklyMenu,
  saveWeeklyCutoffs,
} from '../services/meals.service';
import type { WeeklyMenu } from '../types/weekly-meal';

function formatWeek(start: string, end: string) {
  const formatter = new Intl.DateTimeFormat('es-GT', { day: 'numeric', month: 'long' });
  return `${formatter.format(new Date(`${start}T12:00:00`))} al ${formatter.format(new Date(`${end}T12:00:00`))}`;
}

function formatDate(date: string) {
  return new Intl.DateTimeFormat('es-GT', { day: 'numeric', month: 'short' })
    .format(new Date(`${date}T12:00:00`));
}

function moveWeek(weekStart: string, amount: number) {
  const date = new Date(`${weekStart}T00:00:00.000Z`);
  date.setUTCDate(date.getUTCDate() + amount * 7);
  return date.toISOString().slice(0, 10);
}

export function WeeklyMenuAdminPage() {
  const [menu, setMenu] = useState<WeeklyMenu | null>(null);
  const [currentWeekStart, setCurrentWeekStart] = useState('');
  const [mealsByDate, setMealsByDate] = useState<Record<string, string[]>>({});
  const [isLoading, setIsLoading] = useState(true);
  const [isSaving, setIsSaving] = useState(false);
  const [isSavingCutoffs, setIsSavingCutoffs] = useState(false);
  const [mondayCutoffTime, setMondayCutoffTime] = useState('09:30');
  const [error, setError] = useState<string | null>(null);
  const [message, setMessage] = useState<string | null>(null);
  const [cutoffError, setCutoffError] = useState<string | null>(null);
  const [cutoffMessage, setCutoffMessage] = useState<string | null>(null);

  useEffect(() => {
    const controller = new AbortController();
    void getCurrentWeeklyMenu(controller.signal)
      .then((weeklyMenu) => {
        setMenu(weeklyMenu);
        setCurrentWeekStart(weeklyMenu.weekStart);
        setMondayCutoffTime(weeklyMenu.publicOrderingCutoffTime ?? '09:30');
        setMealsByDate(Object.fromEntries(
          weeklyMenu.days.map((day) => [
            day.date,
            day.meals.length > 0 ? day.meals.map((meal) => meal.name) : [''],
          ]),
        ));
      })
      .catch((loadError: unknown) => {
        if (loadError instanceof DOMException && loadError.name === 'AbortError') return;
        setError(loadError instanceof Error ? loadError.message : 'No fue posible cargar la semana');
      })
      .finally(() => {
        if (!controller.signal.aborted) setIsLoading(false);
      });
    return () => controller.abort();
  }, []);

  const applyMenu = (weeklyMenu: WeeklyMenu) => {
    setMenu(weeklyMenu);
    setMondayCutoffTime(weeklyMenu.publicOrderingCutoffTime ?? '09:30');
    setMealsByDate(Object.fromEntries(
      weeklyMenu.days.map((day) => [
        day.date,
        day.meals.length > 0 ? day.meals.map((meal) => meal.name) : [''],
      ]),
    ));
  };

  const loadWeek = async (weekStart: string) => {
    setIsLoading(true);
    setError(null);
    setMessage(null);
    setCutoffError(null);
    setCutoffMessage(null);
    try {
      applyMenu(await getWeeklyMenuForAdministration(weekStart));
    } catch (loadError) {
      setError(loadError instanceof Error ? loadError.message : 'No fue posible cargar la semana');
    } finally {
      setIsLoading(false);
    }
  };

  const handleSaveCutoffs = async () => {
    if (!menu) return;
    setIsSavingCutoffs(true);
    setCutoffError(null);
    setCutoffMessage(null);
    try {
      const saved = await saveWeeklyCutoffs(
        menu.weekStart,
        { cutoffTime: mondayCutoffTime },
      );
      applyMenu(saved);
      setCutoffMessage(`El cierre público del lunes quedó configurado a las ${saved.publicOrderingCutoffTime}.`);
    } catch (saveError) {
      setCutoffError(saveError instanceof Error ? saveError.message : 'No fue posible guardar el horario');
    } finally {
      setIsSavingCutoffs(false);
    }
  };

  const isComplete = useMemo(
    () => menu?.days.every((day) =>
      (mealsByDate[day.date] ?? []).length > 0 &&
      (mealsByDate[day.date] ?? []).every((name) => name.trim().length > 0),
    ) ?? false,
    [menu, mealsByDate],
  );

  const publicationLabel = menu?.publicationStatus === 'PUBLISHED'
    ? 'Publicado'
    : menu?.publicationStatus === 'SCHEDULED'
      ? 'Programado para el lunes'
      : 'Pendiente de completar';

  const updateMeal = (date: string, index: number, value: string) => {
    setMealsByDate((current) => ({
      ...current,
      [date]: current[date].map((name, mealIndex) => mealIndex === index ? value : name),
    }));
    setMessage(null);
    setError(null);
  };

  const addMeal = (date: string) => {
    setMealsByDate((current) => ({ ...current, [date]: [...current[date], ''] }));
    setMessage(null);
  };

  const removeMeal = (date: string, index: number) => {
    setMealsByDate((current) => {
      const remaining = current[date].filter((_, mealIndex) => mealIndex !== index);
      return { ...current, [date]: remaining.length > 0 ? remaining : [''] };
    });
    setMessage(null);
  };

  const handleSubmit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (!menu || !isComplete) return;
    setIsSaving(true);
    setError(null);
    setMessage(null);
    try {
      const saved = await saveCurrentWeeklyMenu(menu.weekStart, menu.days.map((day) => ({
        date: day.date,
        meals: mealsByDate[day.date].map((name) => name.trim()),
      })));
      applyMenu(saved);
      setMessage(saved.publicationStatus === 'SCHEDULED'
        ? `El menú quedó listo y se activará automáticamente el lunes ${formatDate(saved.activationDate)}.`
        : 'El menú quedó publicado. Los empleados ya pueden seleccionar sus comidas.');
    } catch (saveError) {
      setError(saveError instanceof Error ? saveError.message : 'No fue posible guardar el menú semanal');
    } finally {
      setIsSaving(false);
    }
  };

  return (
    <div className="page weekly-admin-page">
      <header className="page-header weekly-page-header">
        <div>
          <span className="section-kicker">Administración semanal</span>
          <h1>Menú de la semana</h1>
          <p>Agrega las opciones de almuerzo disponibles de lunes a viernes.</p>
        </div>
        <span className={`weekly-status ${menu?.publicationStatus === 'PUBLISHED' ? 'is-published' : menu?.publicationStatus === 'SCHEDULED' ? 'is-scheduled' : ''}`}>
          <i aria-hidden="true" />{publicationLabel}
        </span>
      </header>

      {menu && (
        <div className="week-banner">
          <div>
            <span>Semana seleccionada</span>
            <strong>{formatWeek(menu.weekStart, menu.weekEnd)}</strong>
            <p>{menu.publicationStatus === 'SCHEDULED' ? `Lista para activarse el lunes ${formatDate(menu.activationDate)}` : 'Semana laboral de lunes a viernes'}</p>
          </div>
          <div className="week-navigation" aria-label="Cambiar semana">
            <button type="button" disabled={isLoading || isSaving || isSavingCutoffs || menu.weekStart === currentWeekStart} onClick={() => void loadWeek(moveWeek(menu.weekStart, -1))} aria-label="Semana anterior">‹</button>
            {menu.weekStart !== currentWeekStart && <button className="current-week-button" type="button" disabled={isLoading || isSaving || isSavingCutoffs} onClick={() => void loadWeek(currentWeekStart)}>Semana actual</button>}
            <button type="button" disabled={isLoading || isSaving || isSavingCutoffs} onClick={() => void loadWeek(moveWeek(menu.weekStart, 1))} aria-label="Semana siguiente">›</button>
          </div>
        </div>
      )}

      {isLoading && <div className="weekly-loading"><span className="button-spinner" /> Cargando menú…</div>}

      {!isLoading && menu && (
        <section className="cutoff-settings-card" aria-labelledby="cutoff-settings-title">
          <div className="cutoff-settings-heading">
            <div>
              <span className="card-eyebrow">Cierre de solicitudes</span>
              <h2 id="cutoff-settings-title">Cierre de reservaciones del lunes</h2>
              <p>Al publicar el menú se habilitan las reservaciones. El lunes, al llegar esta hora, el pedido semanal queda cerrado para todos los empleados.</p>
            </div>
            <span className="cutoff-clock" aria-hidden="true">◷</span>
          </div>

          <div className="monday-cutoff-control">
            <div>
              <span>Lunes de la semana seleccionada</span>
              <strong>{formatDate(menu.weekStart)}</strong>
              <small>Hora predeterminada: 09:30 · Zona horaria de Guatemala</small>
            </div>
            <label>
              <span>Hora de cierre</span>
              <input type="time" value={mondayCutoffTime} disabled={isSaving || isSavingCutoffs} onChange={(event) => { setMondayCutoffTime(event.target.value); setCutoffMessage(null); }} />
            </label>
          </div>

          {cutoffError && <div className="form-error cutoff-feedback" role="alert">{cutoffError}</div>}
          {cutoffMessage && <div className="users-success cutoff-feedback" role="status">{cutoffMessage}</div>}
          <div className="cutoff-settings-footer">
            <span>Después del cierre, únicamente RH podrá realizar excepciones desde Modificar almuerzo.</span>
            <button className="button button-primary" type="button" disabled={isSaving || isSavingCutoffs || !mondayCutoffTime} onClick={() => void handleSaveCutoffs()}>
              {isSavingCutoffs ? <><span className="button-spinner" /> Guardando…</> : 'Guardar cierre del lunes'}
            </button>
          </div>
        </section>
      )}

      {!isLoading && menu && (
        <form onSubmit={(event) => void handleSubmit(event)}>
          <div className="weekly-admin-grid">
            {menu.days.map((day, dayIndex) => (
              <section className="weekly-day-editor" key={day.date}>
                <header>
                  <span className="day-number">{dayIndex + 1}</span>
                  <div><h2>{day.dayName}</h2><small>{formatDate(day.date)}</small></div>
                  <span className="meal-count">{mealsByDate[day.date]?.filter((name) => name.trim()).length ?? 0} opciones</span>
                </header>
                <div className="weekly-meal-inputs">
                  {(mealsByDate[day.date] ?? ['']).map((meal, index) => (
                    <div className="weekly-meal-input" key={`${day.date}-${index}`}>
                      <span aria-hidden="true">{index + 1}</span>
                      <input
                        aria-label={`Comida ${index + 1} del ${day.dayName}`}
                        value={meal}
                        maxLength={150}
                        placeholder={index === 0 ? 'Ej. Pollo en salsa de hongos' : 'Otra opción de comida'}
                        disabled={isSaving || isSavingCutoffs}
                        onChange={(event) => updateMeal(day.date, index, event.target.value)}
                      />
                      <button type="button" aria-label={`Quitar comida ${index + 1}`} disabled={isSaving || isSavingCutoffs} onClick={() => removeMeal(day.date, index)}>×</button>
                    </div>
                  ))}
                </div>
                <button className="add-meal-button" type="button" disabled={isSaving || isSavingCutoffs || mealsByDate[day.date].length >= 10} onClick={() => addMeal(day.date)}>
                  <span aria-hidden="true">+</span> Agregar otra opción
                </button>
              </section>
            ))}
          </div>

          <div className="weekly-save-bar">
            <div>
              <strong>{isComplete ? (menu.publicationStatus === 'SCHEDULED' ? 'Todo listo para el lunes' : 'Todo listo para publicar') : 'Completa los cinco días'}</strong>
              <span>Solo se activa cuando los cinco días, de lunes a viernes, tienen al menos una comida.</span>
            </div>
            <button className="button button-primary weekly-save-button" type="submit" disabled={!isComplete || isSaving || isSavingCutoffs}>
              {isSaving ? <><span className="button-spinner" /> Publicando…</> : 'Guardar y publicar menú'}
            </button>
          </div>
        </form>
      )}

      {error && <div className="form-error weekly-feedback" role="alert">{error}</div>}
      {message && <div className="users-success weekly-feedback" role="status">{message}</div>}
    </div>
  );
}
