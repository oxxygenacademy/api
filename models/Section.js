const { query } = require('../config/database');

class Section {
  // جلب فصول الكورس
  static async findByCourse(courseId, userId = null) {
    return await query(`
      SELECT 
        cs.*,
        COUNT(l.id) as lessons_count,
        SUM(l.duration) as total_duration,
        ${userId ? `
          COUNT(CASE WHEN lp.is_completed = 1 THEN 1 END) as completed_lessons,
          SUM(CASE WHEN lp.watched_duration > 0 THEN 1 ELSE 0 END) as started_lessons,
          ROUND(AVG(CASE WHEN lp.completion_percentage > 0 THEN lp.completion_percentage END), 2) as avg_progress
        ` : '0 as completed_lessons, 0 as started_lessons, 0 as avg_progress'}
      FROM course_sections cs
      LEFT JOIN lessons l ON cs.id = l.section_id AND l.is_active = 1
      ${userId ? 'LEFT JOIN lesson_progress lp ON l.id = lp.lesson_id AND lp.user_id = ?' : ''}
      WHERE cs.course_id = ? AND cs.is_active = 1
      GROUP BY cs.id
      ORDER BY cs.order_index ASC
    `, userId ? [userId, courseId] : [courseId]);
  }

  // جلب فصل بالتفصيل مع الدروس
  static async findByIdDetailed(sectionId, userId = null) {
    const sectionData = await query(`
      SELECT 
        cs.*,
        c.title as course_title,
        c.slug as course_slug,
        COUNT(l.id) as lessons_count,
        SUM(l.duration) as total_duration,
        ${userId ? `
          COUNT(CASE WHEN lp.is_completed = 1 THEN 1 END) as completed_lessons,
          AVG(CASE WHEN lp.completion_percentage > 0 THEN lp.completion_percentage END) as avg_progress
        ` : '0 as completed_lessons, 0 as avg_progress'}
      FROM course_sections cs
      LEFT JOIN courses c ON cs.course_id = c.id
      LEFT JOIN lessons l ON cs.id = l.section_id AND l.is_active = 1
      ${userId ? 'LEFT JOIN lesson_progress lp ON l.id = lp.lesson_id AND lp.user_id = ?' : ''}
      WHERE cs.id = ? AND cs.is_active = 1
      GROUP BY cs.id
    `, userId ? [userId, sectionId] : [sectionId]);

    if (sectionData.length === 0) {
      return null;
    }

    const section = sectionData[0];

    // جلب الدروس
    section.lessons = await query(`
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
    `, userId ? [userId, sectionId] : [sectionId]);

    return section;
  }

  // إنشاء فصل جديد
  static async create(sectionData) {
    const {
      course_id,
      title,
      description,
      order_index = 0
    } = sectionData;

    const result = await query(
      `INSERT INTO course_sections (course_id, title, description, order_index) 
       VALUES (?, ?, ?, ?)`,
      [course_id, title, description, order_index]
    );

    return {
      insertId: result.insertId,
      ...sectionData
    };
  }

  // تحديث فصل
  static async update(sectionId, updateData) {
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

    values.push(sectionId);

    await query(
      `UPDATE course_sections SET ${fields.join(', ')}, updated_at = NOW() WHERE id = ?`,
      values
    );

    return await this.findByIdDetailed(sectionId);
  }

  // حذف فصل
  static async delete(sectionId) {
    const result = await query(
      'UPDATE course_sections SET is_active = 0 WHERE id = ?',
      [sectionId]
    );
    return result.affectedRows > 0;
  }
}

module.exports = Section;