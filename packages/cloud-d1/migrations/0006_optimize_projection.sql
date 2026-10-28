CREATE INDEX IF NOT EXISTS usage_daily_current_quarantine_expires_bucket_idx
  ON usage_daily_current(quarantine_status, expires_at, bucket_start);
