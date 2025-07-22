// إجبار استخدام CommonJS
'use strict';

const jwt = require('jsonwebtoken');
require('dotenv').config();

console.log('📥 تحميل config/jwt.js...');

const JWT_SECRET = process.env.JWT_SECRET || 'your_super_secret_jwt_key_here_make_it_very_long_and_secure';
const JWT_REFRESH_SECRET = process.env.JWT_REFRESH_SECRET || 'your_refresh_token_secret_different_from_jwt_secret_very_secure';
const JWT_EXPIRES_IN = process.env.JWT_EXPIRES_IN || '24h'; // التوكن العادي - 24 ساعة
const JWT_REFRESH_EXPIRES_IN = process.env.JWT_REFRESH_EXPIRES_IN || '7d'; // توكن تجديد - 7 أيام

console.log('🔧 إعدادات JWT:', {
  JWT_EXPIRES_IN,
  JWT_REFRESH_EXPIRES_IN,
  hasSecret: !!JWT_SECRET,
  hasRefreshSecret: !!JWT_REFRESH_SECRET
});

// تحويل مدة انتهاء الصلاحية إلى ميلي ثانية
function parseExpiry(expiry) {
  if (typeof expiry === 'number') return expiry * 1000;
  
  const units = {
    's': 1000,
    'm': 60 * 1000,
    'h': 60 * 60 * 1000,
    'd': 24 * 60 * 60 * 1000
  };
  
  const match = expiry.match(/^(\d+)([smhd])$/);
  if (match) {
    return parseInt(match[1]) * units[match[2]];
  }
  
  return 24 * 60 * 60 * 1000; // افتراضي 24 ساعة
}

// إنشاء توكن دخول (24 ساعة)
function generateAccessToken(payload) {
  try {
    console.log('🔧 إنشاء access token لمدة 24 ساعة...');
    const token = jwt.sign(payload, JWT_SECRET, { 
      expiresIn: JWT_EXPIRES_IN,
      issuer: 'courses-system',
      audience: 'courses-users'
    });
    console.log('✅ تم إنشاء access token بنجاح');
    return token;
  } catch (error) {
    console.error('❌ خطأ في إنشاء access token:', error);
    throw error;
  }
}

// إنشاء توكن تجديد (7 أيام)
function generateRefreshToken(payload) {
  try {
    console.log('🔧 إنشاء refresh token لمدة 7 أيام...');
    const token = jwt.sign(payload, JWT_REFRESH_SECRET, { 
      expiresIn: JWT_REFRESH_EXPIRES_IN,
      issuer: 'courses-system',
      audience: 'courses-users'
    });
    console.log('✅ تم إنشاء refresh token بنجاح');
    return token;
  } catch (error) {
    console.error('❌ خطأ في إنشاء refresh token:', error);
    throw error;
  }
}

// إنشاء كامل الجلسة (Access + Refresh) - الدالة الرئيسية
function generateTokenPair(payload) {
  try {
    console.log('🔄 بدء إنشاء token pair (24h + 7d)...');
    console.log('📦 Payload:', payload);
    
    const accessToken = generateAccessToken(payload);
    const refreshToken = generateRefreshToken(payload);
    
    // حساب أوقات انتهاء الصلاحية
    const accessTokenExpiry = new Date(Date.now() + parseExpiry(JWT_EXPIRES_IN));
    const refreshTokenExpiry = new Date(Date.now() + parseExpiry(JWT_REFRESH_EXPIRES_IN));
    
    const result = {
      access_token: accessToken,
      refresh_token: refreshToken,
      access_token_expires_at: accessTokenExpiry,
      refresh_token_expires_at: refreshTokenExpiry,
      token_type: 'Bearer',
      expires_in: Math.floor(parseExpiry(JWT_EXPIRES_IN) / 1000) // بالثواني
    };
    
    console.log('✅ تم إنشاء token pair بنجاح:', {
      access_expires: accessTokenExpiry.toISOString(),
      refresh_expires: refreshTokenExpiry.toISOString(),
      expires_in_hours: result.expires_in / 3600
    });
    
    return result;
  } catch (error) {
    console.error('❌ خطأ في إنشاء token pair:', error);
    throw error;
  }
}

// التحقق من توكن الدخول
function verifyAccessToken(token) {
  try {
    return jwt.verify(token, JWT_SECRET);
  } catch (error) {
    if (error.name === 'TokenExpiredError') {
      throw new Error('TOKEN_EXPIRED');
    }
    throw error;
  }
}

// التحقق من توكن التجديد
function verifyRefreshToken(token) {
  try {
    return jwt.verify(token, JWT_REFRESH_SECRET);
  } catch (error) {
    if (error.name === 'TokenExpiredError') {
      throw new Error('REFRESH_TOKEN_EXPIRED');
    }
    throw error;
  }
}

// دالة التوافق مع النظام القديم - التوكن العادي 24 ساعة
function generateToken(payload) {
  try {
    console.log('🔧 إنشاء token (النظام القديم) لمدة 24 ساعة...');
    const token = jwt.sign(payload, JWT_SECRET, { expiresIn: '24h' }); // 24 ساعة
    console.log('✅ تم إنشاء token (النظام القديم) بنجاح');
    return token;
  } catch (error) {
    console.error('❌ خطأ في إنشاء token (النظام القديم):', error);
    throw error;
  }
}

// فك تشفير التوكين بدون التحقق (النظام القديم)
function verifyToken(token) {
  try {
    return jwt.verify(token, JWT_SECRET);
  } catch (error) {
    if (error.name === 'TokenExpiredError') {
      throw new Error('TOKEN_EXPIRED');
    }
    throw error;
  }
}

// فك تشفير التوكين بدون التحقق
function decodeToken(token) {
  try {
    return jwt.decode(token);
  } catch (error) {
    console.error('خطأ في فك تشفير التوكن:', error);
    return null;
  }
}

// التحقق من انتهاء صلاحية التوكن
function isTokenExpired(token) {
  try {
    const decoded = jwt.decode(token);
    if (!decoded || !decoded.exp) return true;
    return Date.now() >= decoded.exp * 1000;
  } catch (error) {
    return true;
  }
}

// استخراج معلومات من التوكن
function getTokenInfo(token) {
  try {
    const decoded = jwt.decode(token);
    if (!decoded) return null;
    
    const expiresAt = new Date(decoded.exp * 1000);
    const issuedAt = new Date(decoded.iat * 1000);
    const now = new Date();
    
    return {
      userId: decoded.userId,
      sessionId: decoded.sessionId,
      issuedAt,
      expiresAt,
      isExpired: now >= expiresAt,
      timeLeft: Math.max(0, expiresAt - now),
      durationHours: Math.round((expiresAt - issuedAt) / (1000 * 60 * 60))
    };
  } catch (error) {
    console.error('خطأ في استخراج معلومات التوكن:', error);
    return null;
  }
}

// اختبار الدوال عند التحميل
console.log('🧪 اختبار generateTokenPair...');
try {
  const testResult = generateTokenPair({ userId: 999, test: true });
  console.log('✅ generateTokenPair تعمل بشكل صحيح');
} catch (testError) {
  console.error('❌ خطأ في اختبار generateTokenPair:', testError);
}

// تصدير الدوال باستخدام CommonJS
module.exports = {
  // الدوال الجديدة (Refresh Token System)
  generateAccessToken,
  generateRefreshToken,
  generateTokenPair, // التأكد من التصدير
  verifyAccessToken,
  verifyRefreshToken,
  isTokenExpired,
  getTokenInfo,
  
  // الدوال القديمة للتوافق
  generateToken,
  verifyToken,
  decodeToken,
  
  // المتغيرات
  JWT_SECRET,
  JWT_REFRESH_SECRET,
  JWT_EXPIRES_IN,
  JWT_REFRESH_EXPIRES_IN,
  
  // دوال مساعدة
  parseExpiry
};

console.log('📤 تم تصدير دوال JWT بنجاح');