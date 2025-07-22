-- إضافة عمود refresh_token و refresh_expires_at إلى جدول sessions
ALTER TABLE sessions 
ADD COLUMN refresh_token VARCHAR(500) UNIQUE NULL AFTER token,
ADD COLUMN refresh_expires_at TIMESTAMP NULL AFTER expires_at,
ADD INDEX idx_refresh_token (refresh_token),
ADD INDEX idx_refresh_expires (refresh_expires_at);