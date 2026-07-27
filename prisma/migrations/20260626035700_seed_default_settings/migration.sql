-- Seed default settings (only insert if not already present)
INSERT INTO "SystemSetting" ("key", "value", "type", "description", "updatedAt")
SELECT * FROM (VALUES
  ('platform_name', 'LMS Platform', 'STRING', 'Display name of the platform', NOW()),
  ('platform_logo', '', 'STRING', 'URL of the platform logo', NOW()),
  ('contact_email', 'admin@example.com', 'STRING', 'Public contact email address', NOW()),
  ('maintenance_mode', 'false', 'BOOLEAN', 'Enable maintenance mode', NOW()),

  ('jwt_lifetime_minutes', '15', 'INTEGER', 'Access token expiry in minutes', NOW()),
  ('refresh_lifetime_days', '7', 'INTEGER', 'Refresh token expiry in days', NOW()),
  ('password_min_length', '8', 'INTEGER', 'Minimum password length', NOW()),
  ('password_require_special', 'true', 'BOOLEAN', 'Require special characters in passwords', NOW()),

  ('max_upload_size_mb', '50', 'INTEGER', 'Maximum file upload size in MB', NOW()),
  ('allowed_file_types', '["jpg","jpeg","png","pdf","mp4","webp"]', 'JSON', 'Comma-separated list of allowed file extensions', NOW()),

  ('default_max_attempts', '1', 'INTEGER', 'Default maximum quiz attempts', NOW()),
  ('default_pass_grade', '50', 'INTEGER', 'Default passing grade percentage', NOW()),

  ('default_duration_minutes', '30', 'INTEGER', 'Default lecture duration in minutes', NOW()),

  ('enable_ai', 'true', 'BOOLEAN', 'Enable AI-powered features', NOW()),
  ('enable_notifications', 'true', 'BOOLEAN', 'Enable notification delivery', NOW()),
  ('enable_certificates', 'true', 'BOOLEAN', 'Enable certificate generation', NOW()),
  ('allow_registration', 'true', 'BOOLEAN', 'Allow new user registration', NOW())
) AS s("key", "value", "type", "description", "updatedAt")
WHERE NOT EXISTS (SELECT 1 FROM "SystemSetting" t WHERE t."key" = s."key");
