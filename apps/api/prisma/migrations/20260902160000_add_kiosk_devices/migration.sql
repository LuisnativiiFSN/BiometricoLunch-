BEGIN TRY

BEGIN TRAN;

CREATE TABLE [dbo].[kiosk_devices] (
    [id] UNIQUEIDENTIFIER NOT NULL,
    [name] VARCHAR(100) NOT NULL,
    [token_hash] CHAR(64) NOT NULL,
    [active] BIT NOT NULL CONSTRAINT [kiosk_devices_active_df] DEFAULT 1,
    [created_at] DATETIME2 NOT NULL CONSTRAINT [kiosk_devices_created_at_df] DEFAULT CURRENT_TIMESTAMP,
    [rotated_at] DATETIME2 NULL,
    [last_accessed_at] DATETIME2 NULL,
    CONSTRAINT [kiosk_devices_pkey] PRIMARY KEY CLUSTERED ([id]),
    CONSTRAINT [kiosk_devices_token_hash_key] UNIQUE NONCLUSTERED ([token_hash])
);

COMMIT TRAN;

END TRY
BEGIN CATCH

IF @@TRANCOUNT > 0
BEGIN
    ROLLBACK TRAN;
END;
THROW;

END CATCH
