// اختبار بسيط لفحص النظام
'use strict';

console.log('🔍 اختبار بسيط للنظام...');

try {
  // اختبار تحميل الوحدات
  console.log('📥 تحميل الوحدات...');
  
  const jwt = require('jsonwebtoken');
  console.log('✅ jwt محمّل بنجاح');
  
  const jwtConfig = require('../config/jwt');
  console.log('✅ jwt config محمّل بنجاح');
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
  }
  
  // اختبار قاعدة البيانات
  console.log('🗄️ اختبار قاعدة البيانات...');
  const { testConnection } = require('../config/database');
  
  testConnection().then(isConnected => {
    if (isConnected) {
      console.log('✅ قاعدة البيانات متصلة بنجاح');
      
      // اختبار Session
      console.log('📱 اختبار Session...');
      const Session = require('../models/Session');
      console.log('✅ Session model محمّل بنجاح');
      
      // فحص النظام
      Session.debugTokenSystem().then(debugInfo => {
        console.log('🔍 نتائج فحص النظام:', debugInfo);
        console.log('🎉 اكتمل الاختبار بنجاح!');
        process.exit(0);
      }).catch(debugError => {
        console.error('❌ خطأ في فحص النظام:', debugError);
        process.exit(1);
      });
      
    } else {
      console.error('❌ فشل الاتصال بقاعدة البيانات');
      process.exit(1);
    }
  }).catch(dbError => {
    console.error('❌ خطأ في قاعدة البيانات:', dbError);
    process.exit(1);
  });
  
} catch (error) {
  console.error('❌ خطأ في النظام:', error);
  process.exit(1);
}