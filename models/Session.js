const { query } = require('../config/database');

// فحص الاستيراد
console.log('📥 تحميل دوال JWT...');
const jwtModule = require('../config/jwt');
console.log('📦 الدوال المتاحة:', Object.keys(jwtModule));

const { 
  generateTokenPair, 
  verifyRefreshToken, 
  generateToken 
} = jwtModule;

console.log('🔍 فحص الدوال:', {
  generateTokenPair: typeof generateTokenPair,
  verifyRefreshToken: typeof verifyRefreshToken,
  generateToken: typeof generateToken
});

class Session {
  // إنشاء جلسة جديدة مع فحص شامل
  static async create(userId, deviceInfo = {}, singleDevice = true) {
    try {
      console.log(`🔄 إنشاء جلسة جديدة للمستخدم: ${userId}`);

      // إنهاء جميع الجلسات السابقة للمستخدم إذا كان التسجيل من جهاز واحد
      if (singleDevice) {
        try {
          const revokedCount = await this.revokeAllUserSessions(userId);
          console.log(`🔄 تم إنهاء ${revokedCount} جلسة سابقة للمستخدم: ${userId}`);
        } catch (revokeError) {
          console.log('⚠️ خطأ في إنهاء الجلسات السابقة:', revokeError.message);
        }
      }

      // فحص توفر generateTokenPair
      console.log('🔍 فحص generateTokenPair:', typeof generateTokenPair);
      
      if (typeof generateTokenPair === 'function') {
        // تجربة النظام الجديد مع Refresh Token
        try {
          console.log('🔧 تجربة النظام الجديد (Refresh Token)...');
          
          const tokenData = generateTokenPair({ 
            userId, 
            timestamp: Date.now(),
            sessionId: `session_${Date.now()}_${Math.random()}`
          });

          console.log('✅ تم إنشاء token pair بنجاح:', {
            hasAccessToken: !!tokenData.access_token,
            hasRefreshToken: !!tokenData.refresh_token,
            expiresIn: tokenData.expires_in
          });

          const result = await query(
            `INSERT INTO sessions (
              user_id, token, refresh_token, device_info, ip_address, user_agent, 
              expires_at, refresh_expires_at, is_single_device
            ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
            [
              userId,
              tokenData.access_token,
              tokenData.refresh_token,
              JSON.stringify({
                ...deviceInfo,
                login_time: new Date().toISOString(),
                single_device: singleDevice,
                system_version: 'refresh_token_v3'
              }),
              deviceInfo.ip_address || null,
              deviceInfo.user_agent || null,
              tokenData.access_token_expires_at,
              tokenData.refresh_token_expires_at,
              singleDevice
            ]
          );

          console.log(`✅ تم إنشاء جلسة جديدة (النظام الجديد): ${result.insertId}`);

          return {
            id: result.insertId,
            token: tokenData.access_token,
            refresh_token: tokenData.refresh_token,
            expires_at: tokenData.access_token_expires_at,
            refresh_expires_at: tokenData.refresh_token_expires_at,
            ...tokenData
          };

        } catch (newSystemError) {
          console.log('⚠️ فشل النظام الجديد:', newSystemError.message);
          // سنتابع مع النظام القديم
        }
      } else {
        console.log('⚠️ generateTokenPair غير متوفرة، استخدام النظام القديم');
      }

      // النظام الاحتياطي - توكن 24 ساعة
      console.log('🔧 استخدام النظام القديم (24 ساعة)...');
      
      if (typeof generateToken !== 'function') {
        throw new Error('لا توجد دوال لإنشاء التوكن');
      }

      const token = generateToken({ userId, timestamp: Date.now() });
      const expiresAt = new Date(Date.now() + 24 * 60 * 60 * 1000); // 24 ساعة

      const result = await query(
        `INSERT INTO sessions (user_id, token, device_info, ip_address, user_agent, expires_at, is_single_device) 
         VALUES (?, ?, ?, ?, ?, ?, ?)`,
        [
          userId,
          token,
          JSON.stringify({
            ...deviceInfo,
            login_time: new Date().toISOString(),
            single_device: singleDevice,
            fallback_mode: true,
            system_version: 'legacy_24h_v2'
          }),
          deviceInfo.ip_address || null,
          deviceInfo.user_agent || null,
          expiresAt,
          singleDevice
        ]
      );

      console.log(`✅ تم إنشاء جلسة (النظام القديم - 24 ساعة): ${result.insertId}`);

      return {
        id: result.insertId,
        token,
        expires_at: expiresAt,
        access_token: token,
        refresh_token: null,
        token_type: 'Bearer',
        expires_in: 24 * 60 * 60 // 24 ساعة بالثواني
      };

    } catch (error) {
      console.error('❌ خطأ كامل في إنشاء الجلسة:', error);
      throw new Error(`فشل في إنشاء الجلسة: ${error.message}`);
    }
  }

  // باقي الدوال...
  static async findByAccessToken(token) {
    try {
      const sessions = await query(
        `SELECT s.*, u.id as user_id, u.email, u.name, u.avatar, u.email_verified 
         FROM sessions s 
         JOIN users u ON s.user_id = u.id 
         WHERE s.token = ? AND s.is_active = 1`,
        [token]
      );
      return sessions[0] || null;
    } catch (error) {
      console.error('خطأ في البحث عن الجلسة:', error);
      return null;
    }
  }

  static async findByToken(token) {
    return await this.findByAccessToken(token);
  }

  static async findByRefreshToken(refreshToken) {
    if (!refreshToken) return null;

    try {
      const sessions = await query(
        `SELECT s.*, u.id as user_id, u.email, u.name, u.avatar, u.email_verified 
         FROM sessions s 
         JOIN users u ON s.user_id = u.id 
         WHERE s.refresh_token = ? AND s.is_active = 1 AND s.refresh_expires_at > NOW()`,
        [refreshToken]
      );
      return sessions[0] || null;
    } catch (error) {
      console.error('خطأ في البحث عن جلسة الـ refresh token:', error);
      return null;
    }
  }

  static async refreshTokens(refreshToken, deviceInfo = {}) {
    try {
      if (typeof verifyRefreshToken !== 'function') {
        throw new Error('verifyRefreshToken غير متوفرة');
      }

      const decoded = verifyRefreshToken(refreshToken);
      
      const session = await this.findByRefreshToken(refreshToken);
      if (!session) {
        throw new Error('جلسة غير صالحة');
      }

      if (typeof generateTokenPair !== 'function') {
        throw new Error('generateTokenPair غير متوفرة للتجديد');
      }

      const newTokenPair = generateTokenPair({
        userId: session.user_id,
        timestamp: Date.now(),
        sessionId: session.id
      });

      await query(
        `UPDATE sessions SET 
          token = ?, 
          refresh_token = ?,
          expires_at = ?,
          refresh_expires_at = ?,
          last_used_at = NOW(),
          device_info = ?
        WHERE id = ?`,
        [
          newTokenPair.access_token,
          newTokenPair.refresh_token,
          newTokenPair.access_token_expires_at,
          newTokenPair.refresh_token_expires_at,
          JSON.stringify({
            ...deviceInfo,
            refresh_time: new Date().toISOString(),
            single_device: session.is_single_device
          }),
          session.id
        ]
      );

      return {
        ...newTokenPair,
        user: {
          id: session.user_id,
          email: session.email,
          name: session.name,
          avatar: session.avatar,
          email_verified: session.email_verified
        }
      };

    } catch (error) {
      throw new Error('فشل في تجديد التوكن: ' + error.message);
    }
  }

  static async revoke(token) {
    try {
      const result = await query(
        'UPDATE sessions SET is_active = 0, revoked_at = NOW() WHERE token = ? OR refresh_token = ?',
        [token, token]
      );
      
      if (result.affectedRows > 0) {
        console.log(`🚪 تم إنهاء الجلسة: ${token.substring(0, 20)}...`);
      }
      
      return result.affectedRows > 0;
    } catch (error) {
      console.error('خطأ في إنهاء الجلسة:', error);
      return false;
    }
  }

  static async revokeAllUserSessions(userId, exceptSessionId = null) {
    try {
      let sql = 'UPDATE sessions SET is_active = 0, revoked_at = NOW() WHERE user_id = ?';
      let params = [userId];
      
      if (exceptSessionId) {
        sql += ' AND id != ?';
        params.push(exceptSessionId);
      }
      
      const result = await query(sql, params);
      console.log(`🔄 تم إنهاء ${result.affectedRows} جلسة للمستخدم: ${userId}`);
      return result.affectedRows;
      
    } catch (error) {
      console.error('خطأ في إنهاء جلسات المستخدم:', error);
      return 0;
    }
  }

  static async getActiveSessionsCount(userId) {
    try {
      const result = await query(
        `SELECT COUNT(*) as count 
         FROM sessions 
         WHERE user_id = ? AND is_active = 1 AND expires_at > NOW()`,
        [userId]
      );
      
      return result[0]?.count || 0;
    } catch (error) {
      console.error('خطأ في عد الجلسات النشطة:', error);
      return 0;
    }
  }

  static async getUserActiveSessions(userId) {
    try {
      return await query(
        `SELECT 
          id, token, refresh_token, device_info, ip_address, user_agent, created_at, last_used_at,
          expires_at, refresh_expires_at, is_single_device,
          CASE WHEN last_used_at >= DATE_SUB(NOW(), INTERVAL 1 HOUR) THEN 1 ELSE 0 END as is_current
        FROM sessions 
        WHERE user_id = ? AND is_active = 1 AND expires_at > NOW()
        ORDER BY last_used_at DESC`,
        [userId]
      );
    } catch (error) {
      console.error('خطأ في جلب الجلسات النشطة:', error);
      return [];
    }
  }

  static async updateLastUsed(sessionId) {
    try {
      await query('UPDATE sessions SET last_used_at = NOW() WHERE id = ?', [sessionId]);
    } catch (error) {
      console.error('خطأ في تحديث آخر استخدام:', error);
    }
  }

  static async revokeSessionById(sessionId, userId = null) {
    try {
      let sql = 'UPDATE sessions SET is_active = 0, revoked_at = NOW() WHERE id = ?';
      let params = [sessionId];
      
      if (userId) {
        sql += ' AND user_id = ?';
        params.push(userId);
      }
      
      const result = await query(sql, params);
      return result.affectedRows > 0;
    } catch (error) {
      console.error('خطأ في إنهاء الجلسة بالـ ID:', error);
      return false;
    }
  }

  // دالة تشخيص محسّنة
  static async debugTokenSystem() {
    try {
      console.log('🔍 فحص نظام التوكن...');
      
      // فحص وجود الدوال
      console.log('📦 الدوال المستوردة:', {
        generateTokenPair: typeof generateTokenPair,
        verifyRefreshToken: typeof verifyRefreshToken,
        generateToken: typeof generateToken
      });
      
      // فحص أعمدة قاعدة البيانات
      const tableInfo = await query('DESCRIBE sessions');
      const hasRefreshToken = tableInfo.some(col => col.Field === 'refresh_token');
      const hasRefreshExpires = tableInfo.some(col => col.Field === 'refresh_expires_at');
      
      console.log('🗄️ أعمدة قاعدة البيانات:', { hasRefreshToken, hasRefreshExpires });
      
      // تجربة إنشاء token pair إذا كانت متوفرة
      let testTokenPair = false;
      if (typeof generateTokenPair === 'function') {
        try {
          const testPair = generateTokenPair({ userId: 999, test: true });
          testTokenPair = !!(testPair.refresh_token && testPair.access_token);
          console.log('🧪 اختبار token pair:', testTokenPair);
        } catch (testError) {
          console.log('❌ فشل اختبار token pair:', testError.message);
        }
      }
      
      return { 
        generateTokenPair: typeof generateTokenPair === 'function', 
        hasRefreshToken, 
        hasRefreshExpires,
        testTokenPair
      };
    } catch (error) {
      console.error('خطأ في فحص النظام:', error);
      return null;
    }
  }
}

module.exports = Session;