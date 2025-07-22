const express = require('express');
const cors = require('cors');
const helmet = require('helmet');
const rateLimit = require('express-rate-limit');
require('dotenv').config();

const { testConnection } = require('./config/database');

// استيراد المسارات
const authRoutes = require('./routes/auth');
const coursesRoutes = require('./routes/courses');
const lessonsRoutes = require('./routes/lessons');

const app = express();
const PORT = process.env.PORT || 3000;

// الأمان
app.use(helmet());

// CORS
app.use(cors({
  origin: process.env.FRONTEND_URL || '*',
  credentials: true
}));

// Rate limiting
const limiter = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 دقيقة
  max: 100, // 100 طلب
  message: { 
    success: false, 
    error: {
      code: 'RATE_LIMIT_EXCEEDED',
      message: 'تجاوزت الحد المسموح من الطلبات'
    }
  }
});
app.use('/api', limiter);

// معالجة JSON
app.use(express.json({ limit: '10mb' }));
app.use(express.urlencoded({ extended: true, limit: '10mb' }));

// الصفحة الرئيسية
app.get('/', (req, res) => {
  res.json({
    success: true,
    data: {
      platform: 'Courses Management System',
      version: '1.0.0',
      status: 'active',
      timestamp: new Date().toISOString(),
      features: [
        'Single Device Login',
        'Refresh Token System', 
        'Progress Tracking',
        'Arabic Support'
      ]
    },
    message: 'مرحباً بك في نظام إدارة الكورسات'
  });
});

// فحص صحة النظام
app.get('/health', async (req, res) => {
  try {
    const dbStatus = await testConnection();
    res.json({
      success: true,
      data: {
        status: 'healthy',
        timestamp: new Date().toISOString(),
        database: dbStatus ? 'connected' : 'disconnected',
        version: '1.0.0'
      },
      message: 'النظام يعمل بشكل طبيعي'
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      error: {
        code: 'HEALTH_CHECK_FAILED',
        message: 'فشل فحص صحة النظام'
      }
    });
  }
});

// معلومات API
app.get('/api', (req, res) => {
  res.json({
    success: true,
    data: {
      api_name: 'Courses Management API',
      version: 'v1.0.0',
      endpoints: {
        authentication: '/api/auth',
        courses: '/api/courses', 
        lessons: '/api/lessons'
      },
      features: [
        'JWT Authentication',
        'Refresh Token',
        'Single Device Login',
        'Progress Tracking'
      ]
    },
    message: 'معلومات API'
  });
});

// المسارات الأساسية
app.use('/api/auth', authRoutes);
app.use('/api/courses', coursesRoutes);
app.use('/api/lessons', lessonsRoutes);

// معالج الأخطاء العام
app.use((error, req, res, next) => {
  console.error('❌ خطأ في النظام:', {
    message: error.message,
    url: req.url,
    method: req.method,
    timestamp: new Date().toISOString()
  });

  // أخطاء قاعدة البيانات
  if (error.code) {
    switch (error.code) {
      case 'ER_SUBQUERY_NO_1_ROW':
        return res.status(500).json({
          success: false,
          error: {
            code: 'DATABASE_SUBQUERY_ERROR',
            message: 'خطأ في استعلام قاعدة البيانات'
          },
          timestamp: new Date().toISOString()
        });
      
      default:
        return res.status(500).json({
          success: false,
          error: {
            code: 'DATABASE_ERROR',
            message: 'خطأ في قاعدة البيانات'
          },
          timestamp: new Date().toISOString()
        });
    }
  }

  // خطأ عام
  return res.status(500).json({
    success: false,
    error: {
      code: 'INTERNAL_SERVER_ERROR',
      message: 'حدث خطأ داخلي في الخادم'
    },
    timestamp: new Date().toISOString()
  });
});

// معالج 404
app.use('*', (req, res) => {
  res.status(404).json({
    success: false,
    error: {
      code: 'ENDPOINT_NOT_FOUND',
      message: 'المسار غير موجود'
    },
    timestamp: new Date().toISOString()
  });
});

// بدء الخادم
const startServer = async () => {
  try {
    console.log('🚀 بدء تشغيل الخادم...');
    
    const dbConnected = await testConnection();
    
    if (dbConnected) {
      console.log('✅ تم الاتصال بقاعدة البيانات بنجاح');
      
      app.listen(PORT, () => {
        console.log(`🌐 الخادم يعمل على المنفذ: ${PORT}`);
        console.log(`🔗 الرابط: http://localhost:${PORT}`);
        console.log(`📚 API: http://localhost:${PORT}/api`);
        console.log('✅ النظام جاهز للاستخدام');
      });
    } else {
      console.error('❌ فشل الاتصال بقاعدة البيانات');
      process.exit(1);
    }
  } catch (error) {
    console.error('❌ فشل بدء الخادم:', error.message);
    process.exit(1);
  }
};

startServer();

module.exports = app;
