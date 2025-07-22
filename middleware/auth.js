const { verifyToken, verifyAccessToken, isTokenExpired } = require('../config/jwt');
const Session = require('../models/Session');
const { sendUnauthorized } = require('../utils/response');

// المصادقة الإجبارية (دعم النظام القديم والجديد)
const authenticateToken = async (req, res, next) => {
  try {
    const authHeader = req.headers['authorization'];
    const token = authHeader && authHeader.split(' ')[1]; // Bearer TOKEN

    if (!token) {
      return sendUnauthorized(res, 'مطلوب توكن المصادقة');
    }

    // محاولة استخدام النظام الجديد أولاً
    let decoded;
    let isExpired = false;
    
    try {
      decoded = verifyAccessToken ? verifyAccessToken(token) : verifyToken(token);
    } catch (error) {
      if (error.name === 'TokenExpiredError') {
        isExpired = true;
      } else {
        // محاولة النظام القديم
        try {
          decoded = verifyToken(token);
        } catch (oldError) {
          return sendUnauthorized(res, 'توكن غير صحيح');
        }
      }
    }

    // إذا كان التوكن منتهي الصلاحية، أرسل رسالة خاصة للـ Frontend
    if (isExpired) {
      return res.status(401).json({
        success: false,
        error: {
          code: 'TOKEN_EXPIRED',
          message: 'انتهت صلاحية الجلسة',
          requires_refresh: true
        },
        timestamp: new Date().toISOString()
      });
    }

    // البحث عن الجلسة في قاعدة البيانات
    const session = await Session.findByAccessToken(token) || await Session.findByToken(token);

    if (!session) {
      return sendUnauthorized(res, 'جلسة غير صالحة');
    }

    // تحديث آخر استخدام للجلسة
    await Session.updateLastUsed(session.id);

    // إرفاق بيانات المستخدم
    req.user = {
      id: session.user_id || session.id,
      email: session.email,
      name: session.name,
      avatar: session.avatar,
      email_verified: session.email_verified
    };

    req.session = {
      id: session.id,
      expires_at: session.expires_at,
      refresh_expires_at: session.refresh_expires_at
    };

    next();
  } catch (error) {
    console.error('خطأ في المصادقة:', error);
    return sendUnauthorized(res, 'خطأ في المصادقة');
  }
};

// المصادقة الاختيارية
const optionalAuth = async (req, res, next) => {
  try {
    const authHeader = req.headers['authorization'];
    const token = authHeader && authHeader.split(' ')[1];

    if (!token) {
      req.user = null;
      return next();
    }

    try {
      const decoded = verifyAccessToken ? verifyAccessToken(token) : verifyToken(token);
      const session = await Session.findByAccessToken(token) || await Session.findByToken(token);

      if (session) {
        await Session.updateLastUsed(session.id);
        
        req.user = {
          id: session.user_id || session.id,
          email: session.email,
          name: session.name,
          avatar: session.avatar,
          email_verified: session.email_verified
        };

        req.session = {
          id: session.id,
          expires_at: session.expires_at,
          refresh_expires_at: session.refresh_expires_at
        };
      } else {
        req.user = null;
      }
    } catch (error) {
      req.user = null;
    }

    next();
  } catch (error) {
    req.user = null;
    next();
  }
};

module.exports = {
  authenticateToken,
  optionalAuth
};