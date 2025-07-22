const { query, testConnection, closePool } = require('../config/database');

async function addSingleDeviceSupport() {
  console.log('🔧 إضافة دعم الجهاز الواحد لجدول الجلسات...');

  try {
    const isConnected = await testConnection();
    if (!isConnected) {
      throw new Error('فشل الاتصال بقاعدة البيانات');
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

    // إضافة فهرس للبحث السريع
    try {
      await query('CREATE INDEX idx_user_active ON sessions(user_id, is_active)');
      console.log('✅ تم إضافة فهرس idx_user_active');
    } catch (error) {
      if (error.code === 'ER_DUP_KEYNAME') {
        console.log('⚠️ فهرس idx_user_active موجود مسبقاً');
      } else {
        throw error;
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

    console.log('🎉 تم إضافة دعم الجهاز الواحد بنجاح!');

    // عرض إحصائيات
    const stats = await query(`
      SELECT 
        COUNT(*) as total_sessions,
        COUNT(CASE WHEN is_active = 1 THEN 1 END) as active_sessions,
        COUNT(CASE WHEN is_single_device = 1 THEN 1 END) as single_device_sessions,
        COUNT(DISTINCT user_id) as unique_users
      FROM sessions
    `);

    console.log('\n📊 إحصائيات الجلسات:');
    console.log(`📱 إجمالي الجلسات: ${stats[0].total_sessions}`);
    console.log(`✅ الجلسات النشطة: ${stats[0].active_sessions}`);
    console.log(`🔒 جلسات الجهاز الواحد: ${stats[0].single_device_sessions}`);
    console.log(`👥 المستخدمين: ${stats[0].unique_users}`);

  } catch (error) {
    console.error('❌ خطأ في إضافة دعم الجهاز الواحد:', error.message);
    process.exit(1);
  } finally {
    await closePool();
  }
}

if (require.main === module) {
  addSingleDeviceSupport();
}

module.exports = addSingleDeviceSupport;