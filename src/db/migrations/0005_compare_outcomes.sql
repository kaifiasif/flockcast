-- Drafts compared on one crowd share a group (labelled A, B, C); authors can record what really happened.
ALTER TABLE rehearsals ADD COLUMN group_id TEXT;
ALTER TABLE rehearsals ADD COLUMN variant TEXT CHECK (variant IS NULL OR variant IN ('A', 'B', 'C'));
ALTER TABLE rehearsals ADD COLUMN outcome_json TEXT CHECK (outcome_json IS NULL OR json_valid(outcome_json));
CREATE INDEX rehearsals_scope_group ON rehearsals (scope, group_id);
