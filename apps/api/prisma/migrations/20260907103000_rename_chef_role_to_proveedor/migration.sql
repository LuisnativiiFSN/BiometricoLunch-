BEGIN TRY

BEGIN TRAN;

IF EXISTS (
    SELECT 1 FROM [dbo].[users] WHERE LOWER([username]) = 'chef'
)
AND EXISTS (
    SELECT 1 FROM [dbo].[users] WHERE LOWER([username]) = 'proveedor'
)
BEGIN
    THROW 50001, 'No se puede renombrar chef a proveedor porque el usuario proveedor ya existe.', 1;
END;

ALTER TABLE [dbo].[users] DROP CONSTRAINT [users_role_check];

UPDATE [dbo].[users]
SET
    [role] = 'PROVEEDOR',
    [username] = CASE
        WHEN LOWER([username]) = 'chef' THEN 'proveedor'
        ELSE [username]
    END,
    [updated_at] = CURRENT_TIMESTAMP
WHERE [role] = 'CHEF' OR LOWER([username]) = 'chef';

ALTER TABLE [dbo].[users]
ADD CONSTRAINT [users_role_check]
CHECK ([role] IN ('ADMIN', 'RH', 'PROVEEDOR'));

COMMIT TRAN;

END TRY
BEGIN CATCH

IF @@TRANCOUNT > 0
BEGIN
    ROLLBACK TRAN;
END;
THROW;

END CATCH
