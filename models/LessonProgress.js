const { query } = require('../config/database');

class LessonProgress {
  // إنشاء أو تحديث التقدم
  static async updateProgress(userId, lessonId, progressData) {
    const {
      watched_duration,
      last_watched_position,
      completion_percentage
    } = progressData;

    // جلب معلومات الدرس
    const lesson = await query(`
      SELECT l.id, l.course_id, l.section_id, l.duration 
      FROM lessons l WHERE l.id = ?
    `, [lessonId]);

    if (!lesson[0]) {
      throw new Error('الدرس غير موجود');
    }

    const { course_id, section_id, duration } = lesson[0];
    
    // حساب نسبة الإكمال
    const calculatedPercentage = duration > 0 
      ? Math.min(Math.round((watched_duration / duration) * 100), 100)
      : completion_percentage || 0;
    
    const isCompleted = calculatedPercentage >= 90; // مكتمل إذا تم مشاهدة 90% أو أكثر

    // التحقق من وجود تقدم سابق
    const existingProgress = await query(`
      SELECT * FROM lesson_progress 
      WHERE user_id = ? AND lesson_id = ?
    `, [userId, lessonId]);

    let result;
    
    if (existingProgress.length > 0) {
      // تحديث التقدم الموجود
      result = await query(`
        UPDATE lesson_progress SET
          watched_duration = GREATEST(watched_duration, ?),
          completion_percentage = ?,
          is_completed = ?,
          last_watched_position = ?,
          watch_count = watch_count + 1,
          last_watched_at = CURRENT_TIMESTAMP,
          completed_at = CASE WHEN ? = 1 AND completed_at IS NULL THEN CURRENT_TIMESTAMP ELSE completed_at END
        WHERE user_id = ? AND lesson_id = ?
      `, [
        watched_duration,
        calculatedPercentage,
        isCompleted,
        last_watched_position,
        isCompleted,
        userId,
        lessonId
      ]);
    } else {
      // إنشاء تقدم جديد
      result = await query(`
        INSERT INTO lesson_progress (
          user_id, lesson_id, course_id, section_id, watched_duration, 
          completion_percentage, is_completed, last_watched_position,
          watch_count, first_watched_at, last_watched_at,
          completed_at
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, 1, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP, ?)
      `, [
        userId,
        lessonId,
        course_id,
        section_id,
        watched_duration,
        calculatedPercentage,
        isCompleted,
        last_watched_position,
        isCompleted ? new Date() : null
      ]);
    }

    // تحديث تقدم الكورس
    await this.updateCourseProgress(userId, course_id);

    return {
      lesson_id: lessonId,
      watched_duration,
      completion_percentage: calculatedPercentage,
      is_completed: isCompleted,
      last_watched_position
    };
  }

  // تحديث تقدم الكورس
  static async updateCourseProgress(userId, courseId) {
    // حساب إجمالي الدروس والمكتملة
    const stats = await query(`
      SELECT 
        COUNT(l.id) as total_lessons,
        COUNT(DISTINCT cs.id) as total_sections,
        SUM(l.duration) as total_duration,
        COUNT(CASE WHEN lp.is_completed = 1 THEN 1 END) as completed_lessons,
        COUNT(DISTINCT CASE WHEN lp.is_completed = 1 THEN cs.id END) as completed_sections,
        SUM(COALESCE(lp.watched_duration, 0)) as watched_duration,
        MAX(CASE WHEN lp.last_watched_at IS NOT NULL THEN l.id END) as current_lesson_id,
        MAX(CASE WHEN lp.last_watched_at IS NOT NULL THEN cs.id END) as current_section_id
      FROM lessons l
      JOIN course_sections cs ON l.section_id = cs.id
      LEFT JOIN lesson_progress lp ON l.id = lp.lesson_id AND lp.user_id = ?
      WHERE l.course_id = ? AND l.is_active = 1 AND cs.is_active = 1
    `, [userId, courseId]);

    const {
      total_lessons,
      total_sections,
      total_duration,
      completed_lessons,
      completed_sections,
      watched_duration,
      current_lesson_id,
      current_section_id
    } = stats[0];

    const completion_percentage = total_lessons > 0 
      ? Math.round((completed_lessons / total_lessons) * 100)
      : 0;

    const isCompleted = completion_percentage >= 100;

    // تحديث أو إنشاء تقدم الكورس
    const existingCourseProgress = await query(`
      SELECT id FROM course_progress 
      WHERE user_id = ? AND course_id = ?
    `, [userId, courseId]);

    if (existingCourseProgress.length > 0) {
      await query(`
        UPDATE course_progress SET
          total_lessons = ?,
          completed_lessons = ?,
          total_sections = ?,
          completed_sections = ?,
          completion_percentage = ?,
          total_duration = ?,
          watched_duration = ?,
          current_lesson_id = ?,
          current_section_id = ?,
          last_activity_at = CURRENT_TIMESTAMP,
          completed_at = CASE WHEN ? = 1 AND completed_at IS NULL THEN CURRENT_TIMESTAMP ELSE completed_at END
        WHERE user_id = ? AND course_id = ?
      `, [
        total_lessons,
        completed_lessons,
        total_sections,
        completed_sections,
        completion_percentage,
        total_duration,
        watched_duration,
        current_lesson_id,
        current_section_id,
        isCompleted,
        userId,
        courseId
      ]);
    } else {
      await query(`
        INSERT INTO course_progress (
          user_id, course_id, total_lessons, completed_lessons,
          total_sections, completed_sections, completion_percentage, 
          total_duration, watched_duration, current_lesson_id, current_section_id,
          completed_at
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
      `, [
        userId,
        courseId,
        total_lessons,
        completed_lessons,
        total_sections,
        completed_sections,
        completion_percentage,
        total_duration,
        watched_duration,
        current_lesson_id,
        current_section_id,
        isCompleted ? new Date() : null
      ]);
    }

    return {
      total_lessons,
      completed_lessons,
      total_sections,
      completed_sections,
      completion_percentage,
      total_duration,
      watched_duration
    };
  }

  // جلب تقدم المستخدم في الكورس
  static async getCourseProgress(userId, courseId) {
    const progress = await query(`
      SELECT * FROM course_progress 
      WHERE user_id = ? AND course_id = ?
    `, [userId, courseId]);

    if (progress.length === 0) {
      return null;
    }

    // جلب تفاصيل تقدم الدروس
    const lessonsProgress = await query(`
      SELECT 
        lp.*,
        l.title as lesson_title,
        l.order_index,
        cs.title as section_title,
        cs.order_index as section_order
      FROM lesson_progress lp
      JOIN lessons l ON lp.lesson_id = l.id
      JOIN course_sections cs ON l.section_id = cs.id
      WHERE lp.user_id = ? AND lp.course_id = ?
      ORDER BY cs.order_index, l.order_index
    `, [userId, courseId]);

    return {
      course_progress: progress[0],
      lessons_progress: lessonsProgress
    };
  }

  // جلب تقدم فصل محدد
  static async getSectionProgress(userId, sectionId) {
    const progress = await query(`
      SELECT 
        lp.*,
        l.title as lesson_title,
        l.order_index,
        l.duration as lesson_duration
      FROM lesson_progress lp
      JOIN lessons l ON lp.lesson_id = l.id
      WHERE lp.user_id = ? AND lp.section_id = ?
      ORDER BY l.order_index
    `, [userId, sectionId]);

    return progress;
  }
}

module.exports = LessonProgress;