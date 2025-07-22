const User = require('../models/User');
const { query } = require('../config/database');
const { sendSuccess, sendError, sendNotFound } = require('../utils/response');

class UserController {
  // جلب الملف الشخصي
  static async getProfile(req, res) {
    try {
      const userId = req.user.id;

      const user = await User.findById(userId);
      if (!user) {
        return sendNotFound(res, 'المستخدم غير موجود');
      }

      // جلب إحصائيات التعلم
      const learningStats = await query(`
        SELECT 
          COUNT(DISTINCT e.course_id) as total_courses,
          COUNT(DISTINCT CASE WHEN cp.progress_percentage = 100 THEN e.course_id END) as completed_courses,
          COALESCE(SUM(TIME_TO_SEC(lp.watch_time)), 0) as total_seconds,
          COUNT(DISTINCT cert.id) as certificates_earned,
          COALESCE(MAX(DATEDIFF(CURDATE(), DATE(lp.last_watched_at))), 0) as current_streak
        FROM enrollments e
        LEFT JOIN lesson_progress lp ON lp.user_id = e.user_id
        LEFT JOIN course_progress cp ON cp.course_id = e.course_id AND cp.user_id = e.user_id
        LEFT JOIN certificates cert ON cert.user_id = e.user_id
        WHERE e.user_id = ? AND e.is_active = 1
      `, [userId]);

      const stats = learningStats[0] || {};
      const totalHours = Math.floor((stats.total_seconds || 0) / 3600);
      const totalMinutes = Math.floor(((stats.total_seconds || 0) % 3600) / 60);

      // جلب التفضيلات
      const preferences = await query(`
        SELECT setting_key, setting_value 
        FROM user_preferences 
        WHERE user_id = ?
      `, [userId]);

      const userPreferences = {};
      preferences.forEach(pref => {
        userPreferences[pref.setting_key] = pref.setting_value === '1' || pref.setting_value === 'true';
      });

      sendSuccess(res, {
        user: {
          id: user.id,
          email: user.email,
          name: user.name,
          avatar: user.avatar,
          bio: user.bio || '',
          phone: user.phone || '',
          country: user.country || '',
          city: user.city || '',
          timezone: user.timezone || 'Asia/Riyadh',
          language: user.language || 'ar',
          email_verified: user.email_verified === 1,
          phone_verified: user.phone_verified === 1,
          created_at: user.created_at,
          last_login: user.last_login
        },
        learning_stats: {
          total_courses: stats.total_courses || 0,
          completed_courses: stats.completed_courses || 0,
          total_hours: `${totalHours}:${totalMinutes.toString().padStart(2, '0')}:00`,
          certificates_earned: stats.certificates_earned || 0,
          current_streak: Math.max(0, 7 - (stats.current_streak || 0))
        },
        preferences: {
          email_notifications: userPreferences.email_notifications !== false,
          course_reminders: userPreferences.course_reminders !== false,
          marketing_emails: userPreferences.marketing_emails === true,
          auto_play_next_lesson: userPreferences.auto_play_next_lesson !== false
        }
      }, 'تم جلب الملف الشخصي بنجاح');

    } catch (error) {
      console.error('❌ خطأ في جلب الملف الشخصي:', error);
      sendError(res, 'حدث خطأ في جلب الملف الشخصي');
    }
  }

  // تحديث الملف الشخصي
  static async updateProfile(req, res) {
    try {
      const userId = req.user.id;
      const { name, bio, phone, country, city, timezone, preferences } = req.body;

      // تحديث بيانات المستخدم
      const updateFields = [];
      const updateValues = [];

      if (name !== undefined) {
        updateFields.push('name = ?');
        updateValues.push(name);
      }
      if (bio !== undefined) {
        updateFields.push('bio = ?');
        updateValues.push(bio);
      }
      if (phone !== undefined) {
        updateFields.push('phone = ?');
        updateValues.push(phone);
      }
      if (country !== undefined) {
        updateFields.push('country = ?');
        updateValues.push(country);
      }
      if (city !== undefined) {
        updateFields.push('city = ?');
        updateValues.push(city);
      }
      if (timezone !== undefined) {
        updateFields.push('timezone = ?');
        updateValues.push(timezone);
      }

      if (updateFields.length > 0) {
        updateFields.push('updated_at = NOW()');
        updateValues.push(userId);

        await query(
          `UPDATE users SET ${updateFields.join(', ')} WHERE id = ?`,
          updateValues
        );
      }

      // تحديث التفضيلات
      if (preferences) {
        for (const [key, value] of Object.entries(preferences)) {
          await query(`
            INSERT INTO user_preferences (user_id, setting_key, setting_value) 
            VALUES (?, ?, ?) 
            ON DUPLICATE KEY UPDATE setting_value = VALUES(setting_value)
          `, [userId, key, value ? '1' : '0']);
        }
      }

      const updatedUser = await User.findById(userId);

      sendSuccess(res, {
        user: {
          id: updatedUser.id,
          name: updatedUser.name,
          bio: updatedUser.bio,
          phone: updatedUser.phone,
          country: updatedUser.country,
          city: updatedUser.city,
          timezone: updatedUser.timezone,
          updated_at: new Date().toISOString()
        }
      }, 'تم تحديث البيانات بنجاح');

    } catch (error) {
      console.error('❌ خطأ في تحديث الملف الشخصي:', error);
      sendError(res, 'حدث خطأ في تحديث البيانات');
    }
  }

  // جلب كورساتي
  static async getMyCourses(req, res) {
    try {
      const userId = req.user.id;
      const status = req.query.status || 'all'; // all, enrolled, completed, in_progress

      let whereClause = 'WHERE e.user_id = ? AND e.is_active = 1';
      const queryParams = [userId, userId, userId];

      if (status === 'completed') {
        whereClause += ' AND COALESCE(cp.progress_percentage, 0) = 100';
      } else if (status === 'in_progress') {
        whereClause += ' AND COALESCE(cp.progress_percentage, 0) > 0 AND COALESCE(cp.progress_percentage, 0) < 100';
      }

      const enrolledCourses = await query(`
        SELECT 
          c.id as course_id,
          c.title,
          c.slug,
          c.thumbnail,
          c.difficulty_level,
          c.duration_hours,
          c.total_lessons,
          i.name as instructor_name,
          e.enrolled_at,
          e.price_paid,
          COALESCE(cp.progress_percentage, 0) as progress_percentage,
          COALESCE(cp.completed_lessons, 0) as completed_lessons,
          CASE 
            WHEN COALESCE(cp.progress_percentage, 0) = 100 THEN 'completed'
            WHEN COALESCE(cp.progress_percentage, 0) > 0 THEN 'in_progress'
            ELSE 'enrolled'
          END as status,
          cp.last_accessed,
          (SELECT l.id FROM lessons l 
           LEFT JOIN lesson_progress lp ON l.id = lp.lesson_id AND lp.user_id = ?
           WHERE l.course_id = c.id AND l.is_active = 1 
           AND (lp.is_completed IS NULL OR lp.is_completed = 0)
           ORDER BY l.order_index ASC LIMIT 1) as next_lesson_id,
          (SELECT l.title FROM lessons l 
           LEFT JOIN lesson_progress lp ON l.id = lp.lesson_id AND lp.user_id = ?
           WHERE l.course_id = c.id AND l.is_active = 1 
           AND (lp.is_completed IS NULL OR lp.is_completed = 0)
           ORDER BY l.order_index ASC LIMIT 1) as next_lesson_title
        FROM enrollments e
        JOIN courses c ON e.course_id = c.id
        JOIN users i ON c.instructor_id = i.id
        LEFT JOIN course_progress cp ON c.id = cp.course_id AND cp.user_id = ?
        ${whereClause}
        ORDER BY e.enrolled_at DESC
      `, queryParams);

      // جلب المفضلات
      const favorites = await query(`
        SELECT 
          c.id as course_id,
          c.title,
          c.slug,
          c.thumbnail,
          c.price,
          c.rating,
          c.difficulty_level,
          i.name as instructor_name,
          f.added_at,
          CASE WHEN e.id IS NOT NULL THEN 1 ELSE 0 END as is_enrolled
        FROM favorites f
        JOIN courses c ON f.course_id = c.id
        JOIN users i ON c.instructor_id = i.id
        LEFT JOIN enrollments e ON c.id = e.course_id AND e.user_id = f.user_id AND e.is_active = 1
        WHERE f.user_id = ? AND c.is_active = 1
        ORDER BY f.added_at DESC
      `, [userId]);

      // تجميع البيانات
      const groupedCourses = {
        enrolled: enrolledCourses.filter(c => c.status === 'enrolled'),
        in_progress: enrolledCourses.filter(c => c.status === 'in_progress'),
        completed: enrolledCourses.filter(c => c.status === 'completed'),
        wishlist: favorites
      };

      const summary = {
        total_enrolled: enrolledCourses.length,
        total_in_progress: groupedCourses.in_progress.length,
        total_completed: groupedCourses.completed.length,
        total_wishlist: favorites.length
      };

      sendSuccess(res, {
        courses: status === 'all' ? groupedCourses : {
          [status]: groupedCourses[status] || enrolledCourses
        },
        summary
      }, 'تم جلب كورساتك بنجاح');

    } catch (error) {
      console.error('❌ خطأ في جلب الكورسات:', error);
      sendError(res, 'حدث خطأ في جلب كورساتك');
    }
  }

  // جلب المفضلات
  static async getFavorites(req, res) {
    try {
      const userId = req.user.id;

      const favorites = await query(`
        SELECT 
          f.id,
          f.course_id,
          c.title,
          c.slug,
          c.thumbnail,
          c.description,
          c.price,
          c.rating,
          c.total_ratings,
          c.difficulty_level,
          c.duration_hours,
          i.name as instructor_name,
          f.added_at,
          CASE WHEN e.id IS NOT NULL THEN 1 ELSE 0 END as is_enrolled
        FROM favorites f
        JOIN courses c ON f.course_id = c.id
        JOIN users i ON c.instructor_id = i.id
        LEFT JOIN enrollments e ON c.id = e.course_id AND e.user_id = f.user_id AND e.is_active = 1
        WHERE f.user_id = ? AND c.is_active = 1
        ORDER BY f.added_at DESC
      `, [userId]);

      sendSuccess(res, {
        favorites: favorites.map(fav => ({
          id: fav.id,
          course_id: fav.course_id,
          course: {
            id: fav.course_id,
            title: fav.title,
            slug: fav.slug,
            thumbnail: fav.thumbnail,
            description: fav.description,
            price: fav.price,
            rating: fav.rating,
            total_ratings: fav.total_ratings,
            difficulty_level: fav.difficulty_level,
            duration_hours: fav.duration_hours,
            instructor_name: fav.instructor_name,
            is_enrolled: fav.is_enrolled === 1
          },
          added_at: fav.added_at
        })),
        total_favorites: favorites.length
      }, 'تم جلب المفضلات بنجاح');

    } catch (error) {
      console.error('❌ خطأ في جلب المفضلات:', error);
      sendError(res, 'حدث خطأ في جلب المفضلات');
    }
  }

  // إضافة/إزالة مفضلة
  static async toggleFavorite(req, res) {
    try {
      const userId = req.user.id;
      const { courseId } = req.params;

      // التحقق من وجود الكورس
      const course = await query('SELECT id FROM courses WHERE id = ? AND is_active = 1', [courseId]);
      if (course.length === 0) {
        return sendNotFound(res, 'الكورس غير موجود');
      }

      // التحقق من وجود المفضلة
      const existingFavorite = await query(
        'SELECT id FROM favorites WHERE user_id = ? AND course_id = ?',
        [userId, courseId]
      );

      if (existingFavorite.length > 0) {
        // إزالة من المفضلات
        await query('DELETE FROM favorites WHERE user_id = ? AND course_id = ?', [userId, courseId]);
        
        sendSuccess(res, {
          course_id: parseInt(courseId),
          is_favorited: false,
          action: 'removed'
        }, 'تم إزالة الكورس من المفضلات');
      } else {
        // إضافة للمفضلات
        await query(
          'INSERT INTO favorites (user_id, course_id) VALUES (?, ?)',
          [userId, courseId]
        );
        
        sendSuccess(res, {
          course_id: parseInt(courseId),
          is_favorited: true,
          action: 'added'
        }, 'تمت إضافة الكورس للمفضلات');
      }

    } catch (error) {
      console.error('❌ خطأ في تبديل المفضلة:', error);
      sendError(res, 'حدث خطأ في تحديث المفضلات');
    }
  }

  // جلب الإنجازات
  static async getAchievements(req, res) {
    try {
      const userId = req.user.id;

      // قائمة الإنجازات المتاحة
      const allAchievements = [
        {
          id: 1,
          title: 'أول كورس مكتمل',
          description: 'أكملت أول كورس لك بنجاح',
          icon: 'trophy',
          category: 'completion',
          points: 100,
          requirement: 1,
          type: 'completed_courses'
        },
        {
          id: 2,
          title: 'المتعلم المثابر',
          description: 'تعلم لمدة 7 أيام متتالية',
          icon: 'fire',
          category: 'streak',
          points: 50,
          requirement: 7,
          type: 'learning_streak'
        },
        {
          id: 3,
          title: 'جامع الكورسات',
          description: 'اشترك في 5 كورسات',
          icon: 'collection',
          category: 'enrollment',
          points: 75,
          requirement: 5,
          type: 'enrolled_courses'
        }
      ];

      // جلب إحصائيات المستخدم
      const userStats = await query(`
        SELECT 
          COUNT(DISTINCT CASE WHEN cp.progress_percentage = 100 THEN e.course_id END) as completed_courses,
          COUNT(DISTINCT e.course_id) as enrolled_courses,
          7 as learning_streak
        FROM enrollments e
        LEFT JOIN course_progress cp ON e.course_id = cp.course_id AND cp.user_id = e.user_id
        WHERE e.user_id = ? AND e.is_active = 1
      `, [userId]);

      const stats = userStats[0] || {};

      // جلب الإنجازات المُحققة
      const earnedAchievements = await query(
        'SELECT achievement_id, earned_at FROM user_achievements WHERE user_id = ?',
        [userId]
      );

      const earnedIds = earnedAchievements.map(a => a.achievement_id);

      // تحديد حالة كل إنجاز
      const achievements = allAchievements.map(achievement => {
        const isEarned = earnedIds.includes(achievement.id);
        const currentValue = stats[achievement.type] || 0;
        const progress = Math.min(currentValue, achievement.requirement);

        const earnedData = earnedAchievements.find(e => e.achievement_id === achievement.id);

        return {
          ...achievement,
          is_earned: isEarned,
          earned_at: earnedData ? earnedData.earned_at : null,
          progress: isEarned ? null : {
            current: progress,
            required: achievement.requirement,
            percentage: Math.round((progress / achievement.requirement) * 100)
          }
        };
      });

      const totalPoints = achievements
        .filter(a => a.is_earned)
        .reduce((sum, a) => sum + a.points, 0);

      sendSuccess(res, {
        achievements,
        total_points: totalPoints,
        earned_achievements: earnedIds.length,
        total_achievements: allAchievements.length
      }, 'تم جلب الإنجازات بنجاح');

    } catch (error) {
      console.error('❌ خطأ في جلب الإنجازات:', error);
      sendError(res, 'حدث خطأ في جلب الإنجازات');
    }
  }

  // جلب الشهادات
  static async getCertificates(req, res) {
    try {
      const userId = req.user.id;

      const certificates = await query(`
        SELECT 
          cert.id,
          cert.course_id,
          c.title as course_title,
          i.name as instructor_name,
          cert.certificate_number,
          cert.issued_at,
          cert.is_verified
        FROM certificates cert
        JOIN courses c ON cert.course_id = c.id
        JOIN users i ON c.instructor_id = i.id
        WHERE cert.user_id = ?
        ORDER BY cert.issued_at DESC
      `, [userId]);

      const formattedCertificates = certificates.map(cert => ({
        id: cert.id,
        course_id: cert.course_id,
        course_title: cert.course_title,
        instructor_name: cert.instructor_name,
        certificate_number: cert.certificate_number,
        issued_at: cert.issued_at,
        certificate_url: `/api/certificates/download/${cert.id}`,
        verification_url: `/verify/${cert.certificate_number}`,
        is_verified: cert.is_verified === 1
      }));

      sendSuccess(res, {
        certificates: formattedCertificates,
        total_certificates: certificates.length
      }, 'تم جلب الشهادات بنجاح');

    } catch (error) {
      console.error('❌ خطأ في جلب الشهادات:', error);
      sendError(res, 'حدث خطأ في جلب الشهادات');
    }
  }
}

module.exports = UserController;