const { query } = require('../config/database');

class Lesson {
  // جلب دروس الكورس
  static async findByCourse(courseId, userId = null) {
    const sql = `
      SELECT 
        l.*,
        cs.title as section_title,
        cs.order_index as section_order,
        ${userId ? `
          lp.watched_duration,
          lp.completion_percentage,
          lp.is_completed,
          lp.last_watched_position,
          lp.last_watched_at,
          lp.watch_count
        ` : `
          0 as watched_duration,
          0 as completion_percentage,
          0 as is_completed,
          0 as last_watched_position,
          NULL as last_watched_at,
          0 as watch_count
        `}
      FROM lessons l
      JOIN course_sections cs ON l.section_id = cs.id
      ${userId ? `
        LEFT JOIN lesson_progress lp ON l.id = lp.lesson_id AND lp.user_id = ?
      ` : ''}
      WHERE l.course_id = ? AND l.is_active = 1 AND cs.is_active = 1
      ORDER BY cs.order_index ASC, l.order_index ASC
    `;
    
    const params = userId ? [userId, courseId] : [courseId];
    return await query(sql, params);
  }

  // جلب درس محدد
  static async findById(id, userId = null) {
    const sql = `
      SELECT 
        l.*,
        c.title as course_title,
        c.id as course_id,
        cs.title as section_title,
        cs.id as section_id,
        ${userId ? `
          lp.watched_duration,
          lp.completion_percentage,
          lp.is_completed,
          lp.last_watched_position,
          lp.last_watched_at,
          lp.watch_count,
          e.id as enrollment_id
        ` : `
          0 as watched_duration,
          0 as completion_percentage,
          0 as is_completed,
          0 as last_watched_position,
          NULL as last_watched_at,
          0 as watch_count,
          NULL as enrollment_id
        `}
      FROM lessons l
      JOIN courses c ON l.course_id = c.id
      JOIN course_sections cs ON l.section_id = cs.id
      ${userId ? `
        LEFT JOIN lesson_progress lp ON l.id = lp.lesson_id AND lp.user_id = ?
        LEFT JOIN enrollments e ON l.course_id = e.course_id AND e.user_id = ?
      ` : ''}
      WHERE l.id = ? AND l.is_active = 1 AND c.is_active = 1 AND cs.is_active = 1
    `;
    
    const params = userId ? [userId, userId, id] : [id];
    const lessons = await query(sql, params);
    return lessons[0] || null;
  }

  // جلب الدرس التالي
  static async getNextLesson(courseId, currentOrder, userId = null) {
    const sql = `
      SELECT 
        l.*,
        cs.title as section_title,
        ${userId ? `
          lp.is_completed
        ` : `0 as is_completed`}
      FROM lessons l
      JOIN course_sections cs ON l.section_id = cs.id
      ${userId ? `
        LEFT JOIN lesson_progress lp ON l.id = lp.lesson_id AND lp.user_id = ?
      ` : ''}
      WHERE l.course_id = ? AND (
        (cs.order_index > (
          SELECT cs2.order_index 
          FROM lessons l2 
          JOIN course_sections cs2 ON l2.section_id = cs2.id 
          WHERE l2.course_id = ? AND l2.order_index = ?
        )) OR 
        (cs.order_index = (
          SELECT cs2.order_index 
          FROM lessons l2 
          JOIN course_sections cs2 ON l2.section_id = cs2.id 
          WHERE l2.course_id = ? AND l2.order_index = ?
        ) AND l.order_index > ?)
      ) AND l.is_active = 1 AND cs.is_active = 1
      ORDER BY cs.order_index ASC, l.order_index ASC
      LIMIT 1
    `;
    
    const params = userId ? 
      [userId, courseId, courseId, currentOrder, courseId, currentOrder, currentOrder] : 
      [courseId, courseId, currentOrder, courseId, currentOrder, currentOrder];
    const lessons = await query(sql, params);
    return lessons[0] || null;
  }

  // جلب الدرس السابق
  static async getPreviousLesson(courseId, currentOrder, userId = null) {
    const sql = `
      SELECT 
        l.*,
        cs.title as section_title,
        ${userId ? `
          lp.is_completed
        ` : `0 as is_completed`}
      FROM lessons l
      JOIN course_sections cs ON l.section_id = cs.id
      ${userId ? `
        LEFT JOIN lesson_progress lp ON l.id = lp.lesson_id AND lp.user_id = ?
      ` : ''}
      WHERE l.course_id = ? AND (
        (cs.order_index < (
          SELECT cs2.order_index 
          FROM lessons l2 
          JOIN course_sections cs2 ON l2.section_id = cs2.id 
          WHERE l2.course_id = ? AND l2.order_index = ?
        )) OR 
        (cs.order_index = (
          SELECT cs2.order_index 
          FROM lessons l2 
          JOIN course_sections cs2 ON l2.section_id = cs2.id 
          WHERE l2.course_id = ? AND l2.order_index = ?
        ) AND l.order_index < ?)
      ) AND l.is_active = 1 AND cs.is_active = 1
      ORDER BY cs.order_index DESC, l.order_index DESC
      LIMIT 1
    `;
    
    const params = userId ? 
      [userId, courseId, courseId, currentOrder, courseId, currentOrder, currentOrder] : 
      [courseId, courseId, currentOrder, courseId, currentOrder, currentOrder];
    const lessons = await query(sql, params);
    return lessons[0] || null;
  }

  // جلب دروس الفصل
  static async findBySection(sectionId, userId = null) {
    const sql = `
      SELECT 
        l.*,
        ${userId ? `
          lp.watched_duration,
          lp.completion_percentage,
          lp.is_completed,
          lp.last_watched_position,
          lp.last_watched_at,
          lp.watch_count
        ` : `
          0 as watched_duration,
          0 as completion_percentage,
          0 as is_completed,
          0 as last_watched_position,
          NULL as last_watched_at,
          0 as watch_count
        `}
      FROM lessons l
      ${userId ? `
        LEFT JOIN lesson_progress lp ON l.id = lp.lesson_id AND lp.user_id = ?
      ` : ''}
      WHERE l.section_id = ? AND l.is_active = 1
      ORDER BY l.order_index ASC
    `;
    
    const params = userId ? [userId, sectionId] : [sectionId];
    return await query(sql, params);
  }

  // تحديث إحصائيات الدرس
  static async updateStats(lessonId) {
    // تحديث عدد المشاهدات
    await query(`
      UPDATE lessons l
      SET l.view_count = (
        SELECT COUNT(DISTINCT lp.user_id)
        FROM lesson_progress lp
        WHERE lp.lesson_id = l.id AND lp.watch_count > 0
      )
      WHERE l.id = ?
    `, [lessonId]);
  }

  // إنشاء درس جديد
  static async create(lessonData) {
    const {
      course_id,
      section_id,
      title,
      description,
      video_url,
      duration = 0,
      order_index = 0,
      is_preview = false
    } = lessonData;

    const result = await query(
      `INSERT INTO lessons (course_id, section_id, title, description, video_url, duration, order_index, is_preview) 
       VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
      [course_id, section_id, title, description, video_url, duration, order_index, is_preview]
    );

    return {
      insertId: result.insertId,
      ...lessonData
    };
  }

  // تحديث درس
  static async update(lessonId, updateData) {
    const fields = [];
    const values = [];

    Object.keys(updateData).forEach(key => {
      if (updateData[key] !== undefined && key !== 'id') {
        fields.push(`${key} = ?`);
        values.push(updateData[key]);
      }
    });

    if (fields.length === 0) {
      throw new Error('لا توجد بيانات للتحديث');
    }

    values.push(lessonId);

    await query(
      `UPDATE lessons SET ${fields.join(', ')}, updated_at = NOW() WHERE id = ?`,
      values
    );

    return await this.findById(lessonId);
  }

  // حذف درس (soft delete)
  static async delete(lessonId) {
    const result = await query(
      'UPDATE lessons SET is_active = 0 WHERE id = ?',
      [lessonId]
    );
    return result.affectedRows > 0;
  }
}

module.exports = Lesson;