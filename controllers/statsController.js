const Stats = require('../models/Stats');
const { sendSuccess, sendError, sendNotFound } = require('../utils/response');
const { query } = require('../config/database');

class StatsController {
  // إحصائيات المنصة العامة
  static async getPlatformStats(req, res) {
    try {
      const stats = await Stats.getPlatformStats();
      
      // إضافة إحصائيات إضافية
      const additionalStats = await query(`
        SELECT 
          (SELECT COUNT(*) FROM lesson_progress WHERE last_watched_at >= DATE_SUB(NOW(), INTERVAL 1 DAY)) as lessons_watched_today,
          (SELECT COUNT(*) FROM enrollments WHERE enrolled_at >= DATE_SUB(NOW(), INTERVAL 7 DAY)) as new_enrollments_week,
          (SELECT COUNT(*) FROM course_progress WHERE completed_at >= DATE_SUB(NOW(), INTERVAL 30 DAY)) as courses_completed_month,
          (SELECT COUNT(DISTINCT category_id) FROM courses WHERE is_active = 1) as active_categories
      `);

      const result = {
        ...stats,
        recent_activity: additionalStats[0]
      };
      
      sendSuccess(res, result, 'تم جلب إحصائيات المنصة بنجاح');
      
    } catch (error) {
      sendError(res, error);
    }
  }

  // باقي الدوال كما هي مع إضافات...
  static async getUserStats(req, res) {
    try {
      const userId = req.user.id;
      const stats = await Stats.getUserStats(userId);
      
      sendSuccess(res, stats, 'تم جلب إحصائيات المستخدم بنجاح');
      
    } catch (error) {
      sendError(res, error);
    }
  }

  static async getCourseStats(req, res) {
    try {
      const { courseId } = req.params;
      const userId = req.user.id;

      const stats = await Stats.getCourseStatsForUser(userId, courseId);
      
      if (!stats) {
        return sendNotFound(res, 'لم تبدأ هذا الكورس بعد');
      }

      sendSuccess(res, stats, 'تم جلب إحصائيات الكورس بنجاح');
      
    } catch (error) {
      sendError(res, error);
    }
  }

  static async getCourseAnalytics(req, res) {
    try {
      const { courseId } = req.params;
      
      const analytics = await Stats.getCourseAnalytics(courseId);
      
      if (!analytics.course_stats) {
        return sendNotFound(res, 'الكورس غير موجود');
      }

      sendSuccess(res, analytics, 'تم جلب تحليلات الكورس بنجاح');
      
    } catch (error) {
      sendError(res, error);
    }
  }

  static async getUserAchievements(req, res) {
    try {
      const userId = req.user.id;
      const achievements = await Stats.getUserAchievements(userId);
      
      sendSuccess(res, { achievements }, 'تم جلب الإنجازات بنجاح');
      
    } catch (error) {
      sendError(res, error);
    }
  }

  static async getComparisonStats(req, res) {
    try {
      const userId = req.user.id;
      const comparison = await Stats.getComparisonStats(userId);
      
      sendSuccess(res, comparison, 'تم جلب إحصائيات المقارنة بنجاح');
      
    } catch (error) {
      sendError(res, error);
    }
  }

  static async getWeeklyReport(req, res) {
    try {
      const userId = req.user.id;
      
      const weeklyData = await query(`
        SELECT 
          DATE(lp.last_watched_at) as date,
          COUNT(DISTINCT lp.lesson_id) as lessons_watched,
          SUM(lp.watched_duration) as total_time,
          COUNT(DISTINCT lp.course_id) as courses_accessed,
          COUNT(DISTINCT CASE WHEN lp.is_completed = 1 THEN lp.lesson_id END) as lessons_completed
        FROM lesson_progress lp
        WHERE lp.user_id = ? 
          AND lp.last_watched_at >= DATE_SUB(NOW(), INTERVAL 7 DAY)
        GROUP BY DATE(lp.last_watched_at)
        ORDER BY date ASC
      `, [userId]);

      const report = {
        period: 'الأسبوع الماضي',
        start_date: new Date(Date.now() - 7 * 24 * 60 * 60 * 1000).toISOString(),
        end_date: new Date().toISOString(),
        daily_data: weeklyData,
        summary: {
          total_lessons: weeklyData.reduce((sum, day) => sum + day.lessons_watched, 0),
          total_time: weeklyData.reduce((sum, day) => sum + day.total_time, 0),
          active_days: weeklyData.length,
          avg_daily_time: weeklyData.length > 0 ? 
            weeklyData.reduce((sum, day) => sum + day.total_time, 0) / weeklyData.length : 0
        }
      };

      sendSuccess(res, report, 'تم إنشاء التقرير الأسبوعي بنجاح');
      
    } catch (error) {
      sendError(res, error);
    }
  }

  // إحصائيات الفئات
  static async getCategoryStats(req, res) {
    try {
      const categoryStats = await query(`
        SELECT 
          cat.*,
          COUNT(DISTINCT c.id) as course_count,
          COUNT(DISTINCT e.user_id) as total_enrolled,
          AVG(cp.completion_percentage) as avg_completion,
          SUM(cp.watched_duration) as total_watch_time
        FROM course_categories cat
        LEFT JOIN courses c ON cat.id = c.category_id AND c.is_active = 1
        LEFT JOIN enrollments e ON c.id = e.course_id
        LEFT JOIN course_progress cp ON c.id = cp.course_id
        WHERE cat.is_active = 1
        GROUP BY cat.id
        ORDER BY total_enrolled DESC, course_count DESC
      `);

      sendSuccess(res, { categories: categoryStats }, 'تم جلب إحصائيات الفئات بنجاح');
      
    } catch (error) {
      sendError(res, error);
    }
  }

  // إحصائيات المدرسين (للمستقبل)
  static async getInstructorStats(req, res) {
    try {
      // هذه دالة للمستقبل عندما نضيف نظام المدرسين
      const instructorStats = {
        message: 'نظام المدرسين قيد التطوير',
        coming_soon: true
      };

      sendSuccess(res, instructorStats, 'إحصائيات المدرسين - قيد التطوير');
      
    } catch (error) {
      sendError(res, error);
    }
  }

  // اتجاهات التعلم
  static async getLearningTrends(req, res) {
    try {
      const trends = await query(`
        SELECT 
          DATE_FORMAT(lp.last_watched_at, '%Y-%m') as month,
          COUNT(DISTINCT lp.user_id) as active_users,
          COUNT(DISTINCT lp.lesson_id) as lessons_watched,
          SUM(lp.watched_duration) as total_watch_time,
          COUNT(DISTINCT lp.course_id) as courses_accessed
        FROM lesson_progress lp
        WHERE lp.last_watched_at >= DATE_SUB(NOW(), INTERVAL 12 MONTH)
        GROUP BY DATE_FORMAT(lp.last_watched_at, '%Y-%m')
        ORDER BY month ASC
      `);

      // اتجاهات الفئات
      const categoryTrends = await query(`
        SELECT 
          cat.name as category_name,
          cat.icon as category_icon,
          DATE_FORMAT(lp.last_watched_at, '%Y-%m') as month,
          COUNT(DISTINCT lp.user_id) as active_users,
          SUM(lp.watched_duration) as total_watch_time
        FROM lesson_progress lp
        JOIN lessons l ON lp.lesson_id = l.id
        JOIN courses c ON l.course_id = c.id
        JOIN course_categories cat ON c.category_id = cat.id
        WHERE lp.last_watched_at >= DATE_SUB(NOW(), INTERVAL 6 MONTH)
        GROUP BY cat.id, DATE_FORMAT(lp.last_watched_at, '%Y-%m')
        ORDER BY month ASC, total_watch_time DESC
      `);

      const result = {
        platform_trends: trends,
        category_trends: categoryTrends
      };

      sendSuccess(res, result, 'تم جلب اتجاهات التعلم بنجاح');
      
    } catch (error) {
      sendError(res, error);
    }
  }
}

module.exports = StatsController;