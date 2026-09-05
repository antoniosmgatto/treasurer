-- D33: a group may hold several open rolês. D4 allowed exactly one, enforced here rather than by
-- convention, so the churrasco could not be organised until somebody remembered to close the
-- acampamento — a constraint defending a bank reconciliation that does not exist yet, charged
-- against the thing the club actually does.
--
-- Reversible: close every open event but one in each group and recreate the index.
DROP INDEX "event_one_open_per_group_idx";
