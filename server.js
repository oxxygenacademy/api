const express = require('express');
const cors = require('cors');
const helmet = require('helmet');
const rateLimit = require('express-rate-limit');
require('dotenv').config();

const { testConnection } = require('./config/database');
const errorHandler = require('./middleware/errorHandler');

// استيراد المسارات
const authRoutes = require('./routes/auth');
const coursesRoutes = require('./routes/courses');
const lessonsRoutes = require('./routes/lessons');
const progressRoutes = require('./routes/progress');
const userRoutes = require('./routes/user');
const statsRoutes = require('./routes/stats');

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
app.use(express.json({ limit: '50mb' }));
app.use(express.urlencoded({ extended: true, limit: '50mb' }));

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
        'Certificates',
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
        lessons: '/api/lessons',
        progress: '/api/progress',
        user: '/api/user',
        stats: '/api/stats'
      },
      features: [
        'JWT Authentication',
        'Refresh Token',
        'Single Device Login',
        'Progress Tracking',
        'Arabic Localization'
      ]
    },
    message: 'معلومات API'
  });
});

// المسارات
app.use('/api/auth', authRoutes);
app.use('/api/courses', coursesRoutes);
app.use('/api/lessons', lessonsRoutes);
app.use('/api/progress', progressRoutes);
app.use('/api/user', userRoutes);
app.use('/api/stats', statsRoutes);

// معالج الأخطاء (يجب أن يكون في النهاية)
app.use(errorHandler);

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
    const dbConnected = await testConnection();
    
    if (dbConnected) {
      console.log('✅ تم الاتصال بقاعدة البيانات بنجاح');
      
      app.listen(PORT, () => {
        console.log(`🚀 الخادم يعمل على المنفذ: ${PORT}`);
        console.log(`🌐 الرابط: http://localhost:${PORT}`);
        console.log(`📚 API: http://localhost:${PORT}/api`);
      });
    } else {
      console.error('❌ فشل الاتصال بقاعدة البيانات');
      process.exit(1);
    }
  } catch (error) {
    console.error('❌ فشل بدء الخادم:', error);
    process.exit(1);
  }
};

startServer();

module.exports = app;
