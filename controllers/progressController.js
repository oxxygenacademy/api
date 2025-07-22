const { query } = require('../config/database');
const { sendSuccess, sendError } = require('../utils/response');

class ProgressController {
  // تقدم كورس محدد
  static async getCourseProgress(req, res) {
    try {
      const userId = req.user.id;
      const { courseId } = req.params;

      // التحقق من الاشتراك
      const enrollment = await query(
        'SELECT enrolled_at FROM enrollments WHERE user_id = ? AND course_id = ? AND is_active = 1',
        [userId, courseId]
      );

      if (enrollment.length === 0) {
        return sendError(res, 'غير مشترك في هذا الكورس', 403);
      }

      // جلب معلومات الكورس والتقدم
      const courseInfo = await query(`
        SELECT 
          c.id,
          c.title,
          c.total_lessons,
          COALESCE(cp.progress_percentage, 0) as progress_percentage,
          COALESCE(cp.completed_lessons, 0) as completed_lessons,
          COALESCE(cp.total_watch_time, 0) as total_watch_time,
          cp.last_accessed,
          cp.estimated_completion,
          CASE WHEN cp.progress_percentage = 100 THEN 1 ELSE 0 END as is_completed
        FROM courses c
        LEFT JOIN course_progress cp ON c.id = cp.course_id AND cp.user_id = ?
        WHERE c.id = ?
      `, [userId, courseId]);

      const course = courseInfo[0];
      if (!course) {
        return sendError(res, 'الكورس غير موجود', 404);
      }

      // جلب تقدم الفصول
      const sectionsProgress = await query(`
        SELECT 
          cs.id as section_id,
          cs.title as section_title,
          COUNT(l.id) as total_lessons,
          COUNT(CASE WHEN lp.is_completed = 1 THEN 1 END) as completed_lessons,
          CASE 
            WHEN COUNT(l.id) = 0 THEN 0 
            ELSE ROUND((COUNT(CASE WHEN lp.is_completed = 1 THEN 1 END) / COUNT(l.id)) * 100)
          END as progress_percentage,
          CASE WHEN COUNT(l.id) = COUNT(CASE WHEN lp.is_completed = 1 THEN 1 END) THEN 1 ELSE 0 END as is_completed
        FROM course_sections cs
        LEFT JOIN lessons l ON cs.id = l.section_id AND l.is_active = 1
        LEFT JOIN lesson_progress lp ON l.id = lp.lesson_id AND lp.user_id = ?
        WHERE cs.course_id = ? AND cs.is_active = 1
        GROUP BY cs.id, cs.title
        ORDER BY cs.order_index ASC
      `, [userId, courseId]);

      // جلب النشاط الأخير
      const recentActivity = await query(`
        SELECT 
          l.id as lesson_id,
          l.title as lesson_title,
          'completed' as action,
          lp.completed_at as timestamp
        FROM lesson_progress lp
        JOIN lessons l ON lp.lesson_id = l.id
        WHERE l.course_id = ? AND lp.user_id = ? AND lp.is_completed = 1
        ORDER BY lp.completed_at DESC
        LIMIT 5
      `, [courseId, userId]);

      sendSuccess(res, {
        course_progress: {
          course_id: course.id,
          course_title: course.title,
          enrollment_date: enrollment[0].enrolled_at,
          last_accessed: course.last_accessed,
          total_lessons: course.total_lessons || 0,
          completed_lessons: course.completed_lessons || 0,
          progress_percentage: course.progress_percentage || 0,
          total_watch_time: course.total_watch_time || 0,
          estimated_completion: course.estimated_completion,
          is_completed: course.is_completed === 1
        },
        sections_progress: sectionsProgress,
        recent_activity: recentActivity
      }, 'تم جلب تقدم الكورس بنجاح');

    } catch (error) {
      console.error('❌ خطأ في جلب تقدم الكورس:', error);
      sendError(res, 'حدث خطأ في جلب تقدم الكورس');
    }
  }

  // إحصائياتك الشاملة
  static async getUserStats(req, res) {
    try {
      const userId = req.user.id;

      // الإحصائيات العامة
      const overview = await query(`
        SELECT 
          COUNT(DISTINCT e.course_id) as total_enrolled_courses,
          COUNT(DISTINCT CASE WHEN cp.progress_percentage = 100 THEN e.course_id END) as completed_courses,
          COUNT(DISTINCT CASE WHEN cp.progress_percentage > 0 AND cp.progress_percentage < 100 THEN e.course_id END) as in_progress_courses,
          COALESCE(SUM(TIME_TO_SEC(lp.watch_time)), 0) as total_watch_seconds,
          COUNT(DISTINCT cert.id) as total_certificates,
          7 as learning_streak
        FROM enrollments e
        LEFT JOIN course_progress cp ON e.course_id = cp.course_id AND cp.user_id = e.user_id
        LEFT JOIN lesson_progress lp ON lp.user_id = e.user_id
        LEFT JOIN certificates cert ON cert.user_id = e.user_id
        WHERE e.user_id = ? AND e.is_active = 1
      `, [userId]);

      const stats = overview[0] || {};
      const totalSeconds = stats.total_watch_seconds || 0;
      const hours = Math.floor(totalSeconds / 3600);
      const minutes = Math.floor((totalSeconds % 3600) / 60);
      const seconds = totalSeconds % 60;

      // الإحصائيات الشهرية
      const monthlyProgress = await query(`
        SELECT 
          COUNT(CASE WHEN lp.completed_at >= DATE_SUB(NOW(), INTERVAL 30 DAY) THEN 1 END) as lessons_completed,
          COALESCE(SUM(CASE WHEN lp.last_watched_at >= DATE_SUB(NOW(), INTERVAL 30 DAY) THEN TIME_TO_SEC(lp.watch_time) ELSE 0 END), 0) as seconds_watched,
          COUNT(DISTINCT CASE WHEN e.enrolled_at >= DATE_SUB(NOW(), INTERVAL 30 DAY) THEN e.course_id END) as courses_started,
          COUNT(DISTINCT CASE WHEN cp.updated_at >= DATE_SUB(NOW(), INTERVAL 30 DAY) AND cp.progress_percentage = 100 THEN cp.course_id END) as courses_completed
        FROM enrollments e
        LEFT JOIN course_progress cp ON e.course_id = cp.course_id AND cp.user_id = e.user_id
        LEFT JOIN lesson_progress lp ON lp.user_id = e.user_id
        WHERE e.user_id = ? AND e.is_active = 1
      `, [userId]);

      const monthly = monthlyProgress[0] || {};
      const monthlyHours = Math.floor((monthly.seconds_watched || 0) / 3600);
      const monthlyMinutes = Math.floor(((monthly.seconds_watched || 0) % 3600) / 60);

      sendSuccess(res, {
        overview: {
          total_enrolled_courses: stats.total_enrolled_courses || 0,
          completed_courses: stats.completed_courses || 0,
          in_progress_courses: stats.in_progress_courses || 0,
          total_watch_time: `${hours}:${minutes.toString().padStart(2, '0')}:${seconds.toString().padStart(2, '0')}`,
          total_certificates: stats.total_certificates || 0,
          learning_streak: stats.learning_streak || 0,
          last_activity: new Date().toISOString()
        },
        monthly_progress: {
          lessons_completed: monthly.lessons_completed || 0,
          hours_watched: `${monthlyHours}:${monthlyMinutes.toString().padStart(2, '0')}:00`,
          courses_started: monthly.courses_started || 0,
          courses_completed: monthly.courses_completed || 0
        },
        achievements: [],
        learning_goals: {
          weekly_hours_target: 10,
          weekly_hours_achieved: Math.min(monthlyHours / 4, 10),
          weekly_progress_percentage: Math.min(Math.round((monthlyHours / 4 / 10) * 100), 100)
        }
      }, 'تم جلب الإحصائيات بنجاح');

    } catch (error) {
      console.error('❌ خطأ في جلب الإحصائيات:', error);
      sendError(res, 'حدث خطأ في جلب الإحصائيات');
    }
  }

  // لوحة المعلومات
  static async getDashboard(req, res) {
    try {
      const userId = req.user.id;

      // ملخص المستخدم
      const userInfo = await query(
        'SELECT name FROM users WHERE id = ?',
        [userId]
      );

      // الكورسات الحالية
      const currentCourses = await query(`
        SELECT 
          c.id as course_id,
          c.title,
          c.thumbnail,
          COALESCE(cp.progress_percentage, 0) as progress_percentage,
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
        LEFT JOIN course_progress cp ON c.id = cp.course_id AND cp.user_id = ?
        WHERE e.user_id = ? AND e.is_active = 1 
          AND COALESCE(cp.progress_percentage, 0) < 100
        ORDER BY cp.last_accessed DESC, e.enrolled_at DESC
        LIMIT 3
      `, [userId, userId, userId, userId]);

      // الكورسات المُوصى بها
      const recommendedCourses = await query(`
        SELECT 
          c.id,
          c.title,
          c.thumbnail,
          c.difficulty_level,
          c.rating,
          c.price,
          c.is_free,
          i.name as instructor_name
        FROM courses c
        JOIN users i ON c.instructor_id = i.id
        WHERE c.is_published = 1 AND c.is_active = 1
          AND c.id NOT IN (
            SELECT course_id FROM enrollments 
            WHERE user_id = ? AND is_active = 1
          )
        ORDER BY c.is_featured DESC, c.rating DESC
        LIMIT 4
      `, [userId]);

      sendSuccess(res, {
        user_summary: {
          name: userInfo[0]?.name || 'المستخدم',
          learning_level: 'متوسط',
          next_milestone: 'إكمال 10 كورسات',
          progress_to_milestone: 70
        },
        current_courses: currentCourses.map(course => ({
          course_id: course.course_id,
          title: course.title,
          thumbnail: course.thumbnail,
          progress_percentage: course.progress_percentage || 0,
          next_lesson: course.next_lesson_id ? {
            id: course.next_lesson_id,
            title: course.next_lesson_title
          } : null,
          last_accessed: course.last_accessed
        })),
        recommended_courses: recommendedCourses,
        recent_achievements: [],
        learning_calendar: {
          this_week: {
            monday: { hours: 0, lessons: 0 },
            tuesday: { hours: 0, lessons: 0 },
            wednesday: { hours: 0, lessons: 0 },
            thursday: { hours: 0, lessons: 0 },
            friday: { hours: 0, lessons: 0 },
            saturday: { hours: 0, lessons: 0 },
            sunday: { hours: 0, lessons: 0 }
          }
        }
      }, 'تم جلب لوحة المعلومات بنجاح');

    } catch (error) {
      console.error('❌ خطأ في جلب لوحة المعلومات:', error);
      sendError(res, 'حدث خطأ في جلب لوحة المعلومات');
    }
  }
}

module.exports = ProgressController;