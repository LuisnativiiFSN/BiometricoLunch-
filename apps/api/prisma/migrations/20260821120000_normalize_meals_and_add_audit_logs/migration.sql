BEGIN TRY

BEGIN TRAN;

-- email_jobs was only scaffolding for a future mail queue and has no active
-- application flow. Removing the table also removes its indexes and FK.
IF OBJECT_ID(N'[dbo].[email_jobs]', N'U') IS NOT NULL
    DROP TABLE [dbo].[email_jobs];

-- A meal is an offering available on a specific date. Reservations now point
-- to this catalog instead of repeating the display name on every row.
CREATE TABLE [dbo].[meals] (
    [id] UNIQUEIDENTIFIER NOT NULL,
    [name] VARCHAR(150) NOT NULL,
    [available_date] DATE NOT NULL,
    [meal_type] VARCHAR(20) NOT NULL CONSTRAINT [meals_meal_type_df] DEFAULT 'LUNCH',
    [active] BIT NOT NULL CONSTRAINT [meals_active_df] DEFAULT 1,
    [created_at] DATETIME2 NOT NULL CONSTRAINT [meals_created_at_df] DEFAULT CURRENT_TIMESTAMP,
    [updated_at] DATETIME2 NOT NULL,
    CONSTRAINT [meals_pkey] PRIMARY KEY CLUSTERED ([id]),
    CONSTRAINT [meals_name_date_type_key] UNIQUE NONCLUSTERED ([name], [available_date], [meal_type]),
    CONSTRAINT [meals_meal_type_check] CHECK ([meal_type] IN ('BREAKFAST', 'LUNCH', 'DINNER'))
);

CREATE NONCLUSTERED INDEX [meals_available_date_type_active_idx]
ON [dbo].[meals]([available_date], [meal_type], [active]);

-- Preserve existing reservation data by creating one catalog item per unique
-- name/date/type before replacing meal_name with meal_id.
INSERT INTO [dbo].[meals] (
    [id], [name], [available_date], [meal_type], [active], [created_at], [updated_at]
)
SELECT
    NEWID(),
    [meal_name],
    [meal_date],
    [meal_type],
    1,
    MIN([created_at]),
    MAX([updated_at])
FROM [dbo].[meal_reservations]
GROUP BY [meal_name], [meal_date], [meal_type];

ALTER TABLE [dbo].[meal_reservations] ADD
    [transfer_employee] VARCHAR(50) NULL,
    [meal_id] UNIQUEIDENTIFIER NULL,
    [quantity] INT NOT NULL CONSTRAINT [meal_reservations_quantity_df] DEFAULT 1;

-- SQL Server compiles references to newly-added columns before executing the
-- ALTER above when they share a batch, so these dependent steps use a nested
-- batch while remaining inside this transaction.
EXEC sp_executesql N'
UPDATE reservation
SET [meal_id] = meal.[id]
FROM [dbo].[meal_reservations] AS reservation
INNER JOIN [dbo].[meals] AS meal
    ON meal.[name] = reservation.[meal_name]
   AND meal.[available_date] = reservation.[meal_date]
   AND meal.[meal_type] = reservation.[meal_type];';

EXEC sp_executesql N'
IF EXISTS (SELECT 1 FROM [dbo].[meal_reservations] WHERE [meal_id] IS NULL)
    THROW 51001, ''No fue posible relacionar todas las reservaciones existentes con meals.'', 1;';

EXEC sp_executesql N'
ALTER TABLE [dbo].[meal_reservations]
ALTER COLUMN [meal_id] UNIQUEIDENTIFIER NOT NULL;';

ALTER TABLE [dbo].[meal_reservations]
DROP COLUMN [meal_name];

EXEC sp_executesql N'
ALTER TABLE [dbo].[meal_reservations] ADD
    CONSTRAINT [meal_reservations_quantity_check] CHECK ([quantity] >= 1),
    CONSTRAINT [meal_reservations_meal_id_fkey]
        FOREIGN KEY ([meal_id]) REFERENCES [dbo].[meals]([id]) ON DELETE NO ACTION ON UPDATE NO ACTION,
    CONSTRAINT [meal_reservations_transfer_employee_fkey]
        FOREIGN KEY ([transfer_employee]) REFERENCES [dbo].[employees]([employee_code]) ON DELETE NO ACTION ON UPDATE NO ACTION;';

EXEC sp_executesql N'
CREATE NONCLUSTERED INDEX [meal_reservations_meal_id_idx]
ON [dbo].[meal_reservations]([meal_id]);';

EXEC sp_executesql N'
CREATE NONCLUSTERED INDEX [meal_reservations_transfer_employee_idx]
ON [dbo].[meal_reservations]([transfer_employee]);';

-- This table is intentionally infrastructure-only for now. Application audit
-- writes will be added together with the future edit/delete functionality.
CREATE TABLE [dbo].[audit_logs] (
    [id] UNIQUEIDENTIFIER NOT NULL,
    [entity_name] VARCHAR(100) NOT NULL,
    [entity_id] VARCHAR(100) NULL,
    [action] VARCHAR(20) NOT NULL,
    [actor_employee_id] VARCHAR(50) NULL,
    [previous_values] NVARCHAR(max) NULL,
    [new_values] NVARCHAR(max) NULL,
    [created_at] DATETIME2 NOT NULL CONSTRAINT [audit_logs_created_at_df] DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT [audit_logs_pkey] PRIMARY KEY CLUSTERED ([id]),
    CONSTRAINT [audit_logs_action_check] CHECK ([action] IN ('CREATE', 'UPDATE', 'DELETE'))
);

CREATE NONCLUSTERED INDEX [audit_logs_entity_idx]
ON [dbo].[audit_logs]([entity_name], [entity_id]);

CREATE NONCLUSTERED INDEX [audit_logs_actor_employee_idx]
ON [dbo].[audit_logs]([actor_employee_id]);

CREATE NONCLUSTERED INDEX [audit_logs_created_at_idx]
ON [dbo].[audit_logs]([created_at]);

ALTER TABLE [dbo].[audit_logs] ADD CONSTRAINT [audit_logs_actor_employee_id_fkey]
FOREIGN KEY ([actor_employee_id]) REFERENCES [dbo].[employees]([employee_code]) ON DELETE NO ACTION ON UPDATE NO ACTION;

COMMIT TRAN;

END TRY
BEGIN CATCH

IF @@TRANCOUNT > 0
BEGIN
    ROLLBACK TRAN;
END;
THROW;

END CATCH
