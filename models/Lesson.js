const { query } = require('../config/database');

class Lesson {
  // البحث عن درس بالمعرف مع تفاصيل كاملة
  static async findById(id, userId = null) {
    try {
      const lessons = await query(
        `SELECT 
          l.*,
          cs.title as section_title,
          cs.order_index as section_order,
          c.title as course_title,
          c.id as course_id,
          COALESCE(lp.is_completed, 0) as is_completed,
          COALESCE(lp.watch_time, 0) as watch_time,
          COALESCE(lp.progress_percentage, 0) as progress_percentage,
          lp.last_watched_at,
          lp.notes,
          lp.bookmarked
        FROM lessons l
        JOIN course_sections cs ON l.section_id = cs.id
        JOIN courses c ON l.course_id = c.id
        LEFT JOIN lesson_progress lp ON l.id = lp.lesson_id AND lp.user_id = ?
        WHERE l.id = ? AND l.is_active = 1 AND cs.is_active = 1 AND c.is_active = 1`,
        [userId || 0, id]
      );

      return lessons[0] || null;
    } catch (error) {
      console.error('خطأ في جلب الدرس:', error);
      throw error;
    }
  }

  // جلب الدرس التالي (مُصحح)
  static async getNextLesson(currentLesson) {
    try {
      console.log('🔍 البحث عن الدرس التالي للدرس:', currentLesson.id);
      
      // البحث عن الدرس التالي في نفس الفصل أولاً
      const nextInSection = await query(
        `SELECT 
          l.*,
          cs.title as section_title,
          0 as is_completed
        FROM lessons l
        JOIN course_sections cs ON l.section_id = cs.id
        WHERE l.section_id = ? 
          AND l.order_index > ? 
          AND l.is_active = 1 
          AND cs.is_active = 1
        ORDER BY l.order_index ASC
        LIMIT 1`,
        [currentLesson.section_id, currentLesson.order_index]
      );

      if (nextInSection.length > 0) {
        console.log('✅ تم العثور على الدرس التالي في نفس الفصل');
        return nextInSection[0];
      }

      // البحث عن أول درس في الفصل التالي
      const nextInCourse = await query(
        `SELECT 
          l.*,
          cs.title as section_title,
          0 as is_completed
        FROM lessons l
        JOIN course_sections cs ON l.section_id = cs.id
        WHERE l.course_id = ? 
          AND cs.order_index > (
            SELECT cs2.order_index 
            FROM course_sections cs2 
            WHERE cs2.id = ?
            LIMIT 1
          )
          AND l.is_active = 1 
          AND cs.is_active = 1
        ORDER BY cs.order_index ASC, l.order_index ASC
        LIMIT 1`,
        [currentLesson.course_id, currentLesson.section_id]
      );

      if (nextInCourse.length > 0) {
        console.log('✅ تم العثور على الدرس التالي في فصل لاحق');
        return nextInCourse[0];
      }

      console.log('ℹ️ لا يوجد درس تالي');
      return null;

    } catch (error) {
      console.error('خطأ في جلب الدرس التالي:', error);
      throw error;
    }
  }

  // جلب الدرس السابق (مُصحح)
  static async getPreviousLesson(currentLesson) {
    try {
      console.log('🔍 البحث عن الدرس السابق للدرس:', currentLesson.id);
      
      // البحث عن الدرس السابق في نفس الفصل أولاً
      const prevInSection = await query(
        `SELECT 
          l.*,
          cs.title as section_title,
          0 as is_completed
        FROM lessons l
        JOIN course_sections cs ON l.section_id = cs.id
        WHERE l.section_id = ? 
          AND l.order_index < ? 
          AND l.is_active = 1 
          AND cs.is_active = 1
        ORDER BY l.order_index DESC
        LIMIT 1`,
        [currentLesson.section_id, currentLesson.order_index]
      );

      if (prevInSection.length > 0) {
        console.log('✅ تم العثور على الدرس السابق في نفس الفصل');
        return prevInSection[0];
      }

      // البحث عن آخر درس في الفصل السابق
      const prevInCourse = await query(
        `SELECT 
          l.*,
          cs.title as section_title,
          0 as is_completed
        FROM lessons l
        JOIN course_sections cs ON l.section_id = cs.id
        WHERE l.course_id = ? 
          AND cs.order_index < (
            SELECT cs2.order_index 
            FROM course_sections cs2 
            WHERE cs2.id = ?
            LIMIT 1
          )
          AND l.is_active = 1 
          AND cs.is_active = 1
        ORDER BY cs.order_index DESC, l.order_index DESC
        LIMIT 1`,
        [currentLesson.course_id, currentLesson.section_id]
      );

      if (prevInCourse.length > 0) {
        console.log('✅ تم العثور على الدرس السابق في فصل سابق');
        return prevInCourse[0];
      }

      console.log('ℹ️ لا يوجد درس سابق');
      return null;

    } catch (error) {
      console.error('خطأ في جلب الدرس السابق:', error);
      throw error;
    }
  }

  // جلب دروس الكورس
  static async getCourseeLessons(courseId, userId = null) {
    try {
      return await query(
        `SELECT 
          l.*,
          cs.title as section_title,
          cs.order_index as section_order,
          cs.id as section_id,
          COALESCE(lp.is_completed, 0) as is_completed,
          COALESCE(lp.watch_time, 0) as watch_time,
          COALESCE(lp.progress_percentage, 0) as progress_percentage,
          lp.last_watched_at
        FROM lessons l
        JOIN course_sections cs ON l.section_id = cs.id
        LEFT JOIN lesson_progress lp ON l.id = lp.lesson_id AND lp.user_id = ?
        WHERE l.course_id = ? AND l.is_active = 1 AND cs.is_active = 1
        ORDER BY cs.order_index ASC, l.order_index ASC`,
        [userId || 0, courseId]
      );
    } catch (error) {
      console.error('خطأ في جلب دروس الكورس:', error);
      throw error;
    }
  }

  // جلب دروس الفصل
  static async getSectionLessons(sectionId, userId = null) {
    try {
      return await query(
        `SELECT 
          l.*,
          cs.title as section_title,
          cs.order_index as section_order,
          COALESCE(lp.is_completed, 0) as is_completed,
          COALESCE(lp.watch_time, 0) as watch_time,
          COALESCE(lp.progress_percentage, 0) as progress_percentage,
          lp.last_watched_at
        FROM lessons l
        JOIN course_sections cs ON l.section_id = cs.id
        LEFT JOIN lesson_progress lp ON l.id = lp.lesson_id AND lp.user_id = ?
        WHERE l.section_id = ? AND l.is_active = 1 AND cs.is_active = 1
        ORDER BY l.order_index ASC`,
        [userId || 0, sectionId]
      );
    } catch (error) {
      console.error('خطأ في جلب دروس الفصل:', error);
      throw error;
    }
  }

  // تسجيل مشاهدة
  static async recordWatchTime(lessonId, userId, watchData) {
    try {
      const { watch_time, current_position, total_duration } = watchData;
      
      // حساب نسبة التقدم
      const progressPercentage = total_duration > 0 
        ? Math.min(Math.round((current_position / total_duration) * 100), 100)
        : 0;

      // التحقق من وجود تقدم سابق
      const existingProgress = await query(
        'SELECT id FROM lesson_progress WHERE lesson_id = ? AND user_id = ?',
        [lessonId, userId]
      );

      if (existingProgress.length > 0) {
        // تحديث التقدم الموجود
        await query(
          `UPDATE lesson_progress SET 
            watch_time = GREATEST(watch_time, ?),
            current_position = ?,
            progress_percentage = ?,
            last_watched_at = NOW(),
            updated_at = NOW()
          WHERE lesson_id = ? AND user_id = ?`,
          [watch_time, current_position, progressPercentage, lessonId, userId]
        );
      } else {
        // إنشاء تقدم جديد
        await query(
          `INSERT INTO lesson_progress 
            (lesson_id, user_id, watch_time, current_position, progress_percentage, last_watched_at) 
          VALUES (?, ?, ?, ?, ?, NOW())`,
          [lessonId, userId, watch_time, current_position, progressPercentage]
        );
      }

      return {
        lesson_id: lessonId,
        watch_time,
        current_position,
        progress_percentage,
        updated_at: new Date().toISOString()
      };

    } catch (error) {
      console.error('خطأ في تسجيل المشاهدة:', error);
      throw error;
    }
  }

  // تحديد كمكتمل
  static async markAsCompleted(lessonId, userId) {
    try {
      // التحقق من وجود تقدم سابق
      const existingProgress = await query(
        'SELECT id FROM lesson_progress WHERE lesson_id = ? AND user_id = ?',
        [lessonId, userId]
      );

      if (existingProgress.length > 0) {
        // تحديث التقدم الموجود
        await query(
          `UPDATE lesson_progress SET 
            is_completed = 1,
            progress_percentage = 100,
            completed_at = NOW(),
            updated_at = NOW()
          WHERE lesson_id = ? AND user_id = ?`,
          [lessonId, userId]
        );
      } else {
        // إنشاء تقدم جديد
        await query(
          `INSERT INTO lesson_progress 
            (lesson_id, user_id, is_completed, progress_percentage, completed_at) 
          VALUES (?, ?, 1, 100, NOW())`,
          [lessonId, userId]
        );
      }

      // جلب معلومات الدرس والكورس
      const lesson = await query(
        'SELECT course_id, section_id FROM lessons WHERE id = ?',
        [lessonId]
      );

      if (lesson.length === 0) {
        throw new Error('الدرس غير موجود');
      }

      // حساب تقدم الكورس
      const courseProgress = await this.calculateCourseProgress(lesson[0].course_id, userId);

      return {
        lesson_progress: {
          lesson_id: lessonId,
          is_completed: true,
          completed_at: new Date().toISOString(),
          progress_percentage: 100
        },
        course_progress: courseProgress
      };

    } catch (error) {
      console.error('خطأ في تحديد الدرس كمكتمل:', error);
      throw error;
    }
  }

  // حساب تقدم الكورس
  static async calculateCourseProgress(courseId, userId) {
    try {
      const stats = await query(
        `SELECT 
          COUNT(l.id) as total_lessons,
          COUNT(CASE WHEN lp.is_completed = 1 THEN 1 END) as completed_lessons
        FROM lessons l
        LEFT JOIN lesson_progress lp ON l.id = lp.lesson_id AND lp.user_id = ?
        WHERE l.course_id = ? AND l.is_active = 1`,
        [userId, courseId]
      );

      const { total_lessons, completed_lessons } = stats[0];
      const progress_percentage = total_lessons > 0 
        ? Math.round((completed_lessons / total_lessons) * 100)
        : 0;

      return {
        course_id: courseId,
        total_lessons,
        completed_lessons,
        progress_percentage
      };

    } catch (error) {
      console.error('خطأ في حساب تقدم الكورس:', error);
      throw error;
    }
  }

  // جلب موارد الدرس
  static async getLessonResources(lessonId) {
    try {
      return await query(
        `SELECT 
          id, title, description, file_url, file_type, file_size, download_count
        FROM lesson_resources 
        WHERE lesson_id = ? AND is_active = 1
        ORDER BY order_index ASC`,
        [lessonId]
      );
    } catch (error) {
      console.error('خطأ في جلب موارد الدرس:', error);
      throw error;
    }
  }

  // التحقق من إمكانية الوصول للدرس
  static async checkLessonAccess(lessonId, userId) {
    try {
      const result = await query(
        `SELECT 
          l.is_free,
          l.course_id,
          CASE WHEN e.id IS NOT NULL THEN 1 ELSE 0 END as is_enrolled
        FROM lessons l
        LEFT JOIN enrollments e ON l.course_id = e.course_id AND e.user_id = ? AND e.is_active = 1
        WHERE l.id = ?`,
        [userId, lessonId]
      );

      if (result.length === 0) {
        return { hasAccess: false, reason: 'lesson_not_found' };
      }

      const { is_free, is_enrolled } = result[0];

      if (is_free || is_enrolled) {
        return { hasAccess: true };
      }

      return { hasAccess: false, reason: 'not_enrolled' };

    } catch (error) {
      console.error('خطأ في التحقق من إمكانية الوصول:', error);
      throw error;
    }
  }
}

module.exports = Lesson;
