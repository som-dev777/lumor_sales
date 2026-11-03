-- No approvals (D-043, D-045): the seeded draft plans become ordinary Official plans, without
-- "(draft)" in their names. Old proposal rows stay as history.
UPDATE `plan` SET `type` = 'Official', `proposal_status` = 'None', `name` = replace(`name`, ' (draft)', '') WHERE `proposal_status` = 'Proposed';
