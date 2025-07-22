const { query, testConnection, closePool } = require('../config/database');

async function cleanDatabase() {
  console.log('🧹 بدء تنظيف قاعدة البيانات...');

  try {
    const isConnected = await testConnection();
    if (!isConnected) {
      throw new Error('فشل الاتصال بقاعدة البيانات');
    }

    // تعطيل فحص Foreign Keys مؤقتاً
    await query('SET FOREIGN_KEY_CHECKS = 0');

    // قائمة الجداول بالترتيب العكسي للحذف
    const tables = [
      'user_favorites',
      'course_progress', 
      'lesson_progress',
      'sessions',
      'enrollments',
      'lessons',
      'course_sections',
      'courses',
      'course_categories',
      'users'
    ];

    console.log('🗑️ حذف الجداول...');
    for (const table of tables) {
      try {
        await query(`DROP TABLE IF EXISTS ${table}`);
        console.log(`✅ تم حذف جدول: ${table}`);
      } catch (error) {
        console.log(`⚠️ خطأ في حذف جدول ${table}:`, error.message);
      }
    }

    // إعادة تفعيل فحص Foreign Keys
    await query('SET FOREIGN_KEY_CHECKS = 1');

    console.log('🎉 تم تنظيف قاعدة البيانات بنجاح!');
    console.log('💡 يمكنك الآن تشغيل: npm run setup-complete');

  } catch (error) {
    console.error('❌ خطأ في تنظيف قاعدة البيانات:', error.message);
    process.exit(1);
  } finally {
    await closePool();
  }
}

if (require.main === module) {
  cleanDatabase();
}

module.exports = cleanDatabase;