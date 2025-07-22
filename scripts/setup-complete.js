const setupDatabase = require('./setup-database');
const seedDatabase = require('./seed-database-updated');
const { testConnection, closePool, query } = require('../config/database');

async function setupComplete() {
  console.log('🚀 بدء الإعداد الشامل للنظام...\n');

  try {
    // 1. إعداد قاعدة البيانات
    console.log('1️⃣ إعداد قاعدة البيانات...');
    await setupDatabase();
    console.log('✅ تم إعداد قاعدة البيانات بنجاح\n');

    // انتظار قصير للتأكد من إنشاء الجداول
    await new Promise(resolve => setTimeout(resolve, 1000));

    // 2. إدراج البيانات التجريبية
    console.log('2️⃣ إدراج البيانات التجريبية...');
    await seedDatabase();
    console.log('✅ تم إدراج البيانات التجريبية بنجاح\n');

    // 3. التحقق من التوصيلات
    console.log('3️⃣ التحقق من التوصيلات...');
    const isConnected = await testConnection();
    if (!isConnected) {
      throw new Error('فشل في التحقق من الاتصال');
    }
    console.log('✅ التوصيلات تعمل بشكل صحيح\n');

    // 4. عرض الملخص النهائي
    console.log('📊 ملخص الإعداد:');
    
    const stats = await Promise.all([
      query('SELECT COUNT(*) as count FROM users'),
      query('SELECT COUNT(*) as count FROM course_categories'),
      query('SELECT COUNT(*) as count FROM courses'),
      query('SELECT COUNT(*) as count FROM course_sections'),
      query('SELECT COUNT(*) as count FROM lessons'),
      query('SELECT COUNT(*) as count FROM enrollments')
    ]);

    console.log(`👥 المستخدمين: ${stats[0][0].count}`);
    console.log(`📁 أقسام الكورسات: ${stats[1][0].count}`);
    console.log(`📚 الكورسات: ${stats[2][0].count}`);
    console.log(`📖 فصول الكورسات: ${stats[3][0].count}`);
    console.log(`🎥 الدروس: ${stats[4][0].count}`);
    console.log(`📝 الاشتراكات: ${stats[5][0].count}`);

    console.log('\n🎉 تم إكمال الإعداد بنجاح!');
    console.log('\n📝 معلومات تسجيل الدخول التجريبية:');
    console.log('البريد الإلكتروني: oxxygenacademy@test.com');
    console.log('كلمة المرور: 123456');
    
    console.log('\n🌐 مسارات النظام:');
    console.log('🏠 الصفحة الرئيسية: http://localhost:3000/');
    console.log('💊 فحص الصحة: http://localhost:3000/health');
    console.log('📚 معلومات API: http://localhost:3000/api');
    
    console.log('\n🚀 يمكنك الآن تشغيل الخادم باستخدام: npm run dev');

  } catch (error) {
    console.error('❌ خطأ في الإعداد الشامل:', error.message);
    console.error('تفاصيل الخطأ:', error);
    process.exit(1);
  } finally {
    await closePool();
  }
}

// تشغيل الإعداد الشامل
if (require.main === module) {
  setupComplete();
}

module.exports = setupComplete;