const express = require('express');
const cors = require('cors');
const helmet = require('helmet');
const rateLimit = require('express-rate-limit');
require('dotenv').config();

const { testConnection } = require('./config/database');

const app = express();

// الأمان
app.use(helmet());

// CORS
app.use(cors({
  origin: process.env.FRONTEND_URL || 'http://localhost:3000',
  credentials: true
}));

// Rate Limiting
const limiter = rateLimit({
  windowMs: (process.env.RATE_LIMIT_WINDOW || 15) * 60 * 1000,
  max: process.env.RATE_LIMIT_MAX || 100,
  message: {
    success: false,
    error: {
      code: 'RATE_LIMIT_EXCEEDED',
      message: 'تم تجاوز الحد المسموح من الطلبات'
    }
  },
  standardHeaders: true,
  legacyHeaders: false
});

app.use('/api/', limiter);

// تحليل JSON
app.use(express.json({ limit: '10mb' }));
app.use(express.urlencoded({ extended: true, limit: '10mb' }));

// مسار الصحة
app.get('/health', async (req, res) => {
  try {
    const dbStatus = await testConnection();
    res.json({
      status: 'OK',
      timestamp: new Date().toISOString(),
      database: dbStatus ? 'متصل' : 'غير متصل',
      version: '1.0.0',
      uptime: process.uptime(),
      memory: process.memoryUsage(),
      environment: process.env.NODE_ENV || 'development'
    });
  } catch (error) {
    res.status(500).json({
      status: 'ERROR',
      timestamp: new Date().toISOString(),
      database: 'خطأ في الاتصال',
      error: error.message
    });
  }
});

// مسار الترحيب
app.get('/', (req, res) => {
  res.json({
    message: 'مرحباً بك في نظام إدارة الكورسات',
    version: '1.0.0',
    timestamp: new Date().toISOString(),
    api_docs: '/api/docs',
    endpoints: {
      health: '/health',
      auth: '/api/auth',
      courses: '/api/courses',
      lessons: '/api/lessons',
      progress: '/api/progress',
      stats: '/api/stats',
      user: '/api/user'
    }
  });
});

// مسار معلومات API
app.get('/api', (req, res) => {
  res.json({
    name: 'Courses Management API',
    version: '1.0.0',
    description: 'نظام إدارة الكورسات التعليمية',
    timestamp: new Date().toISOString(),
    endpoints: {
      authentication: {
        register: 'POST /api/auth/register',
        login: 'POST /api/auth/login',
        logout: 'POST /api/auth/logout',
        me: 'GET /api/auth/me',
        refresh: 'POST /api/auth/refresh'
      },
      courses: {
        list: 'GET /api/courses',
        details: 'GET /api/courses/:id',
        search: 'GET /api/courses/search',
        featured: 'GET /api/courses/featured',
        categories: 'GET /api/courses/categories',
        enroll: 'POST /api/courses/:id/enroll',
        unenroll: 'DELETE /api/courses/:id/enroll'
      },
      lessons: {
        course_lessons: 'GET /api/lessons/course/:courseId',
        lesson_details: 'GET /api/lessons/:id',
        watch: 'POST /api/lessons/:id/watch',
        progress: 'PUT /api/lessons/:id/progress',
        complete: 'POST /api/lessons/:id/complete'
      },
      progress: {
        course_progress: 'GET /api/progress/course/:courseId',
        user_stats: 'GET /api/progress/stats',
        dashboard: 'GET /api/progress/dashboard'
      },
      user: {
        profile: 'GET /api/user/profile',
        my_courses: 'GET /api/user/my-courses',
        achievements: 'GET /api/user/achievements',
        update_profile: 'PUT /api/user/profile'
      },
      stats: {
        platform: 'GET /api/stats/platform',
        user: 'GET /api/stats/user',
        course_analytics: 'GET /api/stats/course/:courseId/analytics'
      }
    }
  });
});

// Routes - المسارات الرئيسية
app.use('/api/auth', require('./routes/auth'));
app.use('/api/courses', require('./routes/courses'));
app.use('/api/lessons', require('./routes/lessons'));
app.use('/api/progress', require('./routes/progress'));
app.use('/api/user', require('./routes/user'));
app.use('/api/stats', require('./routes/stats'));

// معالج الأخطاء 404
app.use('*', (req, res) => {
  res.status(404).json({
    success: false,
    error: {
      code: 'NOT_FOUND',
      message: 'المسار غير موجود',
      path: req.originalUrl,
      method: req.method
    },
    timestamp: new Date().toISOString(),
    available_endpoints: '/api'
  });
});

// معالج الأخطاء العام
app.use((error, req, res, next) => {
  console.error('خطأ غير متوقع:', error);
  
  res.status(500).json({
    success: false,
    error: {
      code: 'INTERNAL_SERVER_ERROR',
      message: 'حدث خطأ داخلي في الخادم',
      ...(process.env.NODE_ENV === 'development' && { details: error.message })
    },
    timestamp: new Date().toISOString()
  });
});

module.exports = app;