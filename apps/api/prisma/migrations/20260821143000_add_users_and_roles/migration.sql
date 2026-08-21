BEGIN TRY

BEGIN TRAN;

CREATE TABLE [dbo].[users] (
    [id] UNIQUEIDENTIFIER NOT NULL,
    [username] VARCHAR(50) NOT NULL,
    [password_hash] VARCHAR(255) NOT NULL,
    [role] VARCHAR(20) NOT NULL,
    [active] BIT NOT NULL CONSTRAINT [users_active_df] DEFAULT 1,
    [password_locked] BIT NOT NULL CONSTRAINT [users_password_locked_df] DEFAULT 0,
    [last_login_at] DATETIME2 NULL,
    [created_at] DATETIME2 NOT NULL CONSTRAINT [users_created_at_df] DEFAULT CURRENT_TIMESTAMP,
    [updated_at] DATETIME2 NOT NULL,
    CONSTRAINT [users_pkey] PRIMARY KEY CLUSTERED ([id]),
    CONSTRAINT [users_username_key] UNIQUE NONCLUSTERED ([username]),
    CONSTRAINT [users_role_check] CHECK ([role] IN ('ADMIN', 'RH', 'CHEF'))
);

-- The initial administrator is created only with a bcrypt hash. Its password
-- is locked so it cannot be changed through the application endpoints.
INSERT INTO [dbo].[users] (
    [id], [username], [password_hash], [role], [active], [password_locked], [created_at], [updated_at]
)
VALUES (
    NEWID(),
    'admin',
    '$2b$12$/8pn0pcw4BbULWKCDrUja.NKqbAKKOWL2otYS5cSAxrPN7pEDhC26',
    'ADMIN',
    1,
    1,
    CURRENT_TIMESTAMP,
    CURRENT_TIMESTAMP
);

ALTER TABLE [dbo].[audit_logs]
ADD [actor_user_id] UNIQUEIDENTIFIER NULL;

EXEC sp_executesql N'
CREATE NONCLUSTERED INDEX [audit_logs_actor_user_idx]
ON [dbo].[audit_logs]([actor_user_id]);';

EXEC sp_executesql N'
ALTER TABLE [dbo].[audit_logs] ADD CONSTRAINT [audit_logs_actor_user_id_fkey]
FOREIGN KEY ([actor_user_id]) REFERENCES [dbo].[users]([id]) ON DELETE NO ACTION ON UPDATE NO ACTION;';

COMMIT TRAN;

END TRY
BEGIN CATCH

IF @@TRANCOUNT > 0
BEGIN
    ROLLBACK TRAN;
END;
THROW;

END CATCH
