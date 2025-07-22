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
const userRoutes = require('./routes/user');
const progressRoutes = require('./routes/progress');

const app = express();
const PORT = process.env.PORT || 3000;

// إعداد trust proxy (مهم لـ Render و Heroku)
app.set('trust proxy', 1);

// الأمان
app.use(helmet());

// CORS
app.use(cors({
  origin: process.env.FRONTEND_URL || '*',
  credentials: true
}));

// Rate limiting (محسّن لـ production)
const limiter = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 دقيقة
  max: (req) => {
    // حدود مختلفة بناءً على المسار
    if (req.path.startsWith('/api/auth/login')) {
      return 5; // 5 محاولات تسجيل دخول كل 15 دقيقة
    }
    if (req.path.startsWith('/api/auth')) {
      return 10; // 10 طلبات مصادقة كل 15 دقيقة
    }
    return 100; // 100 طلب عام كل 15 دقيقة
  },
  standardHeaders: true,
  legacyHeaders: false,
  keyGenerator: (req) => {
    // استخدام IP من headers المختلفة
    return req.ip || 
           req.headers['x-forwarded-for']?.split(',')[0] || 
           req.headers['x-real-ip'] || 
           req.connection.remoteAddress || 
           'unknown';
  },
  message: (req) => ({
    success: false,
    error: {
      code: 'RATE_LIMIT_EXCEEDED',
      message: 'تجاوزت الحد المسموح من الطلبات. يرجى المحاولة بعد قليل.',
      retryAfter: Math.ceil(req.rateLimit.resetTime / 1000)
    },
    timestamp: new Date().toISOString()
  }),
  skip: (req) => {
    // تخطي rate limiting للصفحات الأساسية
    return req.path === '/' || req.path === '/health' || req.path === '/api';
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
        'User Management',
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
        version: '1.0.0',
        uptime: process.uptime(),
        memory: process.memoryUsage()
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
        user: '/api/user',
        progress: '/api/progress'
      },
      features: [
        'JWT Authentication',
        'Refresh Token',
        'Single Device Login',
        'Progress Tracking',
        'User Management'
      ],
      rate_limits: {
        general: '100 requests per 15 minutes',
        auth: '10 requests per 15 minutes',
        login: '5 attempts per 15 minutes'
      }
    },
    message: 'معلومات API'
  });
});

// المسارات
app.use('/api/auth', authRoutes);
app.use('/api/courses', coursesRoutes);
app.use('/api/lessons', lessonsRoutes);
app.use('/api/user', userRoutes);
app.use('/api/progress', progressRoutes);

// معالج الأخطاء العام
app.use((error, req, res, next) => {
  console.error('❌ خطأ في النظام:', {
    message: error.message,
    code: error.code,
    url: req.url,
    method: req.method,
    ip: req.ip,
    timestamp: new Date().toISOString()
  });

  // أخطاء rate limiting
  if (error.code === 'ERR_ERL_UNEXPECTED_X_FORWARDED_FOR') {
    console.log('⚠️ تحذير rate limiting - تم تجاهله');
    return next();
  }

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
      
      case 'ER_BAD_FIELD_ERROR':
        return res.status(500).json({
          success: false,
          error: {
            code: 'DATABASE_FIELD_ERROR',
            message: 'خطأ في بنية قاعدة البيانات'
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
        console.log(`🛡️ Trust Proxy: ${app.get('trust proxy')}`);
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
