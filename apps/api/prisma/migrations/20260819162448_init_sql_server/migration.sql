BEGIN TRY

BEGIN TRAN;

-- CreateTable
CREATE TABLE [dbo].[employees] (
    [employee_code] VARCHAR(50) NOT NULL,
    [name] VARCHAR(150) NOT NULL,
    [email] VARCHAR(254) NOT NULL,
    [department] VARCHAR(100) NOT NULL,
    [active] BIT NOT NULL CONSTRAINT [employees_active_df] DEFAULT 1,
    [created_at] DATETIME2 NOT NULL CONSTRAINT [employees_created_at_df] DEFAULT CURRENT_TIMESTAMP,
    [updated_at] DATETIME2 NOT NULL,
    CONSTRAINT [employees_pkey] PRIMARY KEY CLUSTERED ([employee_code])
);

-- CreateTable
CREATE TABLE [dbo].[fingerprints] (
    [id] UNIQUEIDENTIFIER NOT NULL,
    [employee_id] VARCHAR(50) NOT NULL,
    [finger_position] VARCHAR(50) NOT NULL,
    [template_data] VARBINARY(max) NOT NULL,
    [template_format] VARCHAR(50) NOT NULL,
    [quality] INT NOT NULL,
    [active] BIT NOT NULL CONSTRAINT [fingerprints_active_df] DEFAULT 1,
    [created_at] DATETIME2 NOT NULL CONSTRAINT [fingerprints_created_at_df] DEFAULT CURRENT_TIMESTAMP,
    [updated_at] DATETIME2 NOT NULL,
    CONSTRAINT [fingerprints_pkey] PRIMARY KEY CLUSTERED ([id])
);

-- CreateTable
CREATE TABLE [dbo].[meal_requests] (
    [id] UNIQUEIDENTIFIER NOT NULL,
    [employee_id] VARCHAR(50) NOT NULL,
    [meal_reservation_id] UNIQUEIDENTIFIER,
    [meal_date] DATE NOT NULL,
    [meal_type] VARCHAR(20) NOT NULL CONSTRAINT [meal_requests_meal_type_df] DEFAULT 'LUNCH',
    [requested_at] DATETIME2 NOT NULL CONSTRAINT [meal_requests_requested_at_df] DEFAULT CURRENT_TIMESTAMP,
    [status] VARCHAR(20) NOT NULL,
    [created_at] DATETIME2 NOT NULL CONSTRAINT [meal_requests_created_at_df] DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT [meal_requests_pkey] PRIMARY KEY CLUSTERED ([id])
);

-- CreateTable
CREATE TABLE [dbo].[meal_reservations] (
    [id] UNIQUEIDENTIFIER NOT NULL,
    [employee_id] VARCHAR(50) NOT NULL,
    [meal_date] DATE NOT NULL,
    [meal_type] VARCHAR(20) NOT NULL CONSTRAINT [meal_reservations_meal_type_df] DEFAULT 'LUNCH',
    [meal_name] VARCHAR(150) NOT NULL,
    [created_at] DATETIME2 NOT NULL CONSTRAINT [meal_reservations_created_at_df] DEFAULT CURRENT_TIMESTAMP,
    [updated_at] DATETIME2 NOT NULL,
    CONSTRAINT [meal_reservations_pkey] PRIMARY KEY CLUSTERED ([id]),
    CONSTRAINT [meal_reservations_employee_date_type_key] UNIQUE NONCLUSTERED ([employee_id],[meal_date],[meal_type])
);

-- CreateTable
CREATE TABLE [dbo].[tickets] (
    [id] UNIQUEIDENTIFIER NOT NULL,
    [meal_request_id] UNIQUEIDENTIFIER NOT NULL,
    [ticket_code] VARCHAR(100) NOT NULL,
    [created_at] DATETIME2 NOT NULL CONSTRAINT [tickets_created_at_df] DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT [tickets_pkey] PRIMARY KEY CLUSTERED ([id]),
    CONSTRAINT [tickets_meal_request_id_key] UNIQUE NONCLUSTERED ([meal_request_id]),
    CONSTRAINT [tickets_ticket_code_key] UNIQUE NONCLUSTERED ([ticket_code])
);

-- CreateTable
CREATE TABLE [dbo].[email_jobs] (
    [id] UNIQUEIDENTIFIER NOT NULL,
    [ticket_id] UNIQUEIDENTIFIER NOT NULL,
    [recipient] VARCHAR(254) NOT NULL,
    [status] VARCHAR(20) NOT NULL CONSTRAINT [email_jobs_status_df] DEFAULT 'PENDING',
    [attempts] INT NOT NULL CONSTRAINT [email_jobs_attempts_df] DEFAULT 0,
    [sent_at] DATETIME2,
    [created_at] DATETIME2 NOT NULL CONSTRAINT [email_jobs_created_at_df] DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT [email_jobs_pkey] PRIMARY KEY CLUSTERED ([id])
);

-- CreateIndex
CREATE NONCLUSTERED INDEX [fingerprints_employee_id_idx] ON [dbo].[fingerprints]([employee_id]);

-- CreateIndex
CREATE NONCLUSTERED INDEX [meal_requests_employee_id_idx] ON [dbo].[meal_requests]([employee_id]);

-- CreateIndex
CREATE NONCLUSTERED INDEX [meal_requests_meal_reservation_id_idx] ON [dbo].[meal_requests]([meal_reservation_id]);

-- CreateIndex
CREATE NONCLUSTERED INDEX [meal_requests_meal_date_meal_type_idx] ON [dbo].[meal_requests]([meal_date], [meal_type]);

-- CreateIndex
CREATE NONCLUSTERED INDEX [meal_reservations_meal_date_meal_type_idx] ON [dbo].[meal_reservations]([meal_date], [meal_type]);

-- CreateIndex
CREATE NONCLUSTERED INDEX [email_jobs_ticket_id_idx] ON [dbo].[email_jobs]([ticket_id]);

-- CreateIndex
CREATE NONCLUSTERED INDEX [email_jobs_status_idx] ON [dbo].[email_jobs]([status]);

-- SQL Server stores these Prisma values as VARCHAR, so the database validates
-- the allowed values explicitly.
ALTER TABLE [dbo].[meal_requests] ADD CONSTRAINT [meal_requests_meal_type_check]
CHECK ([meal_type] IN ('BREAKFAST', 'LUNCH', 'DINNER'));

ALTER TABLE [dbo].[meal_requests] ADD CONSTRAINT [meal_requests_status_check]
CHECK ([status] IN ('APPROVED', 'DUPLICATE', 'REJECTED'));

ALTER TABLE [dbo].[meal_reservations] ADD CONSTRAINT [meal_reservations_meal_type_check]
CHECK ([meal_type] IN ('BREAKFAST', 'LUNCH', 'DINNER'));

-- Every approved delivery must point to the reservation that authorized it.
ALTER TABLE [dbo].[meal_requests] ADD CONSTRAINT [meal_requests_approved_requires_reservation]
CHECK ([status] <> 'APPROVED' OR [meal_reservation_id] IS NOT NULL);

-- The filtered unique index is the final concurrency protection. DUPLICATE
-- attempts remain auditable, while two APPROVED rows are impossible.
CREATE UNIQUE NONCLUSTERED INDEX [meal_requests_one_approved_per_employee_date_type]
ON [dbo].[meal_requests]([employee_id], [meal_date], [meal_type])
WHERE [status] = 'APPROVED';

-- AddForeignKey
ALTER TABLE [dbo].[fingerprints] ADD CONSTRAINT [fingerprints_employee_id_fkey] FOREIGN KEY ([employee_id]) REFERENCES [dbo].[employees]([employee_code]) ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE [dbo].[meal_requests] ADD CONSTRAINT [meal_requests_employee_id_fkey] FOREIGN KEY ([employee_id]) REFERENCES [dbo].[employees]([employee_code]) ON DELETE NO ACTION ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE [dbo].[meal_requests] ADD CONSTRAINT [meal_requests_meal_reservation_id_fkey] FOREIGN KEY ([meal_reservation_id]) REFERENCES [dbo].[meal_reservations]([id]) ON DELETE NO ACTION ON UPDATE NO ACTION;

-- AddForeignKey
ALTER TABLE [dbo].[meal_reservations] ADD CONSTRAINT [meal_reservations_employee_id_fkey] FOREIGN KEY ([employee_id]) REFERENCES [dbo].[employees]([employee_code]) ON DELETE NO ACTION ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE [dbo].[tickets] ADD CONSTRAINT [tickets_meal_request_id_fkey] FOREIGN KEY ([meal_request_id]) REFERENCES [dbo].[meal_requests]([id]) ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE [dbo].[email_jobs] ADD CONSTRAINT [email_jobs_ticket_id_fkey] FOREIGN KEY ([ticket_id]) REFERENCES [dbo].[tickets]([id]) ON DELETE CASCADE ON UPDATE CASCADE;

COMMIT TRAN;

END TRY
BEGIN CATCH

IF @@TRANCOUNT > 0
BEGIN
    ROLLBACK TRAN;
END;
THROW

END CATCH
