const Session = require('../models/Session');
const { verifyToken, isTokenExpired } = require('../config/jwt');

// مصادقة مطلوبة
const authenticateToken = async (req, res, next) => {
  try {
    const authHeader = req.headers['authorization'];
    const token = authHeader && authHeader.split(' ')[1];

    if (!token) {
      return res.status(401).json({
        success: false,
        error: {
          code: 'TOKEN_REQUIRED',
          message: 'مطلوب توكن المصادقة'
        },
        timestamp: new Date().toISOString()
      });
    }

    // التحقق من انتهاء صلاحية التوكن
    if (isTokenExpired(token)) {
      return res.status(401).json({
        success: false,
        error: {
          code: 'TOKEN_EXPIRED',
          message: 'انتهت صلاحية التوكن'
        },
        timestamp: new Date().toISOString()
      });
    }

    // التحقق من التوكن
    const decoded = verifyToken(token);
    
    // البحث عن الجلسة في قاعدة البيانات
    const session = await Session.findByToken(token);
    if (!session) {
      return res.status(401).json({
        success: false,
        error: {
          code: 'SESSION_NOT_FOUND',
          message: 'جلسة غير صالحة'
        },
        timestamp: new Date().toISOString()
      });
    }

    // تحديث آخر استخدام
    await Session.updateLastUsed(session.id);

    // إضافة معلومات المستخدم والجلسة للطلب
    req.user = {
      id: session.user_id,
      email: session.email,
      name: session.name,
      avatar: session.avatar,
      email_verified: session.email_verified
    };
    
    req.session = session;
    
    next();
  } catch (error) {
    console.error('خطأ في المصادقة:', error);
    
    if (error.message === 'TOKEN_EXPIRED') {
      return res.status(401).json({
        success: false,
        error: {
          code: 'TOKEN_EXPIRED',
          message: 'انتهت صلاحية التوكن'
        },
        timestamp: new Date().toISOString()
      });
    }

    return res.status(401).json({
      success: false,
      error: {
        code: 'AUTHENTICATION_FAILED',
        message: 'فشل في المصادقة'
      },
      timestamp: new Date().toISOString()
    });
  }
};

// مصادقة اختيارية
const optionalAuth = async (req, res, next) => {
  try {
    const authHeader = req.headers['authorization'];
    const token = authHeader && authHeader.split(' ')[1];

    if (!token) {
      // لا يوجد توكن، متابعة بدون مستخدم
      req.user = null;
      req.session = null;
      return next();
    }

    // التحقق من انتهاء صلاحية التوكن
    if (isTokenExpired(token)) {
      req.user = null;
      req.session = null;
      return next();
    }

    // محاولة التحقق من التوكن
    const decoded = verifyToken(token);
    
    // البحث عن الجلسة في قاعدة البيانات
    const session = await Session.findByToken(token);
    if (!session) {
      req.user = null;
      req.session = null;
      return next();
    }

    // تحديث آخر استخدام
    await Session.updateLastUsed(session.id);

    // إضافة معلومات المستخدم والجلسة للطلب
    req.user = {
      id: session.user_id,
      email: session.email,
      name: session.name,
      avatar: session.avatar,
      email_verified: session.email_verified
    };
    
    req.session = session;
    
    next();
  } catch (error) {
    // في حالة الخطأ، متابعة بدون مستخدم
    console.log('⚠️ خطأ في المصادقة الاختيارية:', error.message);
    req.user = null;
    req.session = null;
    next();
  }
};

module.exports = {
  authenticateToken,
  optionalAuth
};
