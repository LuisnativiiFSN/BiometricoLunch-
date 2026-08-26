BEGIN TRY

BEGIN TRAN;

CREATE TABLE [dbo].[meal_order_cutoffs] (
    [id] UNIQUEIDENTIFIER NOT NULL,
    [meal_date] DATE NOT NULL,
    [cutoff_time] VARCHAR(5) NOT NULL,
    [created_at] DATETIME2 NOT NULL CONSTRAINT [meal_order_cutoffs_created_at_df] DEFAULT CURRENT_TIMESTAMP,
    [updated_at] DATETIME2 NOT NULL,
    CONSTRAINT [meal_order_cutoffs_pkey] PRIMARY KEY CLUSTERED ([id]),
    CONSTRAINT [meal_order_cutoffs_meal_date_key] UNIQUE NONCLUSTERED ([meal_date]),
    CONSTRAINT [meal_order_cutoffs_time_check] CHECK (
        [cutoff_time] LIKE '[01][0-9]:[0-5][0-9]'
        OR [cutoff_time] LIKE '2[0-3]:[0-5][0-9]'
    )
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
