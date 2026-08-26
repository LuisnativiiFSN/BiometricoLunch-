IF EXISTS (
    SELECT 1
    FROM [sys].[check_constraints]
    WHERE [name] = N'audit_logs_action_check'
      AND [parent_object_id] = OBJECT_ID(N'[dbo].[audit_logs]')
)
BEGIN
    ALTER TABLE [dbo].[audit_logs]
    DROP CONSTRAINT [audit_logs_action_check];
END;

ALTER TABLE [dbo].[audit_logs]
ADD CONSTRAINT [audit_logs_action_check]
CHECK ([action] IN ('CREATE', 'UPDATE', 'DELETE', 'TRANSFER'));
