const User = require('../models/User');
const { query } = require('../config/database');
const { sendSuccess, sendError, sendNotFound } = require('../utils/response');

// فحص وجود الجداول والأعمدة (دالة مستقلة)
async function checkTableStructure(tableName) {
  try {
    const tablesResult = await query(`SHOW TABLES LIKE '${tableName}'`);
    if (tablesResult.length === 0) {
      return { exists: false, columns: [] };
    }

    const columns = await query(`DESCRIBE ${tableName}`);
    return { 
      exists: true, 
      columns: columns.map(col => col.Field) 
    };
  } catch (error) {
    console.error(`❌ خطأ في فحص جدول ${tableName}:`, error);
    return { exists: false, columns: [] };
  }
}

class UserController {
  // جلب الملف الشخصي (مُبسط ومتكيف)
  static async getProfile(req, res) {
    try {
      const userId = req.user.id;

      console.log(`🔍 جلب الملف الشخصي للمستخدم: ${userId}`);

      // التحقق من وجود المستخدم
      const userQuery = 'SELECT * FROM users WHERE id = ? LIMIT 1';
      const users = await query(userQuery, [userId]);

      if (users.length === 0) {
        return sendNotFound(res, 'المستخدم غير موجود');
      }

      const user = users[0];

      // جلب إحصائيات التعلم بشكل آمن
      let learningStats = {
        total_courses: 0,
        completed_courses: 0,
        total_hours: '0:00:00',
        certificates_earned: 0,
        current_streak: 0
      };

      try {
        // فحص وجود جدول enrollments
        const enrollmentsCheck = await checkTableStructure('enrollments');
        
        if (enrollmentsCheck.exists) {
          const enrollmentsQuery = `
            SELECT COUNT(DISTINCT course_id) as total_courses
            FROM enrollments 
            WHERE user_id = ? AND is_active = 1
          `;
          
          const enrollmentStats = await query(enrollmentsQuery, [userId]);
          if (enrollmentStats.length > 0) {
            learningStats.total_courses = enrollmentStats[0].total_courses || 0;
          }
        }

        // فحص وجود جدول certificates
        const certificatesCheck = await checkTableStructure('certificates');
        
        if (certificatesCheck.exists) {
          const certificatesQuery = `
            SELECT COUNT(*) as certificates_earned
            FROM certificates 
            WHERE user_id = ?
          `;
          
          const certificateStats = await query(certificatesQuery, [userId]);
          if (certificateStats.length > 0) {
            learningStats.certificates_earned = certificateStats[0].certificates_earned || 0;
          }
        }

        console.log('✅ تم جلب إحصائيات التعلم');
      } catch (statsError) {
        console.log('⚠️ تم تخطي إحصائيات التعلم:', statsError.message);
      }

      // جلب التفضيلات بشكل آمن
      let userPreferences = {
        email_notifications: true,
        course_reminders: true,
        marketing_emails: false,
        auto_play_next_lesson: true
      };

      try {
        const preferencesCheck = await checkTableStructure('user_preferences');
        
        if (preferencesCheck.exists) {
          const preferencesQuery = `
            SELECT setting_key, setting_value 
            FROM user_preferences 
            WHERE user_id = ?
          `;
          
          const preferences = await query(preferencesQuery, [userId]);
          preferences.forEach(pref => {
            userPreferences[pref.setting_key] = pref.setting_value === '1' || pref.setting_value === 'true';
          });
        }

        console.log('✅ تم جلب التفضيلات');
      } catch (preferencesError) {
        console.log('⚠️ تم تخطي التفضيلات:', preferencesError.message);
      }

      sendSuccess(res, {
        user: {
          id: user.id,
          email: user.email,
          name: user.name,
          avatar: user.avatar || null,
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
        learning_stats: learningStats,
        preferences: userPreferences
      }, 'تم جلب الملف الشخصي بنجاح');

    } catch (error) {
      console.error('❌ خطأ في جلب الملف الشخصي:', error);
      sendError(res, 'حدث خطأ في جلب الملف الشخصي');
    }
  }

  // تحديث الملف الشخصي (مُبسط)
  static async updateProfile(req, res) {
    try {
      const userId = req.user.id;
      const { name, bio, phone, country, city, timezone, preferences } = req.body;

      console.log(`🔄 تحديث الملف الشخصي للمستخدم: ${userId}`);

      // فحص هيكل جدول المستخدمين
      const usersCheck = await checkTableStructure('users');
      
      // تحديث بيانات المستخدم (الحقول الموجودة فقط)
      const updateFields = [];
      const updateValues = [];

      if (name !== undefined && usersCheck.columns.includes('name')) {
        updateFields.push('name = ?');
        updateValues.push(name);
      }
      if (bio !== undefined && usersCheck.columns.includes('bio')) {
        updateFields.push('bio = ?');
        updateValues.push(bio);
      }
      if (phone !== undefined && usersCheck.columns.includes('phone')) {
        updateFields.push('phone = ?');
        updateValues.push(phone);
      }
      if (country !== undefined && usersCheck.columns.includes('country')) {
        updateFields.push('country = ?');
        updateValues.push(country);
      }
      if (city !== undefined && usersCheck.columns.includes('city')) {
        updateFields.push('city = ?');
        updateValues.push(city);
      }
      if (timezone !== undefined && usersCheck.columns.includes('timezone')) {
        updateFields.push('timezone = ?');
        updateValues.push(timezone);
      }

      if (updateFields.length > 0) {
        if (usersCheck.columns.includes('updated_at')) {
          updateFields.push('updated_at = NOW()');
        }
        updateValues.push(userId);

        const updateQuery = `UPDATE users SET ${updateFields.join(', ')} WHERE id = ?`;
        await query(updateQuery, updateValues);
        
        console.log('✅ تم تحديث بيانات المستخدم');
      }

      // تحديث التفضيلات (إذا كان الجدول موجود)
      if (preferences) {
        try {
          const preferencesCheck = await checkTableStructure('user_preferences');
          
          if (preferencesCheck.exists) {
            for (const [key, value] of Object.entries(preferences)) {
              const upsertQuery = `
                INSERT INTO user_preferences (user_id, setting_key, setting_value) 
                VALUES (?, ?, ?) 
                ON DUPLICATE KEY UPDATE setting_value = VALUES(setting_value)
              `;
              await query(upsertQuery, [userId, key, value ? '1' : '0']);
            }
            console.log('✅ تم تحديث التفضيلات');
          }
        } catch (preferencesError) {
          console.log('⚠️ تم تخطي تحديث التفضيلات:', preferencesError.message);
        }
      }

      // جلب البيانات المحدثة
      const updatedUser = await query('SELECT * FROM users WHERE id = ? LIMIT 1', [userId]);

      sendSuccess(res, {
        user: {
          id: updatedUser[0].id,
          name: updatedUser[0].name,
          bio: updatedUser[0].bio || '',
          phone: updatedUser[0].phone || '',
          country: updatedUser[0].country || '',
          city: updatedUser[0].city || '',
          timezone: updatedUser[0].timezone || 'Asia/Riyadh',
          updated_at: new Date().toISOString()
        }
      }, 'تم تحديث البيانات بنجاح');

    } catch (error) {
      console.error('❌ خطأ في تحديث الملف الشخصي:', error);
      sendError(res, 'حدث خطأ في تحديث البيانات');
    }
  }

  // جلب كورساتي (مُعاد كتابته بدون this)
  static async getMyCourses(req, res) {
    try {
      const userId = req.user.id;
      const status = req.query.status || 'all';

      console.log(`🔍 جلب كورسات المستخدم: ${userId} مع الحالة: ${status}`);

      // فحص الجداول المطلوبة
      const enrollmentsCheck = await checkTableStructure('enrollments');
      const coursesCheck = await checkTableStructure('courses');

      if (!enrollmentsCheck.exists) {
        console.log('⚠️ جدول enrollments غير موجود');
        return sendSuccess(res, {
          courses: {
            enrolled: [],
            in_progress: [],
            completed: [],
            wishlist: []
          },
          summary: {
            total_enrolled: 0,
            total_in_progress: 0,
            total_completed: 0,
            total_wishlist: 0
          }
        }, 'لا توجد كورسات مسجلة (جدول enrollments غير موجود)');
      }

      if (!coursesCheck.exists) {
        console.log('⚠️ جدول courses غير موجود');
        return sendSuccess(res, {
          courses: {
            enrolled: [],
            in_progress: [],
            completed: [],
            wishlist: []
          },
          summary: {
            total_enrolled: 0,
            total_in_progress: 0,
            total_completed: 0,
            total_wishlist: 0
          }
        }, 'لا توجد كورسات متاحة (جدول courses غير موجود)');
      }

      // بناء استعلام أساسي للكورسات المسجلة
      let enrolledCoursesQuery = `
        SELECT 
          c.id as course_id,
          c.title,
          e.enrolled_at,
          e.price_paid
      `;

      // إضافة الحقول الاختيارية الموجودة في جدول courses
      if (coursesCheck.columns.includes('slug')) {
        enrolledCoursesQuery += ', c.slug';
      }
      if (coursesCheck.columns.includes('thumbnail')) {
        enrolledCoursesQuery += ', c.thumbnail';
      }
      if (coursesCheck.columns.includes('difficulty_level')) {
        enrolledCoursesQuery += ', c.difficulty_level';
      }
      if (coursesCheck.columns.includes('duration_hours')) {
        enrolledCoursesQuery += ', c.duration_hours';
      }
      if (coursesCheck.columns.includes('total_lessons')) {
        enrolledCoursesQuery += ', c.total_lessons';
      }

      enrolledCoursesQuery += `
        FROM enrollments e
        JOIN courses c ON e.course_id = c.id
        WHERE e.user_id = ? AND e.is_active = 1
        ORDER BY e.enrolled_at DESC
      `;

      const enrolledCourses = await query(enrolledCoursesQuery, [userId]);

      console.log(`✅ تم جلب ${enrolledCourses.length} كورس مسجل`);

      // تنسيق البيانات مع القيم الافتراضية
      const formattedCourses = enrolledCourses.map(course => ({
        course_id: course.course_id,
        title: course.title,
        slug: course.slug || `course-${course.course_id}`,
        thumbnail: course.thumbnail || null,
        difficulty_level: course.difficulty_level || 'beginner',
        duration_hours: course.duration_hours || 0,
        total_lessons: course.total_lessons || 0,
        instructor_name: 'مدرب غير محدد',
        enrolled_at: course.enrolled_at,
        price_paid: course.price_paid || 0,
        progress_percentage: 0,
        completed_lessons: 0,
        status: 'enrolled',
        last_accessed: null,
        next_lesson_id: null,
        next_lesson_title: null
      }));

      // جلب المفضلات بشكل آمن
      let favorites = [];
      
      try {
        const favoritesCheck = await checkTableStructure('favorites');
        
        if (favoritesCheck.exists) {
          let favoritesQuery = `
            SELECT 
              c.id as course_id,
              c.title,
              f.added_at
          `;

          // إضافة الحقول الاختيارية
          if (coursesCheck.columns.includes('slug')) {
            favoritesQuery += ', c.slug';
          }
          if (coursesCheck.columns.includes('thumbnail')) {
            favoritesQuery += ', c.thumbnail';
          }
          if (coursesCheck.columns.includes('price')) {
            favoritesQuery += ', c.price';
          }
          if (coursesCheck.columns.includes('rating')) {
            favoritesQuery += ', c.rating';
          }
          if (coursesCheck.columns.includes('difficulty_level')) {
            favoritesQuery += ', c.difficulty_level';
          }

          favoritesQuery += `
            FROM favorites f
            JOIN courses c ON f.course_id = c.id
            WHERE f.user_id = ?
            ORDER BY f.added_at DESC
          `;

          const favoritesResult = await query(favoritesQuery, [userId]);
          
          favorites = favoritesResult.map(fav => ({
            course_id: fav.course_id,
            title: fav.title,
            slug: fav.slug || `course-${fav.course_id}`,
            thumbnail: fav.thumbnail || null,
            price: fav.price || 0,
            rating: fav.rating || 0,
            difficulty_level: fav.difficulty_level || 'beginner',
            instructor_name: 'مدرب غير محدد',
            added_at: fav.added_at,
            is_enrolled: enrolledCourses.some(e => e.course_id === fav.course_id)
          }));

          console.log(`✅ تم جلب ${favorites.length} كورس مفضل`);
        }
      } catch (favoritesError) {
        console.log('⚠️ تم تخطي المفضلات:', favoritesError.message);
      }

      // تجميع البيانات
      const groupedCourses = {
        enrolled: formattedCourses.filter(c => c.status === 'enrolled'),
        in_progress: formattedCourses.filter(c => c.status === 'in_progress'),
        completed: formattedCourses.filter(c => c.status === 'completed'),
        wishlist: favorites
      };

      const summary = {
        total_enrolled: formattedCourses.length,
        total_in_progress: groupedCourses.in_progress.length,
        total_completed: groupedCourses.completed.length,
        total_wishlist: favorites.length
      };

      sendSuccess(res, {
        courses: status === 'all' ? groupedCourses : {
          [status]: groupedCourses[status] || formattedCourses
        },
        summary
      }, 'تم جلب كورساتك بنجاح');

    } catch (error) {
      console.error('❌ خطأ في جلب الكورسات:', error);
      sendError(res, 'حدث خطأ في جلب كورساتك');
    }
  }

  // جلب المفضلات (مُحدث)
  static async getFavorites(req, res) {
    try {
      const userId = req.user.id;

      console.log(`🔍 جلب مفضلات المستخدم: ${userId}`);

      // فحص وجود جدول المفضلات
      const favoritesCheck = await checkTableStructure('favorites');
      const coursesCheck = await checkTableStructure('courses');

      if (!favoritesCheck.exists || !coursesCheck.exists) {
        return sendSuccess(res, {
          favorites: [],
          total_favorites: 0
        }, 'لا توجد مفضلات (الجداول المطلوبة غير موجودة)');
      }

      let favoritesQuery = `
        SELECT 
          f.id,
          f.course_id,
          c.title,
          f.added_at
      `;

      // إضافة الحقول الاختيارية
      if (coursesCheck.columns.includes('slug')) {
        favoritesQuery += ', c.slug';
      }
      if (coursesCheck.columns.includes('thumbnail')) {
        favoritesQuery += ', c.thumbnail';
      }
      if (coursesCheck.columns.includes('description')) {
        favoritesQuery += ', c.description';
      }
      if (coursesCheck.columns.includes('price')) {
        favoritesQuery += ', c.price';
      }
      if (coursesCheck.columns.includes('rating')) {
        favoritesQuery += ', c.rating';
      }
      if (coursesCheck.columns.includes('total_ratings')) {
        favoritesQuery += ', c.total_ratings';
      }
      if (coursesCheck.columns.includes('difficulty_level')) {
        favoritesQuery += ', c.difficulty_level';
      }
      if (coursesCheck.columns.includes('duration_hours')) {
        favoritesQuery += ', c.duration_hours';
      }

      favoritesQuery += `
        FROM favorites f
        JOIN courses c ON f.course_id = c.id
        WHERE f.user_id = ?
        ORDER BY f.added_at DESC
      `;

      const favorites = await query(favoritesQuery, [userId]);

      const formattedFavorites = favorites.map(fav => ({
        id: fav.id,
        course_id: fav.course_id,
        course: {
          id: fav.course_id,
          title: fav.title,
          slug: fav.slug || `course-${fav.course_id}`,
          thumbnail: fav.thumbnail || null,
          description: fav.description || '',
          price: fav.price || 0,
          rating: fav.rating || 0,
          total_ratings: fav.total_ratings || 0,
          difficulty_level: fav.difficulty_level || 'beginner',
          duration_hours: fav.duration_hours || 0,
          instructor_name: 'مدرب غير محدد',
          is_enrolled: false
        },
        added_at: fav.added_at
      }));

      sendSuccess(res, {
        favorites: formattedFavorites,
        total_favorites: favorites.length
      }, 'تم جلب المفضلات بنجاح');

    } catch (error) {
      console.error('❌ خطأ في جلب المفضلات:', error);
      sendError(res, 'حدث خطأ في جلب المفضلات');
    }
  }

  // إضافة/إزالة مفضلة (مُحدث)
  static async toggleFavorite(req, res) {
    try {
      const userId = req.user.id;
      const { courseId } = req.params;

      console.log(`🔄 تبديل مفضلة الكورس: ${courseId} للمستخدم: ${userId}`);

      // فحص وجود الجداول
      const favoritesCheck = await checkTableStructure('favorites');
      const coursesCheck = await checkTableStructure('courses');

      if (!favoritesCheck.exists) {
        return sendError(res, 'نظام المفضلات غير متاح (الجدول غير موجود)', 503);
      }

      if (!coursesCheck.exists) {
        return sendError(res, 'الكورسات غير متاحة (الجدول غير موجود)', 503);
      }

      // التحقق من وجود الكورس
      const courseExists = await query('SELECT id FROM courses WHERE id = ? LIMIT 1', [courseId]);
      if (courseExists.length === 0) {
        return sendNotFound(res, 'الكورس غير موجود');
      }

      // التحقق من وجود المفضلة
      const existingFavorite = await query(
        'SELECT id FROM favorites WHERE user_id = ? AND course_id = ? LIMIT 1',
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

  // جلب الإنجازات (مُبسط)
  static async getAchievements(req, res) {
    try {
      const userId = req.user.id;

      console.log(`🔍 جلب إنجازات المستخدم: ${userId}`);

      // قائمة إنجازات ثابتة (للآن)
      const achievements = [
        {
          id: 1,
          title: 'أول كورس مكتمل',
          description: 'أكملت أول كورس لك بنجاح',
          icon: 'trophy',
          category: 'completion',
          points: 100,
          is_earned: false,
          earned_at: null,
          progress: {
            current: 0,
            required: 1,
            percentage: 0
          }
        },
        {
          id: 2,
          title: 'المتعلم المثابر',
          description: 'تعلم لمدة 7 أيام متتالية',
          icon: 'fire',
          category: 'streak',
          points: 50,
          is_earned: false,
          earned_at: null,
          progress: {
            current: 0,
            required: 7,
            percentage: 0
          }
        }
      ];

      sendSuccess(res, {
        achievements,
        total_points: 0,
        earned_achievements: 0,
        total_achievements: achievements.length
      }, 'تم جلب الإنجازات بنجاح');

    } catch (error) {
      console.error('❌ خطأ في جلب الإنجازات:', error);
      sendError(res, 'حدث خطأ في جلب الإنجازات');
    }
  }

  // جلب الشهادات (مُحدث)
  static async getCertificates(req, res) {
    try {
      const userId = req.user.id;

      console.log(`🔍 جلب شهادات المستخدم: ${userId}`);

      // فحص وجود جدول الشهادات
      const certificatesCheck = await checkTableStructure('certificates');

      if (!certificatesCheck.exists) {
        return sendSuccess(res, {
          certificates: [],
          total_certificates: 0
        }, 'لا توجد شهادات (جدول certificates غير موجود)');
      }

      const certificatesQuery = `
        SELECT 
          cert.id,
          cert.course_id,
          cert.certificate_number,
          cert.issued_at,
          cert.is_verified
        FROM certificates cert
        WHERE cert.user_id = ?
        ORDER BY cert.issued_at DESC
      `;

      const certificates = await query(certificatesQuery, [userId]);

      const formattedCertificates = certificates.map(cert => ({
        id: cert.id,
        course_id: cert.course_id,
        course_title: 'كورس غير محدد',
        instructor_name: 'مدرب غير محدد',
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
