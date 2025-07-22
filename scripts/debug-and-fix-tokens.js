'use strict';

const { query, testConnection, closePool } = require('../config/database');

async function debugAndFixTokens() {
  console.log('🔍 فحص وإصلاح نظام التوكن...');

  try {
    const isConnected = await testConnection();
    if (!isConnected) {
      throw new Error('فشل الاتصال بقاعدة البيانات');
    }

    // اختبار تحميل JWT config
    console.log('\n1️⃣ اختبار تحميل JWT config...');
    const jwtConfig = require('../config/jwt');
    console.log('✅ JWT config محمّل بنجاح');
    console.log('📦 الدوال المتاحة:', Object.keys(jwtConfig));

    // اختبار generateTokenPair
    if (typeof jwtConfig.generateTokenPair === 'function') {
      console.log('🧪 اختبار generateTokenPair...');
      const testTokens = jwtConfig.generateTokenPair({ userId: 999, test: true });
      console.log('✅ generateTokenPair تعمل بشكل صحيح:', {
        hasAccessToken: !!testTokens.access_token,
        hasRefreshToken: !!testTokens.refresh_token,
        expiresIn: testTokens.expires_in
      });
    } else {
      console.error('❌ generateTokenPair غير متوفرة');
      return;
    }

    // فحص Session model
    console.log('\n2️⃣ فحص Session model...');
    const Session = require('../models/Session');
    console.log('✅ Session model محمّل بنجاح');

    const debugInfo = await Session.debugTokenSystem();
    console.log('🔍 نتائج فحص النظام:', debugInfo);

    // تحديث قاعدة البيانات إذا لزم الأمر
    if (!debugInfo?.hasRefreshToken) {
      console.log('\n3️⃣ إضافة أعمدة Refresh Token...');
      
      try {
        await query(`ALTER TABLE sessions ADD COLUMN refresh_token VARCHAR(500) UNIQUE NULL AFTER token`);
        console.log('✅ تم إضافة عمود refresh_token');
      } catch (error) {
        if (error.code !== 'ER_DUP_FIELDNAME') throw error;
        console.log('⚠️ عمود refresh_token موجود مسبقاً');
      }

      try {
        await query(`ALTER TABLE sessions ADD COLUMN refresh_expires_at TIMESTAMP NULL AFTER expires_at`);
        console.log('✅ تم إضافة عمود refresh_expires_at');
      } catch (error) {
        if (error.code !== 'ER_DUP_FIELDNAME') throw error;
        console.log('⚠️ عمود refresh_expires_at موجود مسبقاً');
      }
    }

    // مسح الجلسات القديمة
    console.log('\n4️⃣ مسح الجلسات القديمة...');
    const cleaned = await query('UPDATE sessions SET is_active = 0 WHERE expires_at < NOW()');
    console.log(`🧹 تم إنهاء ${cleaned.affectedRows} جلسة منتهية الصلاحية`);

    // اختبار إنشاء جلسة جديدة
    console.log('\n5️⃣ اختبار إنشاء جلسة تجريبية...');
    try {
      const testSession = await Session.create(1, {
        ip_address: '127.0.0.1',
        user_agent: 'test-script',
        device_name: 'اختبار النظام'
      });
      
      console.log('✅ تم إنشاء جلسة تجريبية:', {
        id: testSession.id,
        hasRefreshToken: !!testSession.refresh_token,
        expiresIn: testSession.expires_in
      });

      // مسح الجلسة التجريبية
      await query('DELETE FROM sessions WHERE id = ?', [testSession.id]);
      console.log('🧹 تم مسح الجلسة التجريبية');
      
    } catch (testError) {
      console.error('❌ فشل اختبار الجلسة:', testError.message);
    }

    console.log('\n🎉 تم فحص وإصلاح النظام بنجاح!');

  } catch (error) {
    console.error('❌ خطأ في فحص وإصلاح النظام:', error.message);
    process.exit(1);
  } finally {
    await closePool();
  }
}

if (require.main === module) {
  debugAndFixTokens();
}

module.exports = debugAndFixTokens;