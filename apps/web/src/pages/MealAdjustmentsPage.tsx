import { useEffect, useMemo, useState, type FormEvent } from 'react';
import {
  adjustEmployeeMeal,
  getMealAdjustmentContext,
  getRecentMealAdjustments,
} from '../services/meals.service';
import type {
  MealAdjustmentContext,
  MealAdjustmentHistoryItem,
  MealAdjustmentResult,
} from '../types/weekly-meal';

const TIME_ZONE = 'America/Guatemala';

function formatMealDate(value: string, dateStyle: 'medium' | 'long' = 'long') {
  return new Intl.DateTimeFormat('es-GT', {
    dateStyle,
    timeZone: 'UTC',
  }).format(new Date(`${value}T00:00:00.000Z`));
}

export function MealAdjustmentsPage() {
  const [employeeCode, setEmployeeCode] = useState('');
  const [context, setContext] = useState<MealAdjustmentContext | null>(null);
  const [selectedDate, setSelectedDate] = useState('');
  const [action, setAction] = useState<'ADD' | 'CHANGE' | 'CANCEL'>('ADD');
  const [newMealId, setNewMealId] = useState('');
  const [reason, setReason] = useState('');
  const [history, setHistory] = useState<MealAdjustmentHistoryItem[]>([]);
  const [result, setResult] = useState<MealAdjustmentResult | null>(null);
  const [isLoadingHistory, setIsLoadingHistory] = useState(true);
  const [isSearching, setIsSearching] = useState(false);
  const [isSaving, setIsSaving] = useState(false);
  const [showConfirmation, setShowConfirmation] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const loadHistory = (signal?: AbortSignal) => {
    setIsLoadingHistory(true);
    void getRecentMealAdjustments(signal)
      .then(setHistory)
      .catch((loadError: unknown) => {
        if (loadError instanceof DOMException && loadError.name === 'AbortError') return;
        setError(loadError instanceof Error ? loadError.message : 'No fue posible consultar el historial');
      })
      .finally(() => {
        if (!signal?.aborted) setIsLoadingHistory(false);
      });
  };

  useEffect(() => {
    const controller = new AbortController();
    loadHistory(controller.signal);
    return () => controller.abort();
  }, []);

  const selectedDay = useMemo(
    () => context?.days.find((day) => day.date === selectedDate) ?? null,
    [context, selectedDate],
  );
  const alternativeMeals = useMemo(
    () => selectedDay?.meals.filter(
      (meal) => meal.id !== selectedDay.reservation?.mealId,
    ) ?? [],
    [selectedDay],
  );
  const selectableMeals = action === 'ADD' ? selectedDay?.meals ?? [] : alternativeMeals;
  const selectedNewMeal = selectableMeals.find((meal) => meal.id === newMealId) ?? null;

  const selectFirstAvailableReservation = (nextContext: MealAdjustmentContext) => {
    const firstDay = nextContext.days.find((day) => day.canModify);
    setSelectedDate(firstDay?.date ?? '');
    if (!firstDay) {
      setNewMealId('');
      setAction('ADD');
      return;
    }
    const firstMeal = firstDay.reservation
      ? firstDay.meals.find((meal) => meal.id !== firstDay.reservation?.mealId)
      : firstDay.meals[0];
    setNewMealId(firstMeal?.id ?? '');
    setAction(firstDay.reservation ? (firstMeal ? 'CHANGE' : 'CANCEL') : 'ADD');
  };

  const searchEmployee = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    const code = employeeCode.trim();
    if (!code) return;

    setIsSearching(true);
    setError(null);
    setResult(null);
    try {
      const nextContext = await getMealAdjustmentContext(code);
      setContext(nextContext);
      setEmployeeCode(nextContext.employee.code);
      selectFirstAvailableReservation(nextContext);
      setReason('');
    } catch (searchError) {
      setContext(null);
      setSelectedDate('');
      setError(searchError instanceof Error ? searchError.message : 'No fue posible consultar al empleado');
    } finally {
      setIsSearching(false);
    }
  };

  const handleDaySelection = (date: string) => {
    const day = context?.days.find((item) => item.date === date);
    const firstAlternative = day?.meals.find(
      (meal) => meal.id !== day.reservation?.mealId,
    );
    setSelectedDate(date);
    const firstMeal = day?.reservation ? firstAlternative : day?.meals[0];
    setNewMealId(firstMeal?.id ?? '');
    setAction(day?.reservation ? (firstMeal ? 'CHANGE' : 'CANCEL') : 'ADD');
    setReason('');
    setResult(null);
    setError(null);
  };

  const canContinue = Boolean(
    context &&
    selectedDay?.canModify &&
    reason.trim().length >= 5 &&
    (action === 'CANCEL' || newMealId),
  );

  const confirmAdjustment = async () => {
    if (!context || !selectedDay || !canContinue) return;
    setIsSaving(true);
    setError(null);
    try {
      const saved = await adjustEmployeeMeal(context.employee.code, {
        date: selectedDay.date,
        action,
        ...(action !== 'CANCEL' ? { mealId: newMealId } : {}),
        reason: reason.trim(),
      });
      setResult(saved);
      setShowConfirmation(false);
      setReason('');

      const [nextContext, recent] = await Promise.all([
        getMealAdjustmentContext(context.employee.code),
        getRecentMealAdjustments(),
      ]);
      setContext(nextContext);
      setHistory(recent);
      selectFirstAvailableReservation(nextContext);
    } catch (saveError) {
      setShowConfirmation(false);
      setError(saveError instanceof Error ? saveError.message : 'No fue posible modificar la reservación');
    } finally {
      setIsSaving(false);
    }
  };

  return (
    <div className="page adjustment-page">
      <header className="page-header">
        <div>
          <span className="section-kicker">Exclusivo de Recursos Humanos</span>
          <h1>Modificación de almuerzo</h1>
          <p>Agrega, cambia o cancela un almuerzo y deja registrado el motivo de la excepción.</p>
        </div>
        <span className="adjustment-badge">Movimiento auditado</span>
      </header>

      <section className="adjustment-search-card">
        <div>
          <span className="card-eyebrow">Paso 1</span>
          <h2>Busca al empleado</h2>
          <p>Se mostrarán los cinco días de la semana actual, aunque la persona todavía no tenga reservaciones.</p>
        </div>
        <form onSubmit={(event) => void searchEmployee(event)}>
          <label className="form-field">
            <span>Código de empleado</span>
            <input
              value={employeeCode}
              maxLength={50}
              autoComplete="off"
              placeholder="Ej. 18908"
              disabled={isSearching || isSaving}
              onChange={(event) => {
                setEmployeeCode(event.target.value);
                setContext(null);
                setResult(null);
                setError(null);
              }}
            />
          </label>
          <button className="button button-primary" type="submit" disabled={!employeeCode.trim() || isSearching || isSaving}>
            {isSearching ? <><span className="button-spinner" aria-hidden="true" /> Buscando…</> : 'Buscar reservaciones'}
          </button>
        </form>
      </section>

      {context && (
        <div className="adjustment-layout">
          <section className="adjustment-reservations-card">
            <div className="adjustment-employee">
              <span className="mini-avatar" aria-hidden="true">{context.employee.name.slice(0, 1).toUpperCase()}</span>
              <div>
                <span className="card-eyebrow">Empleado identificado</span>
                <h2>{context.employee.name}</h2>
                <p>Código {context.employee.code} · {context.employee.department}</p>
              </div>
            </div>

            <fieldset className="adjustment-day-list">
              <legend>Selecciona el día que se modificará</legend>
              {context.days.map((day) => {
                const reservation = day.reservation;
                const available = day.canModify;
                return (
                  <label className={`adjustment-day-option ${selectedDate === day.date ? 'is-selected' : ''} ${!available ? 'is-locked' : ''}`} key={day.date}>
                    <input
                      type="radio"
                      name="adjustment-day"
                      checked={selectedDate === day.date}
                      disabled={!available || isSaving}
                      onChange={() => handleDaySelection(day.date)}
                    />
                    <span className="adjustment-day-date"><strong>{day.dayName}</strong><small>{formatMealDate(day.date, 'medium')}</small></span>
                    <span className="adjustment-current-meal">
                      <small>Pedido actual</small>
                      <strong>{reservation?.mealName ?? 'Sin reservación'}</strong>
                    </span>
                    <i>{available ? (reservation ? 'Disponible para modificar' : 'Disponible para agregar') : day.lockReason}</i>
                  </label>
                );
              })}
            </fieldset>
          </section>

          <section className="adjustment-form-card">
            <span className="card-eyebrow">Paso 2</span>
            <h2>Indica el cambio autorizado</h2>
            {!selectedDay ? (
              <div className="adjustment-empty">No hay días disponibles para modificar durante esta semana.</div>
            ) : (
              <>
                {selectedDay.reservation ? (
                  <div className="adjustment-action-tabs" role="group" aria-label="Tipo de modificación">
                    <button className={action === 'CHANGE' ? 'is-active' : ''} type="button" disabled={alternativeMeals.length === 0 || isSaving} onClick={() => { setAction('CHANGE'); setNewMealId(alternativeMeals[0]?.id ?? ''); }}>Cambiar comida</button>
                    <button className={action === 'CANCEL' ? 'is-active is-danger' : ''} type="button" disabled={isSaving} onClick={() => { setAction('CANCEL'); setNewMealId(''); }}>Cancelar pedido</button>
                  </div>
                ) : (
                  <div className="adjustment-add-banner">
                    <span aria-hidden="true">+</span>
                    <div><strong>Agregar almuerzo</strong><small>La persona no tiene reservación para este día.</small></div>
                  </div>
                )}

                {action !== 'CANCEL' ? (
                  <fieldset className="adjustment-meal-options">
                    <legend>{action === 'ADD' ? 'Comida que se agregará' : 'Nueva comida'} para {selectedDay.dayName}</legend>
                    {selectableMeals.length === 0 ? (
                      <div className="adjustment-empty">No hay opciones de comida disponibles para este día.</div>
                    ) : selectableMeals.map((meal) => (
                      <label className={newMealId === meal.id ? 'is-selected' : ''} key={meal.id}>
                        <input type="radio" name="new-meal" value={meal.id} checked={newMealId === meal.id} disabled={isSaving} onChange={() => setNewMealId(meal.id)} />
                        <span aria-hidden="true" />
                        <strong>{meal.name}</strong>
                      </label>
                    ))}
                  </fieldset>
                ) : (
                  <div className="adjustment-cancel-warning">
                    <strong>Se eliminará la reservación de {selectedDay.dayName}</strong>
                    <span>{selectedDay.reservation?.mealName}</span>
                  </div>
                )}

                <label className="form-field adjustment-reason">
                  <span>Motivo de la modificación</span>
                  <textarea
                    value={reason}
                    minLength={5}
                    maxLength={500}
                    rows={4}
                    placeholder="Explica por qué Recursos Humanos autoriza este cambio…"
                    disabled={isSaving}
                    onChange={(event) => setReason(event.target.value)}
                  />
                  <small>{reason.trim().length}/500 · El usuario de RH se registrará automáticamente.</small>
                </label>

                <button className={`button ${action === 'CANCEL' ? 'button-danger' : 'button-primary'}`} type="button" disabled={!canContinue || isSaving} onClick={() => setShowConfirmation(true)}>
                  Revisar y confirmar
                </button>
              </>
            )}
          </section>
        </div>
      )}

      {error && <div className="form-error adjustment-feedback" role="alert">{error}</div>}
      {result && (
        <div className="users-success adjustment-feedback" role="status">
          {result.status === 'ADDED'
            ? `Reservación de “${result.newMeal}” agregada. Registrado por ${result.modifiedBy}.`
            : result.status === 'CHANGED'
              ? `Comida cambiada de “${result.previousMeal}” a “${result.newMeal}”. Registrado por ${result.modifiedBy}.`
              : `Reservación de “${result.previousMeal}” cancelada. Registrado por ${result.modifiedBy}.`}
        </div>
      )}

      <section className="history-card adjustment-history" aria-labelledby="adjustment-history-title">
        <div className="history-toolbar">
          <div><h2 id="adjustment-history-title">Historial de modificaciones</h2><span>Altas, cambios y cancelaciones realizados por Recursos Humanos</span></div>
          <button className="button button-secondary" type="button" disabled={isLoadingHistory || isSaving} onClick={() => loadHistory()}>{isLoadingHistory ? 'Consultando…' : 'Actualizar'}</button>
        </div>
        <div className="table-scroll">
          <table className="meals-table">
            <thead><tr><th>Fecha comida</th><th>Empleado</th><th>Acción</th><th>Pedido anterior</th><th>Resultado</th><th>Motivo</th><th>Realizó</th><th>Momento</th></tr></thead>
            <tbody>
              {isLoadingHistory ? <tr><td colSpan={8} className="history-empty">Consultando modificaciones…</td></tr> : history.length === 0 ? <tr><td colSpan={8} className="history-empty">Todavía no hay modificaciones registradas.</td></tr> : history.map((item) => (
                <tr key={item.id}>
                  <td data-label="Fecha comida">{formatMealDate(item.date, 'medium')}</td>
                  <td data-label="Empleado"><strong>{item.employee.name}</strong><small className="adjustment-code">{item.employee.code} · {item.employee.department}</small></td>
                  <td data-label="Acción"><span className={`adjustment-action-pill ${item.action === 'CANCEL' ? 'is-cancelled' : item.action === 'ADD' ? 'is-added' : ''}`}>{item.action === 'ADD' ? 'Agregado' : item.action === 'CHANGE' ? 'Cambio' : 'Cancelación'}</span></td>
                  <td data-label="Pedido anterior">{item.previousMeal ?? 'Sin reservación'}</td>
                  <td data-label="Resultado">{item.newMeal ?? 'Sin reservación'}</td>
                  <td data-label="Motivo">{item.reason}</td>
                  <td data-label="Realizó">{item.modifiedBy}</td>
                  <td data-label="Momento">{new Intl.DateTimeFormat('es-GT', { dateStyle: 'short', timeStyle: 'short', timeZone: TIME_ZONE }).format(new Date(item.modifiedAt))}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>

      {showConfirmation && context && selectedDay && (
        <div className="meal-confirmation-backdrop" role="presentation" onMouseDown={(event) => { if (event.target === event.currentTarget && !isSaving) setShowConfirmation(false); }}>
          <section className="meal-confirmation-modal adjustment-confirmation" role="dialog" aria-modal="true" aria-labelledby="adjustment-confirmation-title">
            <header>
              <span className="confirmation-icon" aria-hidden="true">!</span>
              <div><span className="card-eyebrow">Confirmación de RH</span><h2 id="adjustment-confirmation-title">Confirma la modificación</h2></div>
              <button type="button" aria-label="Cerrar confirmación" disabled={isSaving} onClick={() => setShowConfirmation(false)}>×</button>
            </header>
            <div className="adjustment-confirmation-summary">
              <p><span>Empleado</span><strong>{context.employee.name}</strong><small>{context.employee.code} · {context.employee.department}</small></p>
              <p><span>Fecha</span><strong>{selectedDay.dayName}</strong><small>{formatMealDate(selectedDay.date)}</small></p>
              <p><span>Pedido actual</span><strong>{selectedDay.reservation?.mealName ?? 'Sin reservación'}</strong></p>
              <p><span>Resultado</span><strong>{action === 'CANCEL' ? 'Reservación cancelada' : selectedNewMeal?.name}</strong></p>
            </div>
            <div className="adjustment-confirmation-reason"><span>Motivo registrado</span><p>{reason.trim()}</p></div>
            <footer>
              <button className="button button-secondary" type="button" disabled={isSaving} onClick={() => setShowConfirmation(false)}>Volver</button>
              <button className={`button ${action === 'CANCEL' ? 'button-danger' : 'button-primary'}`} type="button" disabled={isSaving} onClick={() => void confirmAdjustment()}>
                {isSaving ? <><span className="button-spinner" aria-hidden="true" /> Guardando…</> : action === 'ADD' ? 'Confirmar reservación' : action === 'CHANGE' ? 'Confirmar cambio' : 'Confirmar cancelación'}
              </button>
            </footer>
          </section>
        </div>
      )}
    </div>
  );
}
