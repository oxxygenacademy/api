const { query } = require('../config/database');

class Stats {
  // إحصائيات المستخدم الشاملة
  static async getUserStats(userId) {
    // الإحصائيات العامة
    const generalStats = await query(`
      SELECT 
        COUNT(DISTINCT e.course_id) as enrolled_courses,
        COUNT(DISTINCT CASE WHEN cp.completion_percentage = 100 THEN cp.course_id END) as completed_courses,
        AVG(cp.completion_percentage) as avg_completion,
        SUM(cp.watched_duration) as total_watched_time,
        COUNT(DISTINCT CASE WHEN cp.last_activity_at >= DATE_SUB(NOW(), INTERVAL 7 DAY) THEN cp.course_id END) as active_courses_week,
        COUNT(DISTINCT CASE WHEN lp.last_watched_at >= DATE_SUB(NOW(), INTERVAL 1 DAY) THEN lp.lesson_id END) as lessons_watched_today
      FROM enrollments e
      LEFT JOIN course_progress cp ON e.course_id = cp.course_id AND e.user_id = cp.user_id
      LEFT JOIN lesson_progress lp ON e.user_id = lp.user_id
      WHERE e.user_id = ?
    `, [userId]);

    // تقدم الكورسات
    const coursesProgress = await query(`
      SELECT 
        c.id,
        c.title,
        c.thumbnail,
        cat.name as category_name,
        cp.completion_percentage,
        cp.completed_lessons,
        cp.total_lessons,
        cp.watched_duration,
        cp.total_duration,
        cp.last_activity_at,
        cp.started_at,
        cp.completed_at,
        CASE 
          WHEN cp.completion_percentage = 100 THEN 'completed'
          WHEN cp.last_activity_at >= DATE_SUB(NOW(), INTERVAL 7 DAY) THEN 'active'
          WHEN cp.last_activity_at >= DATE_SUB(NOW(), INTERVAL 30 DAY) THEN 'inactive'
          ELSE 'abandoned'
        END as status
      FROM enrollments e
      JOIN courses c ON e.course_id = c.id
      LEFT JOIN course_categories cat ON c.category_id = cat.id
      LEFT JOIN course_progress cp ON e.course_id = cp.course_id AND e.user_id = cp.user_id
      WHERE e.user_id = ?
      ORDER BY cp.last_activity_at DESC NULLS LAST
    `, [userId]);

    // النشاط الأخير
    const recentActivity = await query(`
      SELECT 
        'lesson' as type,
        l.id,
        l.title,
        c.title as course_title,
        c.id as course_id,
        lp.last_watched_at as activity_date,
        lp.completion_percentage,
        lp.watched_duration,
        l.duration
      FROM lesson_progress lp
      JOIN lessons l ON lp.lesson_id = l.id
      JOIN courses c ON l.course_id = c.id
      WHERE lp.user_id = ?
      ORDER BY lp.last_watched_at DESC
      LIMIT 10
    `, [userId]);

    // إحصائيات أسبوعية
    const weeklyStats = await query(`
      SELECT 
        DATE(lp.last_watched_at) as date,
        COUNT(DISTINCT lp.lesson_id) as lessons_watched,
        SUM(lp.watched_duration) as total_time,
        COUNT(DISTINCT lp.course_id) as courses_accessed
      FROM lesson_progress lp
      WHERE lp.user_id = ? 
        AND lp.last_watched_at >= DATE_SUB(NOW(), INTERVAL 7 DAY)
      GROUP BY DATE(lp.last_watched_at)
      ORDER BY date DESC
    `, [userId]);

    return {
      general_stats: generalStats[0],
      courses_progress: coursesProgress,
      recent_activity: recentActivity,
      weekly_stats: weeklyStats
    };
  }

  // إحصائيات المنصة العامة
  static async getPlatformStats() {
    const stats = await query(`
      SELECT 
        (SELECT COUNT(*) FROM users WHERE is_active = 1) as total_users,
        (SELECT COUNT(*) FROM courses WHERE is_active = 1) as total_courses,
        (SELECT COUNT(*) FROM lessons WHERE is_active = 1) as total_lessons,
        (SELECT COUNT(*) FROM enrollments) as total_enrollments,
        (SELECT COUNT(*) FROM course_progress WHERE completion_percentage = 100) as completed_courses,
        (SELECT AVG(completion_percentage) FROM course_progress WHERE completion_percentage > 0) as avg_completion_rate,
        (SELECT SUM(watched_duration) FROM lesson_progress) as total_watch_time,
        (SELECT COUNT(DISTINCT user_id) FROM lesson_progress WHERE last_watched_at >= DATE_SUB(NOW(), INTERVAL 30 DAY)) as active_users_month
    `);

    return {
      platform_stats: stats[0]
    };
  }

  // إنجازات المستخدم
  static async getUserAchievements(userId) {
    const achievements = [];

    // إنجاز إكمال أول كورس
    const firstCourse = await query(`
      SELECT MIN(completed_at) as first_completion
      FROM course_progress 
      WHERE user_id = ? AND completion_percentage = 100
    `, [userId]);

    if (firstCourse[0]?.first_completion) {
      achievements.push({
        type: 'first_course',
        title: 'أول كورس مكتمل',
        description: 'أكملت أول كورس لك بنجاح',
        earned_at: firstCourse[0].first_completion
      });
    }

    // إنجاز عدد الكورسات المكتملة
    const completedCount = await query(`
      SELECT COUNT(*) as count
      FROM course_progress 
      WHERE user_id = ? AND completion_percentage = 100
    `, [userId]);

    const count = completedCount[0]?.count || 0;
    if (count >= 5) {
      achievements.push({
        type: 'course_master',
        title: 'خبير الكورسات',
        description: `أكملت ${count} كورس`,
        earned_at: new Date()
      });
    }

    return achievements;
  }

  // باقي الدوال...
  static async getCourseStatsForUser(userId, courseId) {
    // تنفيذ مبسط
    return null;
  }

  static async getCourseAnalytics(courseId) {
    // تنفيذ مبسط
    return { course_stats: null };
  }

  static async getComparisonStats(userId) {
    // تنفيذ مبسط
    return {};
  }
}

module.exports = Stats;