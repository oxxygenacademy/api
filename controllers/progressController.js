const LessonProgress = require('../models/LessonProgress');
const Stats = require('../models/Stats');
const { sendSuccess, sendError, sendNotFound } = require('../utils/response');
const { query } = require('../config/database');

class ProgressController {
  // تقدم الكورس
  static async getCourseProgress(req, res) {
    try {
      const { courseId } = req.params;
      const userId = req.user.id;

      const progress = await LessonProgress.getCourseProgress(userId, courseId);
      
      if (!progress) {
        return sendNotFound(res, 'لم تبدأ هذا الكورس بعد');
      }

      sendSuccess(res, progress, 'تم جلب تقدم الكورس بنجاح');
      
    } catch (error) {
      sendError(res, error);
    }
  }

  // إحصائيات المستخدم الشاملة
  static async getUserStats(req, res) {
    try {
      const userId = req.user.id;
      const stats = await Stats.getUserStats(userId);
      
      sendSuccess(res, stats, 'تم جلب الإحصائيات بنجاح');
      
    } catch (error) {
      sendError(res, error);
    }
  }

  // لوحة المعلومات
  static async getDashboard(req, res) {
    try {
      const userId = req.user.id;

      // جمع البيانات الأساسية للوحة
      const [
        generalStats,
        recentCourses,
        nextLessons,
        achievements,
        weeklyActivity
      ] = await Promise.all([
        // الإحصائيات العامة
        query(`
          SELECT 
            COUNT(DISTINCT e.course_id) as enrolled_courses,
            COUNT(DISTINCT CASE WHEN cp.completion_percentage = 100 THEN cp.course_id END) as completed_courses,
            AVG(cp.completion_percentage) as avg_completion,
            SUM(cp.watched_duration) as total_watched_time,
            COUNT(DISTINCT CASE WHEN lp.last_watched_at >= DATE_SUB(NOW(), INTERVAL 1 DAY) THEN lp.lesson_id END) as lessons_today,
            COUNT(DISTINCT CASE WHEN lp.last_watched_at >= DATE_SUB(NOW(), INTERVAL 7 DAY) THEN lp.lesson_id END) as lessons_week
          FROM enrollments e
          LEFT JOIN course_progress cp ON e.course_id = cp.course_id AND e.user_id = cp.user_id
          LEFT JOIN lesson_progress lp ON e.user_id = lp.user_id
          WHERE e.user_id = ?
        `, [userId]),

        // الكورسات الحديثة
        query(`
          SELECT 
            c.id, c.title, c.thumbnail, c.slug,
            cat.name as category_name,
            cat.icon as category_icon,
            cp.completion_percentage,
            cp.last_activity_at,
            cp.current_lesson_id,
            cp.current_section_id
          FROM course_progress cp
          JOIN courses c ON cp.course_id = c.id
          LEFT JOIN course_categories cat ON c.category_id = cat.id
          WHERE cp.user_id = ? AND cp.completion_percentage < 100
          ORDER BY cp.last_activity_at DESC
          LIMIT 5
        `, [userId]),

        // الدروس التالية
        query(`
          SELECT 
            l.id, l.title, l.duration, l.order_index,
            c.title as course_title, c.slug as course_slug,
            c.id as course_id,
            cs.title as section_title,
            cs.id as section_id,
            COALESCE(lp.completion_percentage, 0) as completion_percentage,
            COALESCE(lp.is_completed, 0) as is_completed
          FROM lessons l
          JOIN courses c ON l.course_id = c.id
          JOIN course_sections cs ON l.section_id = cs.id
          JOIN enrollments e ON c.id = e.course_id AND e.user_id = ?
          LEFT JOIN lesson_progress lp ON l.id = lp.lesson_id AND lp.user_id = ?
          WHERE l.is_active = 1 
            AND (lp.is_completed = 0 OR lp.is_completed IS NULL)
          ORDER BY cs.order_index ASC, l.order_index ASC
          LIMIT 5
        `, [userId, userId]),

        // الإنجازات الحديثة
        Stats.getUserAchievements(userId),

        // النشاط الأسبوعي
        query(`
          SELECT 
            DATE(lp.last_watched_at) as date,
            COUNT(DISTINCT lp.lesson_id) as lessons_watched,
            SUM(lp.watched_duration) as total_time,
            COUNT(DISTINCT lp.course_id) as courses_accessed
          FROM lesson_progress lp
          WHERE lp.user_id = ? 
            AND lp.last_watched_at >= DATE_SUB(NOW(), INTERVAL 7 DAY)
          GROUP BY DATE(lp.last_watched_at)
          ORDER BY date ASC
        `, [userId])
      ]);

      const dashboard = {
        overview: generalStats[0],
        recent_courses: recentCourses,
        next_lessons: nextLessons,
        recent_achievements: achievements.slice(-3),
        weekly_activity: weeklyActivity,
        recommendations: await this.getCourseRecommendations(userId)
      };

      sendSuccess(res, dashboard, 'تم جلب لوحة المعلومات بنجاح');
      
    } catch (error) {
      sendError(res, error);
    }
  }

  // التقرير الأسبوعي
  static async getWeeklyReport(req, res) {
    try {
      const userId = req.user.id;
      
      const weeklyData = await query(`
        SELECT 
          DATE(lp.last_watched_at) as date,
          COUNT(DISTINCT lp.lesson_id) as lessons_watched,
          SUM(lp.watched_duration) as total_time,
          COUNT(DISTINCT lp.course_id) as courses_accessed,
          COUNT(DISTINCT CASE WHEN lp.is_completed = 1 THEN lp.lesson_id END) as lessons_completed,
          AVG(lp.completion_percentage) as avg_completion
        FROM lesson_progress lp
        WHERE lp.user_id = ? 
          AND lp.last_watched_at >= DATE_SUB(NOW(), INTERVAL 7 DAY)
        GROUP BY DATE(lp.last_watched_at)
        ORDER BY date ASC
      `, [userId]);

      // مقارنة مع الأسبوع السابق
      const previousWeek = await query(`
        SELECT 
          COUNT(DISTINCT lp.lesson_id) as lessons_watched,
          SUM(lp.watched_duration) as total_time
        FROM lesson_progress lp
        WHERE lp.user_id = ? 
          AND lp.last_watched_at >= DATE_SUB(NOW(), INTERVAL 14 DAY)
          AND lp.last_watched_at < DATE_SUB(NOW(), INTERVAL 7 DAY)
      `, [userId]);

      const thisWeekTotal = weeklyData.reduce((sum, day) => ({
        lessons: sum.lessons + day.lessons_watched,
        time: sum.time + day.total_time
      }), { lessons: 0, time: 0 });

      const report = {
        period: 'الأسبوع الحالي',
        start_date: new Date(Date.now() - 7 * 24 * 60 * 60 * 1000).toISOString(),
        end_date: new Date().toISOString(),
        daily_data: weeklyData,
        summary: {
          total_lessons: thisWeekTotal.lessons,
          total_time: thisWeekTotal.time,
          active_days: weeklyData.length,
          avg_daily_time: weeklyData.length > 0 ? thisWeekTotal.time / weeklyData.length : 0,
          avg_daily_lessons: weeklyData.length > 0 ? thisWeekTotal.lessons / weeklyData.length : 0
        },
        comparison: {
          lessons_change: previousWeek[0] ? thisWeekTotal.lessons - previousWeek[0].lessons_watched : 0,
          time_change: previousWeek[0] ? thisWeekTotal.time - previousWeek[0].total_time : 0
        }
      };

      sendSuccess(res, report, 'تم إنشاء التقرير الأسبوعي بنجاح');
      
    } catch (error) {
      sendError(res, error);
    }
  }

  // التقرير الشهري
  static async getMonthlyReport(req, res) {
    try {
      const userId = req.user.id;

      const monthlyData = await query(`
        SELECT 
          WEEK(lp.last_watched_at) as week_number,
          COUNT(DISTINCT lp.lesson_id) as lessons_watched,
          SUM(lp.watched_duration) as total_time,
          COUNT(DISTINCT lp.course_id) as courses_accessed,
          COUNT(DISTINCT CASE WHEN lp.is_completed = 1 THEN lp.lesson_id END) as lessons_completed
        FROM lesson_progress lp
        WHERE lp.user_id = ? 
          AND lp.last_watched_at >= DATE_SUB(NOW(), INTERVAL 30 DAY)
        GROUP BY WEEK(lp.last_watched_at)
        ORDER BY week_number ASC
      `, [userId]);

      const coursesProgress = await query(`
        SELECT 
          c.title,
          cp.completion_percentage,
          cp.completed_lessons,
          cp.total_lessons,
          cp.watched_duration
        FROM course_progress cp
        JOIN courses c ON cp.course_id = c.id
        WHERE cp.user_id = ? AND cp.last_activity_at >= DATE_SUB(NOW(), INTERVAL 30 DAY)
        ORDER BY cp.last_activity_at DESC
      `, [userId]);

      const report = {
        period: 'الشهر الماضي',
        weekly_data: monthlyData,
        courses_progress: coursesProgress,
        summary: {
          total_lessons: monthlyData.reduce((sum, week) => sum + week.lessons_watched, 0),
          total_time: monthlyData.reduce((sum, week) => sum + week.total_time, 0),
          active_weeks: monthlyData.length,
          courses_accessed: coursesProgress.length
        }
      };

      sendSuccess(res, report, 'تم إنشاء التقرير الشهري بنجاح');
      
    } catch (error) {
      sendError(res, error);
    }
  }

  // مقارنة الأداء
  static async getComparisonStats(req, res) {
    try {
      const userId = req.user.id;
      const comparison = await Stats.getComparisonStats(userId);
      
      sendSuccess(res, comparison, 'تم جلب إحصائيات المقارنة بنجاح');
      
    } catch (error) {
      sendError(res, error);
    }
  }

  // تقدم الفصل
  static async getSectionProgress(req, res) {
    try {
      const { sectionId } = req.params;
      const userId = req.user.id;

      const sectionProgress = await query(`
        SELECT 
          cs.*,
          c.title as course_title,
          COUNT(l.id) as total_lessons,
          COUNT(CASE WHEN lp.is_completed = 1 THEN 1 END) as completed_lessons,
          AVG(lp.completion_percentage) as avg_completion,
          SUM(l.duration) as total_duration,
          SUM(lp.watched_duration) as watched_duration
        FROM course_sections cs
        JOIN courses c ON cs.course_id = c.id
        LEFT JOIN lessons l ON cs.id = l.section_id AND l.is_active = 1
        LEFT JOIN lesson_progress lp ON l.id = lp.lesson_id AND lp.user_id = ?
        WHERE cs.id = ?
        GROUP BY cs.id
      `, [userId, sectionId]);

      if (sectionProgress.length === 0) {
        return sendNotFound(res, 'الفصل غير موجود');
      }

      // تفاصيل الدروس
      const lessons = await query(`
        SELECT 
          l.*,
          lp.watched_duration,
          lp.completion_percentage,
          lp.is_completed,
          lp.last_watched_at
        FROM lessons l
        LEFT JOIN lesson_progress lp ON l.id = lp.lesson_id AND lp.user_id = ?
        WHERE l.section_id = ? AND l.is_active = 1
        ORDER BY l.order_index ASC
      `, [userId, sectionId]);

      const result = {
        section: sectionProgress[0],
        lessons: lessons
      };

      sendSuccess(res, result, 'تم جلب تقدم الفصل بنجاح');
      
    } catch (error) {
      sendError(res, error);
    }
  }

  // الإحصائيات اليومية
  static async getDailyStats(req, res) {
    try {
      const userId = req.user.id;
      const targetDate = req.params.date || new Date().toISOString().split('T')[0];

      const dailyStats = await query(`
        SELECT 
          COUNT(DISTINCT lp.lesson_id) as lessons_watched,
          SUM(lp.watched_duration) as total_time,
          COUNT(DISTINCT lp.course_id) as courses_accessed,
          COUNT(DISTINCT CASE WHEN lp.is_completed = 1 THEN lp.lesson_id END) as lessons_completed,
          AVG(lp.completion_percentage) as avg_completion
        FROM lesson_progress lp
        WHERE lp.user_id = ? AND DATE(lp.last_watched_at) = ?
      `, [userId, targetDate]);

      const lessonsDetail = await query(`
        SELECT 
          l.title as lesson_title,
          c.title as course_title,
          cs.title as section_title,
          lp.watched_duration,
          lp.completion_percentage,
          lp.last_watched_at
        FROM lesson_progress lp
        JOIN lessons l ON lp.lesson_id = l.id
        JOIN courses c ON l.course_id = c.id
        JOIN course_sections cs ON l.section_id = cs.id
        WHERE lp.user_id = ? AND DATE(lp.last_watched_at) = ?
        ORDER BY lp.last_watched_at DESC
      `, [userId, targetDate]);

      const result = {
        date: targetDate,
        stats: dailyStats[0],
        lessons_detail: lessonsDetail
      };

      sendSuccess(res, result, 'تم جلب الإحصائيات اليومية بنجاح');
      
    } catch (error) {
      sendError(res, error);
    }
  }

  // توصيات الكورسات (دالة مساعدة)
  static async getCourseRecommendations(userId) {
    try {
      // توصيات بناءً على الكورسات المكتملة والفئات المفضلة
      const recommendations = await query(`
        SELECT DISTINCT
          c.id, c.title, c.short_description, c.thumbnail, c.price,
          cat.name as category_name,
          COUNT(DISTINCT e.id) as enrolled_count
        FROM courses c
        LEFT JOIN course_categories cat ON c.category_id = cat.id
        LEFT JOIN enrollments e ON c.id = e.course_id
        WHERE c.is_active = 1 
          AND c.id NOT IN (
            SELECT course_id FROM enrollments WHERE user_id = ?
          )
          AND cat.id IN (
            SELECT DISTINCT c2.category_id 
            FROM enrollments e2 
            JOIN courses c2 ON e2.course_id = c2.id 
            WHERE e2.user_id = ?
          )
        GROUP BY c.id
        ORDER BY enrolled_count DESC, c.created_at DESC
        LIMIT 3
      `, [userId, userId]);

      return recommendations;
    } catch (error) {
      return [];
    }
  }
}

module.exports = ProgressController;