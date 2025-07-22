const { query, testConnection, closePool } = require('../config/database');

async function completeRefreshTokenSupport() {
  console.log('🔧 إكمال دعم Refresh Token في قاعدة البيانات...');

  try {
    const isConnected = await testConnection();
    if (!isConnected) {
      throw new Error('فشل الاتصال بقاعدة البيانات');
    }

    // إضافة عمود refresh_token إذا لم يكن موجود
    try {
      await query(`
        ALTER TABLE sessions 
        ADD COLUMN refresh_token VARCHAR(500) UNIQUE NULL AFTER token
      `);
      console.log('✅ تم إضافة عمود refresh_token');
    } catch (error) {
      if (error.code === 'ER_DUP_FIELDNAME') {
        console.log('⚠️ عمود refresh_token موجود مسبقاً');
      } else {
        throw error;
      }
    }

    // إضافة عمود refresh_expires_at
    try {
      await query(`
        ALTER TABLE sessions 
        ADD COLUMN refresh_expires_at TIMESTAMP NULL AFTER expires_at
      `);
      console.log('✅ تم إضافة عمود refresh_expires_at');
    } catch (error) {
      if (error.code === 'ER_DUP_FIELDNAME') {
        console.log('⚠️ عمود refresh_expires_at موجود مسبقاً');
      } else {
        throw error;
      }
    }

    // إضافة عمود is_single_device
    try {
      await query(`
        ALTER TABLE sessions 
        ADD COLUMN is_single_device BOOLEAN DEFAULT TRUE AFTER refresh_expires_at
      `);
      console.log('✅ تم إضافة عمود is_single_device');
    } catch (error) {
      if (error.code === 'ER_DUP_FIELDNAME') {
        console.log('⚠️ عمود is_single_device موجود مسبقاً');
      } else {
        throw error;
      }
    }

    // إضافة عمود revoked_at
    try {
      await query(`
        ALTER TABLE sessions 
        ADD COLUMN revoked_at TIMESTAMP NULL AFTER is_active
      `);
      console.log('✅ تم إضافة عمود revoked_at');
    } catch (error) {
      if (error.code === 'ER_DUP_FIELDNAME') {
        console.log('⚠️ عمود revoked_at موجود مسبقاً');
      } else {
        throw error;
      }
    }

    // إضافة الفهارس للأداء
    const indexes = [
      { name: 'idx_refresh_token', sql: 'CREATE INDEX idx_refresh_token ON sessions(refresh_token)' },
      { name: 'idx_refresh_expires', sql: 'CREATE INDEX idx_refresh_expires ON sessions(refresh_expires_at)' },
      { name: 'idx_user_active', sql: 'CREATE INDEX idx_user_active ON sessions(user_id, is_active)' },
      { name: 'idx_single_device', sql: 'CREATE INDEX idx_single_device ON sessions(is_single_device)' }
    ];

    for (const index of indexes) {
      try {
        await query(index.sql);
        console.log(`✅ تم إضافة فهرس: ${index.name}`);
      } catch (error) {
        if (error.code === 'ER_DUP_KEYNAME') {
          console.log(`⚠️ فهرس ${index.name} موجود مسبقاً`);
        } else {
          console.error(`❌ خطأ في إضافة فهرس ${index.name}:`, error.message);
        }
      }
    }

    // تحديث الجلسات الموجودة لتفعيل الجهاز الواحد
    const updated = await query(`
      UPDATE sessions 
      SET is_single_device = TRUE 
      WHERE is_single_device IS NULL
    `);

    if (updated.affectedRows > 0) {
      console.log(`✅ تم تحديث ${updated.affectedRows} جلسة لتفعيل الجهاز الواحد`);
    }

    // تنظيف الجلسات القديمة المنتهية الصلاحية
    const cleaned = await query(`
      DELETE FROM sessions 
      WHERE expires_at < NOW() 
      OR (refresh_expires_at IS NOT NULL AND refresh_expires_at < NOW())
      OR is_active = 0
    `);

    if (cleaned.affectedRows > 0) {
      console.log(`🧹 تم تنظيف ${cleaned.affectedRows} جلسة منتهية الصلاحية`);
    }

    console.log('🎉 تم إكمال دعم Refresh Token بنجاح!');

    // عرض إحصائيات محدثة
    const stats = await query(`
      SELECT 
        COUNT(*) as total_sessions,
        COUNT(CASE WHEN is_active = 1 THEN 1 END) as active_sessions,
        COUNT(CASE WHEN refresh_token IS NOT NULL THEN 1 END) as refresh_enabled_sessions,
        COUNT(CASE WHEN is_single_device = 1 THEN 1 END) as single_device_sessions,
        COUNT(DISTINCT user_id) as unique_users
      FROM sessions
    `);

    console.log('\n📊 إحصائيات الجلسات المحدثة:');
    console.log(`📱 إجمالي الجلسات: ${stats[0].total_sessions}`);
    console.log(`✅ الجلسات النشطة: ${stats[0].active_sessions}`);
    console.log(`🔄 جلسات مع Refresh Token: ${stats[0].refresh_enabled_sessions}`);
    console.log(`🔒 جلسات الجهاز الواحد: ${stats[0].single_device_sessions}`);
    console.log(`👥 المستخدمين: ${stats[0].unique_users}`);

  } catch (error) {
    console.error('❌ خطأ في إكمال دعم Refresh Token:', error.message);
    process.exit(1);
  } finally {
    await closePool();
  }
}

if (require.main === module) {
  completeRefreshTokenSupport();
}

module.exports = completeRefreshTokenSupport;