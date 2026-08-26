import { useEffect, useState, type FormEvent } from 'react';
import { getEmployees } from '../services/employees.service';
import {
  createManualMealReservation,
  createTodayMeal,
  getAvailableMealsToday,
} from '../services/meals.service';
import type { Employee } from '../types/employee';
import type { AvailableMeal, ManualMealReservationResult } from '../types/meal-history';

export function ManualMealRequestPage() {
  const [employees, setEmployees] = useState<Employee[]>([]);
  const [availableMeals, setAvailableMeals] = useState<AvailableMeal[]>([]);
  const [selectedEmployeeId, setSelectedEmployeeId] = useState('');
  const [selectedMealId, setSelectedMealId] = useState('');
  const [newMealName, setNewMealName] = useState('');
  const [isLoading, setIsLoading] = useState(true);
  const [isSaving, setIsSaving] = useState(false);
  const [isCreatingMeal, setIsCreatingMeal] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [mealError, setMealError] = useState<string | null>(null);
  const [mealMessage, setMealMessage] = useState<string | null>(null);
  const [result, setResult] = useState<ManualMealReservationResult | null>(null);

  useEffect(() => {
    const controller = new AbortController();

    void Promise.all([
      getEmployees({ active: true, signal: controller.signal }),
      getAvailableMealsToday(controller.signal),
    ])
      .then(([activeEmployees, meals]) => {
        setEmployees(activeEmployees);
        setAvailableMeals(meals);
        setSelectedEmployeeId(activeEmployees[0]?.employeeCode ?? '');
        setSelectedMealId(meals[0]?.id ?? '');
      })
      .catch((loadError: unknown) => {
        if (loadError instanceof DOMException && loadError.name === 'AbortError') return;
        setError(loadError instanceof Error ? loadError.message : 'No fue posible consultar los empleados');
      })
      .finally(() => {
        if (!controller.signal.aborted) setIsLoading(false);
      });

    return () => controller.abort();
  }, []);

  const handleCreateMeal = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    const name = newMealName.trim();
    if (!name) return;

    setIsCreatingMeal(true);
    setMealError(null);
    setMealMessage(null);
    setError(null);
    setResult(null);

    try {
      const created = await createTodayMeal(name);
      setAvailableMeals((current) =>
        [...current.filter((meal) => meal.id !== created.meal.id), created.meal]
          .sort((left, right) => left.name.localeCompare(right.name, 'es')),
      );
      setSelectedMealId(created.meal.id);
      setNewMealName('');
      setMealMessage(
        created.status === 'CREATED'
          ? `${created.meal.name} quedó disponible para hoy y ya está seleccionado.`
          : created.status === 'REACTIVATED'
            ? `${created.meal.name} fue reactivado para hoy y ya está seleccionado.`
            : `${created.meal.name} ya existía para hoy y quedó seleccionado.`,
      );
    } catch (createError) {
      setMealError(createError instanceof Error ? createError.message : 'No fue posible crear el almuerzo de hoy');
    } finally {
      setIsCreatingMeal(false);
    }
  };

  const handleSubmit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (!selectedEmployeeId || !selectedMealId) return;
    setIsSaving(true);
    setError(null);
    setResult(null);

    try {
      setResult(await createManualMealReservation(selectedEmployeeId, selectedMealId));
    } catch (saveError) {
      setError(saveError instanceof Error ? saveError.message : 'No fue posible registrar la solicitud manual');
    } finally {
      setIsSaving(false);
    }
  };

  return (
    <div className="page manual-request-page">
      <header className="page-header">
        <div>
          <span className="section-kicker">Herramienta temporal</span>
          <h1>Solicitud manual</h1>
          <p>Crea el almuerzo de hoy y asígnalo a una persona para que quede pendiente de entrega.</p>
        </div>
        <span className="manual-badge">Registro autorizado</span>
      </header>

      <section className="today-meal-card" aria-labelledby="today-meal-title">
        <div className="today-meal-copy">
          <span className="manual-step">Paso 1 · Menú de hoy</span>
          <h2 id="today-meal-title">Agregar almuerzo disponible</h2>
          <p>Se guardará como Lunch para {new Intl.DateTimeFormat('es-GT', { dateStyle: 'long', timeZone: 'America/Guatemala' }).format(new Date())}.</p>
        </div>
        <form className="today-meal-form" onSubmit={(event) => void handleCreateMeal(event)}>
          <label className="form-field">
            <span>Nombre del almuerzo</span>
            <input
              value={newMealName}
              maxLength={150}
              required
              placeholder="Ej. Pollo en salsa"
              disabled={isCreatingMeal || isSaving}
              onChange={(event) => setNewMealName(event.target.value)}
            />
          </label>
          <button className="button button-primary" type="submit" disabled={isCreatingMeal || isSaving || !newMealName.trim()}>
            {isCreatingMeal ? <><span className="button-spinner" aria-hidden="true" /> Guardando…</> : 'Agregar almuerzo de hoy'}
          </button>
        </form>
        {mealError && <div className="form-error today-meal-message" role="alert">{mealError}</div>}
        {mealMessage && <div className="users-success today-meal-message" role="status">{mealMessage}</div>}
      </section>

      <div className="manual-request-layout">
        <section className="manual-form-card" aria-labelledby="manual-form-title">
          <div className="manual-card-heading">
            <span className="manual-step">Paso 2 · Registro de hoy</span>
            <h2 id="manual-form-title">Asignar comida al empleado</h2>
            <p>Selecciona a la persona y confirma la comida que se le reservará.</p>
          </div>

          <form className="manual-meal-form" onSubmit={(event) => void handleSubmit(event)}>
            <label className="form-field">
              <span>Empleado activo</span>
              <div className="select-wrap manual-select">
                <select
                  value={selectedEmployeeId}
                  disabled={isLoading || isSaving || isCreatingMeal || employees.length === 0}
                  onChange={(event) => { setSelectedEmployeeId(event.target.value); setResult(null); }}
                >
                  {isLoading && <option value="">Consultando empleados…</option>}
                  {!isLoading && employees.length === 0 && <option value="">No hay empleados activos</option>}
                  {employees.map((employee) => (
                    <option value={employee.employeeCode} key={employee.employeeCode}>
                      {employee.name} — {employee.employeeCode}
                    </option>
                  ))}
                </select>
                <svg className="select-arrow" viewBox="0 0 24 24" aria-hidden="true"><path d="m8 10 4 4 4-4" /></svg>
              </div>
            </label>

            <label className="form-field">
              <span>Comida disponible hoy</span>
              <div className="select-wrap manual-select">
                <select
                  value={selectedMealId}
                  disabled={isLoading || isSaving || isCreatingMeal || availableMeals.length === 0}
                  onChange={(event) => { setSelectedMealId(event.target.value); setResult(null); }}
                >
                  {isLoading && <option value="">Consultando comidas…</option>}
                  {!isLoading && availableMeals.length === 0 && <option value="">No hay almuerzos disponibles hoy</option>}
                  {availableMeals.map((meal) => (
                    <option value={meal.id} key={meal.id}>{meal.name}</option>
                  ))}
                </select>
                <svg className="select-arrow" viewBox="0 0 24 24" aria-hidden="true"><path d="m8 10 4 4 4-4" /></svg>
              </div>
            </label>

            {error && <div className="form-error" role="alert">{error}</div>}

            <button className="button button-primary manual-submit" type="submit" disabled={isLoading || isSaving || isCreatingMeal || !selectedEmployeeId || !selectedMealId}>
              {isSaving ? <><span className="button-spinner" aria-hidden="true" /> Registrando…</> : 'Agregar solicitud de comida'}
            </button>
          </form>
        </section>

        <aside className={`manual-result-card ${result ? 'has-result' : ''}`} aria-live="polite">
          {result ? (
            <div className="manual-result-content">
              <span className="result-symbol" aria-hidden="true">{result.status === 'CREATED' ? '✓' : '!'}</span>
              <span className="card-eyebrow">{result.status === 'CREATED' ? 'Solicitud agregada' : 'Solicitud existente'}</span>
              <h2>{result.employee.name}</h2>
              <span className="manual-result-code">{result.employee.code}</span>
              <div className="manual-meal-summary">
                <span>Comida pendiente</span>
                <strong>{result.reservation.mealName}</strong>
              </div>
              <p>{result.status === 'CREATED' ? 'La persona ya aparece en los pendientes de hoy.' : 'Esta persona ya tenía una comida solicitada para hoy.'}</p>
            </div>
          ) : (
            <div className="manual-empty-state">
              <span className="manual-empty-icon" aria-hidden="true">+</span>
              <h2>Solicitud pendiente</h2>
              <p>La confirmación aparecerá aquí después de registrar la comida.</p>
              <div className="manual-flow"><span>1. Selecciona</span><i>→</i><span>2. Confirma</span><i>→</i><span>3. Pendiente</span></div>
            </div>
          )}
        </aside>
      </div>
    </div>
  );
}
