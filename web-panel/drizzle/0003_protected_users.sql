ALTER TABLE users
ADD COLUMN IF NOT EXISTS is_protected boolean NOT NULL DEFAULT false;
