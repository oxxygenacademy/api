const { query, testConnection, closePool } = require('../config/database');

async function updateSessionsTable() {
  console.log('🔄 تحديث جدول الجلسات لدعم Refresh Tokens...');

  try {
    const isConnected = await testConnection();
    if (!isConnected) {
      throw new Error('فشل الاتصال بقاعدة البيانات');
    }

    // إضافة الأعمدة الجديدة
    try {
      await query(`
        ALTER TABLE sessions 
        ADD COLUMN refresh_token VARCHAR(500) UNIQUE NULL AFTER token
      `);
      console.log('✅ تم إضافة عمود refresh_token');
    } catch (error) {
      if (error.code === 'ER_DUP_FIELDNAME') {
        console.log('⚠️  عمود refresh_token موجود مسبقاً');
      } else {
        throw error;
      }
    }

    try {
      await query(`
        ALTER TABLE sessions 
        ADD COLUMN refresh_expires_at TIMESTAMP NULL AFTER expires_at
      `);
      console.log('✅ تم إضافة عمود refresh_expires_at');
    } catch (error) {
      if (error.code === 'ER_DUP_FIELDNAME') {
        console.log('⚠️  عمود refresh_expires_at موجود مسبقاً');
      } else {
        throw error;
      }
    }

    // إضافة الفهارس
    try {
      await query('CREATE INDEX idx_refresh_token ON sessions(refresh_token)');
      console.log('✅ تم إضافة فهرس refresh_token');
    } catch (error) {
      if (error.code === 'ER_DUP_KEYNAME') {
        console.log('⚠️  فهرس refresh_token موجود مسبقاً');
      } else {
        throw error;
      }
    }

    try {
      await query('CREATE INDEX idx_refresh_expires ON sessions(refresh_expires_at)');
      console.log('✅ تم إضافة فهرس refresh_expires_at');
    } catch (error) {
      if (error.code === 'ER_DUP_KEYNAME') {
        console.log('⚠️  فهرس refresh_expires_at موجود مسبقاً');
      } else {
        throw error;
      }
    }

    console.log('🎉 تم تحديث جدول الجلسات بنجاح!');

  } catch (error) {
    console.error('❌ خطأ في تحديث جدول الجلسات:', error.message);
    process.exit(1);
  } finally {
    await closePool();
  }
}

if (require.main === module) {
  updateSessionsTable();
}

module.exports = updateSessionsTable;