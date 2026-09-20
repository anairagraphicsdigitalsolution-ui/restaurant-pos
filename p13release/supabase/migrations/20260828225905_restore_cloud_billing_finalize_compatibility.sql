-- Cloud compatibility checkpoint.
-- The remote project already contains this compatibility state.
-- Kept as a local migration marker so fresh local resets follow the same
-- migration timeline as Cloud without re-running destructive compatibility SQL.
SELECT 1;
