const app = require('./app');
const { testConnection, closePool } = require('./config/database');

const PORT = process.env.PORT || 3000;

// بدء الخادم
async function startServer() {
  try {
    // اختبار قاعدة البيانات
    console.log('🔍 اختبار الاتصال بقاعدة البيانات...');
    const isConnected = await testConnection();
    
    if (!isConnected) {
      console.error('❌ فشل الاتصال بقاعدة البيانات');
      process.exit(1);
    }

    // بدء الخادم
    const server = app.listen(PORT, () => {
      console.log(`🚀 الخادم يعمل على المنفذ ${PORT}`);
      console.log(`🌐 الرابط: http://localhost:${PORT}`);
      console.log(`💊 فحص الصحة: http://localhost:${PORT}/health`);
      console.log(`📚 API: http://localhost:${PORT}/api`);
    });

    // معالجة الإغلاق السليم
    const gracefulShutdown = async (signal) => {
      console.log(`\n📤 تلقي إشارة ${signal}، بدء الإغلاق السليم...`);
      
      server.close(async () => {
        console.log('🔒 تم إغلاق الخادم');
        await closePool();
        process.exit(0);
      });

      // إغلاق قسري بعد 10 ثواني
      setTimeout(() => {
        console.error('⏰ إغلاق قسري بعد انتهاء المهلة');
        process.exit(1);
      }, 10000);
    };

    // معالجة إشارات الإغلاق
    process.on('SIGTERM', () => gracefulShutdown('SIGTERM'));
    process.on('SIGINT', () => gracefulShutdown('SIGINT'));

    // معالجة الأخطاء غير المعالجة
    process.on('uncaughtException', (error) => {
      console.error('❌ خطأ غير معالج:', error);
      process.exit(1);
    });

    process.on('unhandledRejection', (reason, promise) => {
      console.error('❌ Promise مرفوض غير معالج:', reason);
      process.exit(1);
    });

  } catch (error) {
    console.error('❌ خطأ في بدء الخادم:', error);
    process.exit(1);
  }
}

// بدء التطبيق
startServer();