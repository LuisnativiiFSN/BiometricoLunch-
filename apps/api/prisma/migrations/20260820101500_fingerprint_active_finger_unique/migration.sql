BEGIN TRY

BEGIN TRAN;

IF EXISTS (
    SELECT 1
    FROM [dbo].[fingerprints]
    WHERE [active] = 1
    GROUP BY [employee_id], [finger_position]
    HAVING COUNT(*) > 1
)
    THROW 51000, 'Existen huellas activas duplicadas para el mismo empleado y dedo.', 1;

CREATE UNIQUE NONCLUSTERED INDEX [fingerprints_employee_finger_active_key]
ON [dbo].[fingerprints]([employee_id], [finger_position])
WHERE [active] = 1;

COMMIT TRAN;

END TRY
BEGIN CATCH

IF @@TRANCOUNT > 0
BEGIN
    ROLLBACK TRAN;
END;
THROW;

END CATCH
