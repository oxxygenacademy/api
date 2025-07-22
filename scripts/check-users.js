const { query, testConnection, closePool } = require('../config/database');

async function checkUsers() {
  console.log('🔍 فحص المستخدمين الموجودين في قاعدة البيانات...');

  try {
    const isConnected = await testConnection();
    if (!isConnected) {
      throw new Error('فشل الاتصال بقاعدة البيانات');
    }

    // جلب جميع المستخدمين
    const users = await query('SELECT id, email, name, created_at, is_active FROM users');
    
    console.log(`\n📊 إجمالي المستخدمين: ${users.length}`);
    
    if (users.length > 0) {
      console.log('\n👥 قائمة المستخدمين:');
      users.forEach((user, index) => {
        console.log(`${index + 1}. ${user.email} - ${user.name} (ID: ${user.id}) - ${user.is_active ? 'نشط' : 'غير نشط'}`);
      });
      
      console.log('\n✅ يمكنك استخدام أحد هذه البرائد الإلكترونية للدخول');
      console.log('🔑 كلمة المرور الافتراضية: 123456');
      
      // اختبار تسجيل الدخول
      console.log('\n📝 مثال على تسجيل الدخول:');
      console.log(`curl -X POST http://localhost:3000/api/auth/login \\`);
      console.log(`  -H "Content-Type: application/json" \\`);
      console.log(`  -d '{"email":"${users[0].email}","password":"123456"}'`);
      
    } else {
      console.log('\n❌ لا توجد مستخدمين في قاعدة البيانات!');
      console.log('🛠️ تشغيل: npm run seed-db لإضافة بيانات تجريبية');
    }

    // فحص الجلسات
    const sessions = await query('SELECT COUNT(*) as count FROM sessions WHERE is_active = 1');
    console.log(`\n📱 الجلسات النشطة: ${sessions[0].count}`);

  } catch (error) {
    console.error('❌ خطأ في فحص المستخدمين:', error.message);
  } finally {
    await closePool();
  }
}

if (require.main === module) {
  checkUsers();
}

module.exports = checkUsers;