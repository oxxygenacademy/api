const User = require('../models/User');
const Course = require('../models/Course');
const Enrollment = require('../models/Enrollment');
const Stats = require('../models/Stats');
const { sendSuccess, sendError, sendNotFound, sendValidationError } = require('../utils/response');
const { validationResult } = require('express-validator');
const { query } = require('../config/database');

class UserController {
  // الملف الشخصي
  static async getProfile(req, res) {
    try {
      const userId = req.user.id;
      const user = await User.findById(userId);
      
      if (!user) {
        return sendNotFound(res, 'المستخدم غير موجود');
      }

      // إحصائيات سريعة
      const stats = await query(`
        SELECT 
          COUNT(DISTINCT e.course_id) as enrolled_courses,
          COUNT(DISTINCT CASE WHEN cp.completion_percentage = 100 THEN cp.course_id END) as completed_courses,
          AVG(cp.completion_percentage) as avg_completion,
          SUM(cp.watched_duration) as total_watched_time
        FROM enrollments e
        LEFT JOIN course_progress cp ON e.course_id = cp.course_id AND e.user_id = cp.user_id
        WHERE e.user_id = ?
      `, [userId]);

      sendSuccess(res, {
        user: {
          ...user,
          stats: stats[0]
        }
      }, 'تم جلب الملف الشخصي بنجاح');
      
    } catch (error) {
      sendError(res, error);
    }
  }

  // تحديث الملف الشخصي
  static async updateProfile(req, res) {
    try {
      const errors = validationResult(req);
      if (!errors.isEmpty()) {
        return sendValidationError(res, errors.array());
      }

      const userId = req.user.id;
      const updateData = {};

      // فلترة البيانات المسموح تحديثها
      if (req.body.name) updateData.name = req.body.name.trim();
      if (req.body.email) updateData.email = req.body.email;
      if (req.body.avatar) updateData.avatar = req.body.avatar;

      // التحقق من عدم تكرار البريد الإلكتروني
      if (updateData.email) {
        const existingUser = await User.findByEmail(updateData.email);
        if (existingUser && existingUser.id !== userId) {
          return sendError(res, 'البريد الإلكتروني مستخدم من قبل مستخدم آخر', 409);
        }
      }

      const updatedUser = await User.update(userId, updateData);
      
      sendSuccess(res, { user: updatedUser }, 'تم تحديث الملف الشخصي بنجاح');
      
    } catch (error) {
      sendError(res, error);
    }
  }

  // كورسات المستخدم
  static async getMyCourses(req, res) {
    try {
      const userId = req.user.id;
      const { status = 'all', category } = req.query;

      let whereClause = 'WHERE e.user_id = ?';
      const params = [userId];

      if (status === 'completed') {
        whereClause += ' AND cp.completion_percentage = 100';
      } else if (status === 'in_progress') {
        whereClause += ' AND cp.completion_percentage > 0 AND cp.completion_percentage < 100';
      } else if (status === 'not_started') {
        whereClause += ' AND (cp.completion_percentage IS NULL OR cp.completion_percentage = 0)';
      }

      if (category) {
        whereClause += ' AND cat.slug = ?';
        params.push(category);
      }

      const courses = await query(`
        SELECT 
          c.*,
          cat.name as category_name,
          cat.slug as category_slug,
          cat.icon as category_icon,
          e.enrolled_at,
          e.payment_status,
          cp.completion_percentage,
          cp.completed_lessons,
          cp.total_lessons,
          cp.watched_duration,
          cp.total_duration,
          cp.last_activity_at,
          cp.current_lesson_id,
          cp.current_section_id,
          CASE 
            WHEN cp.completion_percentage = 100 THEN 'completed'
            WHEN cp.completion_percentage > 0 THEN 'in_progress'
            ELSE 'not_started'
          END as status
        FROM enrollments e
        JOIN courses c ON e.course_id = c.id
        LEFT JOIN course_categories cat ON c.category_id = cat.id
        LEFT JOIN course_progress cp ON e.course_id = cp.course_id AND e.user_id = cp.user_id
        ${whereClause}
        ORDER BY 
          CASE WHEN cp.last_activity_at IS NOT NULL THEN cp.last_activity_at ELSE e.enrolled_at END DESC
      `, params);

      sendSuccess(res, {
        courses,
        total: courses.length,
        filters: { status, category }
      }, 'تم جلب كورساتك بنجاح');
      
    } catch (error) {
      sendError(res, error);
    }
  }

  // إنجازات المستخدم
  static async getAchievements(req, res) {
    try {
      const userId = req.user.id;
      const achievements = await Stats.getUserAchievements(userId);
      
      sendSuccess(res, { achievements }, 'تم جلب الإنجازات بنجاح');
      
    } catch (error) {
      sendError(res, error);
    }
  }

  // المفضلات
  static async getFavorites(req, res) {
    try {
      const userId = req.user.id;

      const favorites = await query(`
        SELECT 
          c.*,
          cat.name as category_name,
          cat.slug as category_slug,
          cat.icon as category_icon,
          uf.created_at as favorited_at,
          COUNT(DISTINCT e.id) as enrolled_count,
          CASE WHEN user_e.id IS NOT NULL THEN 1 ELSE 0 END as is_enrolled
        FROM user_favorites uf
        JOIN courses c ON uf.course_id = c.id
        LEFT JOIN course_categories cat ON c.category_id = cat.id
        LEFT JOIN enrollments e ON c.id = e.course_id
        LEFT JOIN enrollments user_e ON c.id = user_e.course_id AND user_e.user_id = uf.user_id
        WHERE uf.user_id = ? AND c.is_active = 1
        GROUP BY c.id
        ORDER BY uf.created_at DESC
      `, [userId]);

      sendSuccess(res, { favorites }, 'تم جلب المفضلات بنجاح');
      
    } catch (error) {
      sendError(res, error);
    }
  }

  // إضافة/إزالة من المفضلة
  static async toggleFavorite(req, res) {
    try {
      const userId = req.user.id;
      const { courseId } = req.params;

      // التحقق من وجود الكورس
      const course = await Course.findByIdDetailed(courseId);
      if (!course) {
        return sendNotFound(res, 'الكورس غير موجود');
      }

      // التحقق من المفضلة الحالية
      const existing = await query(
        'SELECT id FROM user_favorites WHERE user_id = ? AND course_id = ?',
        [userId, courseId]
      );

      if (existing.length > 0) {
        // إزالة من المفضلة
        await query(
          'DELETE FROM user_favorites WHERE user_id = ? AND course_id = ?',
          [userId, courseId]
        );

        sendSuccess(res, { 
          is_favorite: false,
          course_id: courseId 
        }, 'تم إزالة الكورس من المفضلة');
      } else {
        // إضافة للمفضلة
        await query(
          'INSERT INTO user_favorites (user_id, course_id) VALUES (?, ?)',
          [userId, courseId]
        );

        sendSuccess(res, { 
          is_favorite: true,
          course_id: courseId 
        }, 'تم إضافة الكورس للمفضلة');
      }
      
    } catch (error) {
      sendError(res, error);
    }
  }

  // تاريخ التعلم
  static async getLearningHistory(req, res) {
    try {
      const userId = req.user.id;
      const { limit = 20, page = 1 } = req.query;
      const offset = (page - 1) * limit;

      const history = await query(`
        SELECT 
          'lesson_watched' as activity_type,
          l.id as lesson_id,
          l.title as lesson_title,
          c.id as course_id,
          c.title as course_title,
          cs.title as section_title,
          lp.last_watched_at as activity_date,
          lp.completion_percentage,
          lp.watched_duration,
          l.duration as total_duration
        FROM lesson_progress lp
        JOIN lessons l ON lp.lesson_id = l.id
        JOIN courses c ON l.course_id = c.id
        JOIN course_sections cs ON l.section_id = cs.id
        WHERE lp.user_id = ? AND lp.last_watched_at IS NOT NULL
        
        UNION ALL
        
        SELECT 
          'course_enrolled' as activity_type,
          NULL as lesson_id,
          NULL as lesson_title,
          c.id as course_id,
          c.title as course_title,
          NULL as section_title,
          e.enrolled_at as activity_date,
          NULL as completion_percentage,
          NULL as watched_duration,
          NULL as total_duration
        FROM enrollments e
        JOIN courses c ON e.course_id = c.id
        WHERE e.user_id = ?
        
        ORDER BY activity_date DESC
        LIMIT ? OFFSET ?
      `, [userId, userId, parseInt(limit), parseInt(offset)]);

      sendSuccess(res, {
        history,
        pagination: {
          page: parseInt(page),
          limit: parseInt(limit),
          total: history.length
        }
      }, 'تم جلب تاريخ التعلم بنجاح');
      
    } catch (error) {
      sendError(res, error);
    }
  }

  // الشهادات
  static async getCertificates(req, res) {
    try {
      const userId = req.user.id;

      const certificates = await query(`
        SELECT 
          c.*,
          cat.name as category_name,
          cp.completed_at,
          cp.completion_percentage,
          cp.total_duration as course_duration,
          cp.watched_duration
        FROM course_progress cp
        JOIN courses c ON cp.course_id = c.id
        LEFT JOIN course_categories cat ON c.category_id = cat.id
        WHERE cp.user_id = ? AND cp.completion_percentage = 100
        ORDER BY cp.completed_at DESC
      `, [userId]);

      sendSuccess(res, { certificates }, 'تم جلب الشهادات بنجاح');
      
    } catch (error) {
      sendError(res, error);
    }
  }
}

module.exports = UserController;