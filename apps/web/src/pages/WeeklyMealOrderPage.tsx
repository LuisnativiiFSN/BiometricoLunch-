import { useEffect, useMemo, useState, type FormEvent } from 'react';
import {
  getCurrentWeeklyMenu,
  getEmployeeWeeklySelections,
  saveEmployeeWeeklySelections,
} from '../services/meals.service';
import type { WeeklyMenu } from '../types/weekly-meal';

function formatDate(date: string) {
  return new Intl.DateTimeFormat('es-GT', { day: 'numeric', month: 'short' })
    .format(new Date(`${date}T12:00:00`));
}

function formatWeek(start: string, end: string) {
  const formatter = new Intl.DateTimeFormat('es-GT', { day: 'numeric', month: 'long' });
  return `${formatter.format(new Date(`${start}T12:00:00`))} — ${formatter.format(new Date(`${end}T12:00:00`))}`;
}

export function WeeklyMealOrderPage() {
  const [menu, setMenu] = useState<WeeklyMenu | null>(null);
  const [employeeCode, setEmployeeCode] = useState('');
  const [employee, setEmployee] = useState<{ code: string; name: string; department: string } | null>(null);
  const [selections, setSelections] = useState<Record<string, string>>({});
  const [isLoadingMenu, setIsLoadingMenu] = useState(true);
  const [isFinding, setIsFinding] = useState(false);
  const [isSaving, setIsSaving] = useState(false);
  const [showConfirmation, setShowConfirmation] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [message, setMessage] = useState<string | null>(null);

  useEffect(() => {
    const controller = new AbortController();
    void getCurrentWeeklyMenu(controller.signal)
      .then(setMenu)
      .catch((loadError: unknown) => {
        if (loadError instanceof DOMException && loadError.name === 'AbortError') return;
        setError(loadError instanceof Error ? loadError.message : 'No fue posible consultar el menú');
      })
      .finally(() => {
        if (!controller.signal.aborted) setIsLoadingMenu(false);
      });
    return () => controller.abort();
  }, []);

  const selectedCount = useMemo(
    () => Object.values(selections).filter(Boolean).length,
    [selections],
  );
  const selectedMeals = useMemo(() => menu?.days.flatMap((day) => {
    const meal = day.meals.find((option) => option.id === selections[day.date]);
    return meal ? [{ date: day.date, dayName: day.dayName, mealName: meal.name }] : [];
  }) ?? [], [menu, selections]);

  const handleFindEmployee = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (!employeeCode.trim()) return;
    setIsFinding(true);
    setError(null);
    setMessage(null);
    try {
      const result = await getEmployeeWeeklySelections(employeeCode);
      setEmployee(result.employee);
      setEmployeeCode(result.employee.code);
      setSelections(Object.fromEntries(result.selections.map((selection) => [selection.date, selection.mealId])));
    } catch (findError) {
      setEmployee(null);
      setSelections({});
      setError(findError instanceof Error ? findError.message : 'No fue posible validar el código');
    } finally {
      setIsFinding(false);
    }
  };

  const handleSave = async () => {
    if (!employee) return;
    setShowConfirmation(false);
    setIsSaving(true);
    setError(null);
    setMessage(null);
    try {
      const result = await saveEmployeeWeeklySelections(
        employee.code,
        Object.entries(selections)
          .filter(([, mealId]) => Boolean(mealId))
          .map(([date, mealId]) => ({ date, mealId })),
      );
      setSelections(Object.fromEntries(result.selections.map((selection) => [selection.date, selection.mealId])));
      const totalChanges = result.changes.created + result.changes.updated + result.changes.deleted;
      setMessage(totalChanges > 0
        ? `Tus ${result.selections.length} comidas quedaron guardadas correctamente.`
        : 'Tus selecciones ya estaban guardadas y no necesitaron cambios.');
    } catch (saveError) {
      setError(saveError instanceof Error ? saveError.message : 'No fue posible guardar tus comidas');
    } finally {
      setIsSaving(false);
    }
  };

  const resetEmployee = () => {
    setEmployee(null);
    setSelections({});
    setEmployeeCode('');
    setMessage(null);
    setError(null);
  };

  return (
    <div className="page weekly-order-page">
      <header className="page-header weekly-page-header">
        <div>
          <span className="section-kicker">Reservación de almuerzos</span>
          <h1>Encarga tu comida</h1>
          <p>Identifícate con tu código y selecciona una opción para cada día que desees comer.</p>
        </div>
        <span className="public-access-badge">Sin iniciar sesión</span>
      </header>

      {menu && (
        <div className="week-banner public-week-banner">
          <div><span>{menu.isPublished ? 'Menú disponible' : 'Menú en preparación'}</span><strong>{formatWeek(menu.weekStart, menu.weekEnd)}</strong></div>
          <p>{menu.isPublished ? (menu.cutoffMode === 'GENERAL' ? `Una comida por día · Cierre diario ${menu.orderingCutoffTime}` : 'Una comida por día · Consulta el cierre de cada fecha') : 'Se habilitará cuando estén completos los cinco días'}</p>
        </div>
      )}

      <section className="employee-code-card">
        {!employee ? (
          <>
            <div><span className="card-eyebrow">Paso 1</span><h2>Ingresa tu código de empleado</h2><p>Validaremos que estés activo y cargaremos tus selecciones anteriores.</p></div>
            <form onSubmit={(event) => void handleFindEmployee(event)}>
              <label className="form-field">
                <span>Código de empleado</span>
                <input
                  value={employeeCode}
                  maxLength={50}
                  inputMode="numeric"
                  autoComplete="off"
                  placeholder="Ej. 18908"
                  disabled={isFinding || isLoadingMenu || !menu?.isPublished}
                  onChange={(event) => { setEmployeeCode(event.target.value); setError(null); }}
                />
              </label>
              <button className="button button-primary" type="submit" disabled={!employeeCode.trim() || isFinding || isLoadingMenu || !menu?.isPublished}>
                {isFinding ? <><span className="button-spinner" /> Buscando…</> : 'Continuar'}
              </button>
            </form>
          </>
        ) : (
          <div className="identified-employee">
            <span className="employee-check" aria-hidden="true">✓</span>
            <div><span className="card-eyebrow">Empleado identificado</span><h2>{employee.name}</h2><p>Código {employee.code} · {employee.department}</p></div>
            <button className="button button-secondary" type="button" disabled={isSaving} onClick={resetEmployee}>Cambiar código</button>
          </div>
        )}
      </section>

      {isLoadingMenu && <div className="weekly-loading"><span className="button-spinner" /> Cargando menú de la semana…</div>}

      {!isLoadingMenu && menu && !menu.isPublished && (
        <div className="menu-not-ready" role="status"><span aria-hidden="true">!</span><div><strong>La semana todavía no está lista para publicarse</strong><p>Se habilitará cuando Recursos Humanos complete las comidas de lunes a viernes.</p></div></div>
      )}

      {!isLoadingMenu && menu && (
        <div className={`weekly-order-grid ${employee ? 'is-enabled' : ''}`} aria-label="Opciones del menú semanal">
          {menu.days.map((day, index) => {
            const selectedMealId = selections[day.date] ?? '';
            return (
              <section className={`order-day-card ${selectedMealId ? 'has-selection' : ''}`} key={day.date}>
                <header><span>{index + 1}</span><div><h2>{day.dayName}</h2><small>{formatDate(day.date)} · Cierre {day.cutoffTime}</small></div>{selectedMealId && <i aria-label="Comida seleccionada">✓</i>}</header>
                {!day.canModify && <div className="day-lock-note"><span aria-hidden="true">⌁</span>{day.lockReason}</div>}
                <div className="order-options">
                  {day.meals.length === 0 && <p className="day-without-menu">Menú pendiente</p>}
                  {day.meals.map((meal) => (
                    <label className={`meal-choice ${selectedMealId === meal.id ? 'is-selected' : ''}`} key={meal.id}>
                      <input
                        type="radio"
                        name={`meal-${day.date}`}
                        value={meal.id}
                        checked={selectedMealId === meal.id}
                        disabled={!employee || isSaving || !menu.isPublished || !day.canModify}
                        onChange={() => { setSelections((current) => ({ ...current, [day.date]: meal.id })); setMessage(null); }}
                      />
                      <span aria-hidden="true" /><strong>{meal.name}</strong>
                    </label>
                  ))}
                </div>
                {selectedMealId && (
                  <button className="skip-day-button" type="button" disabled={!employee || isSaving || !menu.isPublished || !day.canModify} onClick={() => setSelections((current) => ({ ...current, [day.date]: '' }))}>
                    No pedir comida este día
                  </button>
                )}
              </section>
            );
          })}
        </div>
      )}

      {error && <div className="form-error weekly-feedback" role="alert">{error}</div>}
      {message && <div className="users-success weekly-feedback" role="status">{message}</div>}

      {employee && menu?.isPublished && (
        <div className="weekly-order-save">
          <div><strong>{selectedCount} de 5 días seleccionados</strong><span>Puedes dejar días sin comida o cambiar una selección antes de guardar.</span></div>
          <button className="button button-primary" type="button" disabled={isSaving} onClick={() => setShowConfirmation(true)}>
            {isSaving ? <><span className="button-spinner" /> Guardando…</> : 'Guardar mis comidas'}
          </button>
        </div>
      )}

      {showConfirmation && employee && (
        <div className="meal-confirmation-backdrop" role="presentation" onMouseDown={(event) => { if (event.target === event.currentTarget) setShowConfirmation(false); }}>
          <section className="meal-confirmation-modal" role="dialog" aria-modal="true" aria-labelledby="meal-confirmation-title">
            <header>
              <span className="confirmation-icon" aria-hidden="true">✓</span>
              <div><span className="card-eyebrow">Confirmación final</span><h2 id="meal-confirmation-title">Revisa tus comidas</h2></div>
              <button type="button" aria-label="Cerrar confirmación" disabled={isSaving} onClick={() => setShowConfirmation(false)}>×</button>
            </header>
            <div className="confirmation-employee">
              <span>La reservación se guardará para</span>
              <strong>{employee.name}</strong>
              <small>Código {employee.code} · {employee.department}</small>
            </div>
            <div className="confirmation-meals">
              {selectedMeals.length > 0 ? selectedMeals.map((item) => (
                <article key={item.date}><div><strong>{item.dayName}</strong><small>{formatDate(item.date)}</small></div><p>{item.mealName}</p></article>
              )) : <div className="confirmation-empty"><strong>No seleccionaste comidas</strong><p>Al confirmar se cancelarán las reservaciones modificables de esta semana.</p></div>}
            </div>
            <footer>
              <button className="button button-secondary" type="button" disabled={isSaving} onClick={() => setShowConfirmation(false)}>Volver y revisar</button>
              <button className="button button-primary" type="button" disabled={isSaving} onClick={() => void handleSave()}>
                {isSaving ? <><span className="button-spinner" /> Guardando…</> : 'Confirmar y guardar'}
              </button>
            </footer>
          </section>
        </div>
      )}
    </div>
  );
}
