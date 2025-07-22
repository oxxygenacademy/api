const User = require('../models/User');
const Session = require('../models/Session');
const { sendSuccess, sendError, sendValidationError, sendNotFound } = require('../utils/response');
const { validationResult } = require('express-validator');

class AuthController {
  // تسجيل مستخدم جديد
  static async register(req, res) {
    try {
      const errors = validationResult(req);
      if (!errors.isEmpty()) {
        return sendValidationError(res, errors.array());
      }

      const { email, password, name } = req.body;

      // التحقق من وجود المستخدم
      const existingUser = await User.findByEmail(email);
      if (existingUser) {
        return sendError(res, 'البريد الإلكتروني مسجل مسبقاً', 409);
      }

      // إنشاء المستخدم
      const user = await User.create({ email, password, name });

      sendSuccess(res, {
        user: {
          id: user.id,
          email: user.email,
          name: user.name,
          created_at: user.created_at
        }
      }, 'تم إنشاء الحساب بنجاح. يمكنك الآن تسجيل الدخول', 201);

    } catch (error) {
      console.error('خطأ في التسجيل:', error);
      sendError(res, error);
    }
  }

  // تسجيل الدخول من جهاز واحد فقط (مُصحح)
  static async login(req, res) {
    try {
      console.log('🔐 محاولة تسجيل دخول:', {
        email: req.body.email,
        ip: req.ip,
        userAgent: req.get('User-Agent')
      });

      const errors = validationResult(req);
      if (!errors.isEmpty()) {
        console.log('❌ أخطاء validation:', errors.array());
        return sendValidationError(res, errors.array());
      }

      const { 
        email, 
        password, 
        remember_me = false,
        single_device = true, 
        device_name = 'Unknown Device' 
      } = req.body;

      // البحث عن المستخدم
      console.log('🔍 البحث عن المستخدم:', email);
      const user = await User.findByEmail(email);
      
      if (!user) {
        console.log('❌ المستخدم غير موجود:', email);
        return sendError(res, 'البريد الإلكتروني أو كلمة المرور غير صحيحة', 401);
      }

      console.log('✅ تم العثور على المستخدم:', {
        id: user.id,
        email: user.email,
        name: user.name
      });

      // التحقق من كلمة المرور
      console.log('🔑 التحقق من كلمة المرور...');
      const isValidPassword = await User.verifyPassword(password, user.password);
      
      if (!isValidPassword) {
        console.log('❌ كلمة المرور خاطئة للمستخدم:', email);
        return sendError(res, 'البريد الإلكتروني أو كلمة المرور غير صحيحة', 401);
      }

      console.log('✅ كلمة المرور صحيحة');

      // التحقق من الجلسات النشطة قبل الدخول
      console.log('📊 فحص الجلسات النشطة...');
      let activeSessionsCount = 0;
      let previousSessionsEnded = 0;

      try {
        activeSessionsCount = await Session.getActiveSessionsCount(user.id);
        console.log(`📈 عدد الجلسات النشطة: ${activeSessionsCount}`);

        if (single_device && activeSessionsCount > 0) {
          previousSessionsEnded = await Session.revokeAllUserSessions(user.id);
          console.log(`🔄 تم إنهاء ${previousSessionsEnded} جلسة سابقة للمستخدم ${user.email}`);
        }
      } catch (sessionError) {
        console.log('⚠️ خطأ في إدارة الجلسات:', sessionError.message);
        // متابعة العملية حتى لو فشلت إدارة الجلسات
      }

      // تجميع معلومات الجهاز (إصلاح this)
      const deviceInfo = {
        ip_address: req.ip,
        user_agent: req.get('User-Agent'),
        device: req.get('X-Device-Type') || 'web',
        device_name,
        remember_me,
        single_device,
        browser: AuthController.extractBrowserInfo(req.get('User-Agent')), // إصلاح this
        os: AuthController.extractOSInfo(req.get('User-Agent')), // إصلاح this
        login_time: new Date().toISOString()
      };

      console.log('📱 معلومات الجهاز:', deviceInfo);

      // إنشاء جلسة جديدة
      console.log('🆕 إنشاء جلسة جديدة...');
      const sessionData = await Session.create(user.id, deviceInfo, single_device);
      
      console.log('✅ تم إنشاء الجلسة بنجاح:', {
        sessionId: sessionData.id,
        hasRefreshToken: !!sessionData.refresh_token
      });

      // إعداد الكوكيز للـ Refresh Token إذا كان متوفر
      if (sessionData.refresh_token && remember_me) {
        res.cookie('refresh_token', sessionData.refresh_token, {
          httpOnly: true,
          secure: process.env.NODE_ENV === 'production',
          sameSite: 'strict',
          maxAge: 7 * 24 * 60 * 60 * 1000, // 7 أيام
          path: '/api/auth/refresh'
        });
        console.log('🍪 تم تعيين refresh token cookie');
      }

      // إرسال البيانات
      const responseData = {
        token: sessionData.access_token || sessionData.token,
        access_token: sessionData.access_token || sessionData.token,
        token_type: sessionData.token_type || 'Bearer',
        expires_in: sessionData.expires_in || 86400,
        expires_at: sessionData.expires_at,
        session_info: {
          id: sessionData.id,
          single_device,
          previous_sessions_ended: previousSessionsEnded,
          device_name,
          ip_address: req.ip
        },
        user: {
          id: user.id,
          email: user.email,
          name: user.name,
          avatar: user.avatar,
          email_verified: user.email_verified
        }
      };

      // إضافة refresh_token إذا كان متوفر
      if (sessionData.refresh_token) {
        responseData.refresh_token = sessionData.refresh_token;
        responseData.refresh_expires_at = sessionData.refresh_expires_at;
      }

      // رسالة مخصصة حسب حالة الجلسات السابقة
      let message = 'تم تسجيل الدخول بنجاح';
      if (single_device && previousSessionsEnded > 0) {
        message = `تم تسجيل الدخول بنجاح. تم إنهاء ${previousSessionsEnded} جلسة سابقة من أجهزة أخرى.`;
      }

      console.log('🎉 تم تسجيل الدخول بنجاح:', {
        userId: user.id,
        email: user.email,
        sessionId: sessionData.id
      });

      sendSuccess(res, responseData, message);

    } catch (error) {
      console.error('❌ خطأ في تسجيل الدخول:', {
        message: error.message,
        stack: error.stack,
        email: req.body?.email
      });
      
      sendError(res, 'حدث خطأ في تسجيل الدخول. يرجى المحاولة مرة أخرى');
    }
  }

  // تجديد التوكن
  static async refreshToken(req, res) {
    try {
      let refreshToken = req.body.refresh_token || req.cookies.refresh_token;

      if (!refreshToken) {
        return sendError(res, 'مطلوب توكن التجديد', 401);
      }

      const deviceInfo = {
        ip_address: req.ip,
        user_agent: req.get('User-Agent'),
        device: req.get('X-Device-Type') || 'web',
        refresh_time: new Date().toISOString()
      };

      const newSession = await Session.refreshTokens(refreshToken, deviceInfo);

      if (req.cookies.refresh_token) {
        res.cookie('refresh_token', newSession.refresh_token, {
          httpOnly: true,
          secure: process.env.NODE_ENV === 'production',
          sameSite: 'strict',
          maxAge: 7 * 24 * 60 * 60 * 1000,
          path: '/api/auth/refresh'
        });
      }

      sendSuccess(res, {
        token: newSession.access_token,
        access_token: newSession.access_token,
        refresh_token: newSession.refresh_token,
        token_type: newSession.token_type,
        expires_in: newSession.expires_in,
        expires_at: newSession.access_token_expires_at,
        user: newSession.user
      }, 'تم تجديد الجلسة بنجاح');

    } catch (error) {
      console.error('خطأ في تجديد التوكن:', error);
      sendError(res, 'فشل في تجديد الجلسة. يرجى تسجيل الدخول مرة أخرى', 401);
    }
  }

  // تسجيل الخروج
  static async logout(req, res) {
    try {
      const authHeader = req.headers['authorization'];
      const token = authHeader && authHeader.split(' ')[1];
      const refreshToken = req.body.refresh_token || req.cookies.refresh_token;
      const reason = req.body.reason || 'user_logout';

      if (token) {
        await Session.revoke(token);
        console.log(`🚪 المستخدم ${req.user?.email || 'غير معروف'} سجل الخروج - السبب: ${reason}`);
      }
      
      if (refreshToken) {
        await Session.revoke(refreshToken);
      }

      res.clearCookie('refresh_token', { path: '/api/auth/refresh' });
      sendSuccess(res, null, 'تم تسجيل الخروج بنجاح');

    } catch (error) {
      sendError(res, error);
    }
  }

  // تسجيل الخروج من جميع الأجهزة
  static async logoutAll(req, res) {
    try {
      const userId = req.user.id;
      const endedSessions = await Session.revokeAllUserSessions(userId);

      res.clearCookie('refresh_token', { path: '/api/auth/refresh' });

      console.log(`🔄 المستخدم ${req.user.email} سجل الخروج من جميع الأجهزة - تم إنهاء ${endedSessions} جلسة`);

      sendSuccess(res, {
        ended_sessions_count: endedSessions
      }, `تم تسجيل الخروج من جميع الأجهزة بنجاح (${endedSessions} جلسة)`);

    } catch (error) {
      sendError(res, error);
    }
  }

  // معلومات المستخدم الحالي
  static async me(req, res) {
    try {
      const user = await User.findById(req.user.id);
      
      if (!user) {
        return sendError(res, 'المستخدم غير موجود', 404);
      }

      const activeSessions = await Session.getUserActiveSessions(req.user.id);
      const currentSession = activeSessions.find(s => s.is_current === 1) || activeSessions[0];

      sendSuccess(res, { 
        user,
        session: {
          expires_at: req.session?.expires_at,
          refresh_expires_at: req.session?.refresh_expires_at,
          current_session: currentSession ? {
            id: currentSession.id,
            device_info: JSON.parse(currentSession.device_info || '{}'),
            ip_address: currentSession.ip_address,
            last_used_at: currentSession.last_used_at,
            is_single_device: currentSession.is_single_device
          } : null,
          active_sessions_count: activeSessions.length
        }
      }, 'تم جلب بيانات المستخدم بنجاح');

    } catch (error) {
      sendError(res, error);
    }
  }

  // جلب الجلسات النشطة
  static async getActiveSessions(req, res) {
    try {
      const userId = req.user.id;
      const sessions = await Session.getUserActiveSessions(userId);

      const formattedSessions = sessions.map(session => {
        const deviceInfo = JSON.parse(session.device_info || '{}');
        
        return {
          id: session.id,
          device_name: deviceInfo.device_name || 'جهاز غير معروف',
          device_type: deviceInfo.device || 'web',
          browser: deviceInfo.browser || 'غير معروف',
          os: deviceInfo.os || 'غير معروف',
          ip_address: session.ip_address,
          created_at: session.created_at,
          last_used_at: session.last_used_at,
          expires_at: session.expires_at,
          is_current: session.is_current === 1,
          is_single_device: session.is_single_device === 1,
          login_time: deviceInfo.login_time
        };
      });

      sendSuccess(res, { 
        sessions: formattedSessions,
        total_sessions: formattedSessions.length,
        single_device_policy: formattedSessions[0]?.is_single_device || false
      }, 'تم جلب الجلسات النشطة بنجاح');

    } catch (error) {
      sendError(res, error);
    }
  }

  // إنهاء جلسة محددة
  static async revokeSession(req, res) {
    try {
      const { sessionId } = req.params;
      const userId = req.user.id;

      const success = await Session.revokeSessionById(sessionId, userId);

      if (!success) {
        return sendNotFound(res, 'الجلسة غير موجودة أو لا تنتمي لك');
      }

      console.log(`🚪 المستخدم ${req.user.email} أنهى الجلسة: ${sessionId}`);
      sendSuccess(res, null, 'تم إنهاء الجلسة بنجاح');

    } catch (error) {
      sendError(res, error);
    }
  }

  // دوال مساعدة (static methods)
  static extractBrowserInfo(userAgent) {
    if (!userAgent) return 'غير معروف';
    
    if (userAgent.includes('Chrome')) return 'Chrome';
    if (userAgent.includes('Firefox')) return 'Firefox';
    if (userAgent.includes('Safari')) return 'Safari';
    if (userAgent.includes('Edge')) return 'Edge';
    if (userAgent.includes('Opera')) return 'Opera';
    
    return 'غير معروف';
  }

  static extractOSInfo(userAgent) {
    if (!userAgent) return 'غير معروف';
    
    if (userAgent.includes('Windows')) return 'Windows';
    if (userAgent.includes('Mac')) return 'macOS';
    if (userAgent.includes('Linux')) return 'Linux';
    if (userAgent.includes('Android')) return 'Android';
    if (userAgent.includes('iPhone') || userAgent.includes('iPad')) return 'iOS';
    
    return 'غير معروف';
  }
}

module.exports = AuthController;