BEGIN TRY

BEGIN TRAN;

CREATE TABLE [dbo].[enrollment_authorizations] (
    [id] UNIQUEIDENTIFIER NOT NULL,
    [token_hash] CHAR(64) NOT NULL,
    [operator_employee_code] VARCHAR(50) NOT NULL,
    [operator_enrollment_id] UNIQUEIDENTIFIER NOT NULL,
    [target_employee_code] VARCHAR(50) NOT NULL,
    [finger_position] VARCHAR(50) NOT NULL,
    [created_at] DATETIME2 NOT NULL CONSTRAINT [enrollment_authorizations_created_at_df] DEFAULT CURRENT_TIMESTAMP,
    [expires_at] DATETIME2 NOT NULL,
    [consumed_at] DATETIME2 NULL,
    CONSTRAINT [enrollment_authorizations_pkey] PRIMARY KEY CLUSTERED ([id]),
    CONSTRAINT [enrollment_authorizations_token_hash_key] UNIQUE NONCLUSTERED ([token_hash]),
    CONSTRAINT [enrollment_authorizations_operator_fkey] FOREIGN KEY ([operator_employee_code]) REFERENCES [dbo].[employees]([employee_code]),
    CONSTRAINT [enrollment_authorizations_target_fkey] FOREIGN KEY ([target_employee_code]) REFERENCES [dbo].[employees]([employee_code]),
    CONSTRAINT [enrollment_authorizations_operator_enrollment_fkey] FOREIGN KEY ([operator_enrollment_id]) REFERENCES [dbo].[fingerprints]([id])
);

CREATE NONCLUSTERED INDEX [enrollment_authorizations_expiry_consumed_idx]
ON [dbo].[enrollment_authorizations]([expires_at], [consumed_at]);

CREATE NONCLUSTERED INDEX [enrollment_authorizations_operator_idx]
ON [dbo].[enrollment_authorizations]([operator_employee_code]);

CREATE NONCLUSTERED INDEX [enrollment_authorizations_target_idx]
ON [dbo].[enrollment_authorizations]([target_employee_code]);

COMMIT TRAN;

END TRY
BEGIN CATCH

IF @@TRANCOUNT > 0
BEGIN
    ROLLBACK TRAN;
END;
THROW;

END CATCH
