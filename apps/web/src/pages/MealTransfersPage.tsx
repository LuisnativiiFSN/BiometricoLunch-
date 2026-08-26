import { useEffect, useState, type FormEvent } from 'react';
import {
  createMealTransfer,
  getRecentMealTransfers,
  getTransferableMealReservations,
} from '../services/transfers.service';
import type {
  MealTransferHistoryItem,
  MealTransferResult,
  TransferableReservationsResult,
} from '../types/transfer';

const TIME_ZONE = 'America/Guatemala';

export function MealTransfersPage() {
  const [fromEmployeeCode, setFromEmployeeCode] = useState('');
  const [toEmployeeCode, setToEmployeeCode] = useState('');
  const [pendingResult, setPendingResult] = useState<TransferableReservationsResult | null>(null);
  const [selectedReservationId, setSelectedReservationId] = useState('');
  const [history, setHistory] = useState<MealTransferHistoryItem[]>([]);
  const [result, setResult] = useState<MealTransferResult | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [isSearching, setIsSearching] = useState(false);
  const [isSaving, setIsSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const loadHistory = (signal?: AbortSignal) => {
    setIsLoading(true);
    void getRecentMealTransfers(signal)
      .then(setHistory)
      .catch((loadError: unknown) => {
        if (loadError instanceof DOMException && loadError.name === 'AbortError') return;
        setError(loadError instanceof Error ? loadError.message : 'No fue posible consultar las transferencias');
      })
      .finally(() => {
        if (!signal?.aborted) setIsLoading(false);
      });
  };

  useEffect(() => {
    const controller = new AbortController();
    loadHistory(controller.signal);
    return () => controller.abort();
  }, []);

  const searchPending = async () => {
    const code = fromEmployeeCode.trim();
    if (!code) return;

    setIsSearching(true);
    setError(null);
    setResult(null);
    setPendingResult(null);
    setSelectedReservationId('');

    try {
      const pending = await getTransferableMealReservations(code);
      setPendingResult(pending);
      setSelectedReservationId(pending.reservations[0]?.id ?? '');
    } catch (searchError) {
      setError(searchError instanceof Error ? searchError.message : 'No fue posible consultar las reservaciones pendientes');
    } finally {
      setIsSearching(false);
    }
  };

  const handleSubmit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    const selectedReservation = pendingResult?.reservations.find(
      (reservation) => reservation.id === selectedReservationId,
    );
    if (!pendingResult || !selectedReservation) return;

    setIsSaving(true);
    setError(null);
    setResult(null);

    try {
      const transferred = await createMealTransfer(
        pendingResult.employee.employeeCode,
        toEmployeeCode.trim(),
        selectedReservation.date,
      );
      setResult(transferred);
      setToEmployeeCode('');

      const [pending, recent] = await Promise.all([
        getTransferableMealReservations(pendingResult.employee.employeeCode),
        getRecentMealTransfers(),
      ]);
      setPendingResult(pending);
      setSelectedReservationId(pending.reservations[0]?.id ?? '');
      setHistory(recent);
    } catch (transferError) {
      setError(transferError instanceof Error ? transferError.message : 'No fue posible realizar la transferencia');
    } finally {
      setIsSaving(false);
    }
  };

  return (
    <div className="page transfer-page">
      <header className="page-header">
        <div>
          <span className="section-kicker">Administrador y Recursos Humanos</span>
          <h1>Control de transferencias</h1>
          <p>Busca a D1, elige una de sus comidas pendientes y transfiérela al código de D2.</p>
        </div>
        <span className="transfer-badge">Movimiento auditado</span>
      </header>

      <div className="transfer-layout">
        <section className="transfer-form-card" aria-labelledby="transfer-form-title">
          <span className="card-eyebrow">Nueva transferencia</span>
          <h2 id="transfer-form-title">Reservaciones pendientes de D1</h2>
          <p>Se muestran las comidas sin entregar de hoy y fechas futuras.</p>

          <form className="transfer-form transfer-control-form" onSubmit={(event) => void handleSubmit(event)}>
            <label className="form-field transfer-source-field">
              <span>Código de quien reservó (D1)</span>
              <div className="transfer-source-search">
                <input
                  value={fromEmployeeCode}
                  maxLength={50}
                  required
                  placeholder="Ej. 18358"
                  autoComplete="off"
                  disabled={isSearching || isSaving}
                  onChange={(event) => {
                    setFromEmployeeCode(event.target.value);
                    setPendingResult(null);
                    setSelectedReservationId('');
                    setResult(null);
                  }}
                />
                <button className="button button-secondary" type="button" disabled={isSearching || isSaving || !fromEmployeeCode.trim()} onClick={() => void searchPending()}>
                  {isSearching ? 'Buscando…' : 'Buscar pendientes'}
                </button>
              </div>
            </label>

            {pendingResult && (
              <div className="transfer-pending-panel">
                <div className="transfer-employee-heading">
                  <span className="mini-avatar" aria-hidden="true">{pendingResult.employee.name.slice(0, 1).toUpperCase()}</span>
                  <div><strong>{pendingResult.employee.name}</strong><small>{pendingResult.employee.employeeCode} · {pendingResult.reservations.length} pendientes</small></div>
                </div>

                {pendingResult.reservations.length === 0 ? (
                  <div className="transfer-no-pending">Este empleado no tiene comidas pendientes disponibles para transferir.</div>
                ) : (
                  <fieldset className="transfer-reservation-list">
                    <legend>Selecciona la comida que desea transferir</legend>
                    {pendingResult.reservations.map((reservation) => (
                      <label className={`transfer-reservation-option ${selectedReservationId === reservation.id ? 'is-selected' : ''}`} key={reservation.id}>
                        <input type="radio" name="reservation" value={reservation.id} checked={selectedReservationId === reservation.id} disabled={isSaving} onChange={() => setSelectedReservationId(reservation.id)} />
                        <span><strong>{reservation.meal}</strong><small>{new Intl.DateTimeFormat('es-GT', { dateStyle: 'long', timeZone: 'UTC' }).format(new Date(`${reservation.date}T00:00:00Z`))}</small></span>
                        <i>{reservation.quantity} almuerzo</i>
                      </label>
                    ))}
                  </fieldset>
                )}
              </div>
            )}

            <label className="form-field transfer-beneficiary-field">
              <span>Código de quien recibirá (D2)</span>
              <input value={toEmployeeCode} maxLength={50} required placeholder="Código entregado por D1" autoComplete="off" disabled={isSaving || !selectedReservationId} onChange={(event) => setToEmployeeCode(event.target.value)} />
            </label>

            <div className="transfer-warning">
              D1 conservará el historial de que hizo la reservación, pero D2 recibirá el ticket, retirará la comida y asumirá el cobro mensual.
            </div>
            {error && <div className="form-error" role="alert">{error}</div>}
            <button className="button button-primary" type="submit" disabled={isSaving || isSearching || !selectedReservationId || !toEmployeeCode.trim() || pendingResult?.employee.employeeCode === toEmployeeCode.trim()}>
              {isSaving ? <><span className="button-spinner" aria-hidden="true" /> Transfiriendo…</> : 'Transferir comida seleccionada'}
            </button>
          </form>
        </section>

        <aside className={`transfer-result-card ${result ? 'has-result' : ''}`} aria-live="polite">
          {result ? (
            <>
              <span className="result-symbol" aria-hidden="true">✓</span>
              <span className="card-eyebrow">Transferencia completada</span>
              <h2>{result.meal}</h2>
              <div className="transfer-route">
                <span><small>Reservó</small><strong>{result.originalEmployee.name}</strong><i>{result.originalEmployee.code}</i></span>
                <b aria-hidden="true">→</b>
                <span><small>Recibirá y pagará</small><strong>{result.beneficiary.name}</strong><i>{result.beneficiary.code}</i></span>
              </div>
              <p>Registrada por {result.transferredBy}.</p>
            </>
          ) : (
            <>
              <span className="transfer-empty-icon" aria-hidden="true">⇄</span>
              <h2>Beneficiario efectivo</h2>
              <p>Busca las comidas de D1, selecciona una e indica el código proporcionado para D2.</p>
            </>
          )}
        </aside>
      </div>

      <section className="history-card transfer-history" aria-labelledby="transfer-history-title">
        <div className="history-toolbar">
          <div><h2 id="transfer-history-title">Últimas transferencias</h2><span>Registro de los movimientos realizados por Administrador o RH</span></div>
          <button className="button button-secondary" type="button" disabled={isLoading || isSaving} onClick={() => loadHistory()}>{isLoading ? 'Consultando…' : 'Actualizar'}</button>
        </div>
        <div className="table-scroll">
          <table className="meals-table">
            <thead><tr><th>Fecha comida</th><th>Reservó</th><th>Beneficiario</th><th>Almuerzo</th><th>Realizó</th><th>Momento</th></tr></thead>
            <tbody>
              {isLoading ? <tr><td colSpan={6} className="history-empty">Consultando transferencias…</td></tr> : history.length === 0 ? <tr><td colSpan={6} className="history-empty">Todavía no hay transferencias registradas.</td></tr> : history.map((item) => (
                <tr key={item.id}>
                  <td data-label="Fecha comida">{new Intl.DateTimeFormat('es-GT', { dateStyle: 'medium', timeZone: 'UTC' }).format(new Date(`${item.date}T00:00:00Z`))}</td>
                  <td data-label="Reservó"><strong>{item.originalEmployee.name}</strong><small className="transfer-code">{item.originalEmployee.code}</small></td>
                  <td data-label="Beneficiario"><strong>{item.beneficiary.name}</strong><small className="transfer-code">{item.beneficiary.code}</small></td>
                  <td data-label="Almuerzo">{item.meal}</td>
                  <td data-label="Realizó">{item.transferredBy}</td>
                  <td data-label="Momento">{new Intl.DateTimeFormat('es-GT', { dateStyle: 'short', timeStyle: 'short', timeZone: TIME_ZONE }).format(new Date(item.transferredAt))}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>
    </div>
  );
}
