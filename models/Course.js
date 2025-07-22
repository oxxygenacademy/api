const { query } = require('../config/database');

class Course {
  // جلب جميع الكورسات مع الفلترة
  static async findAll(filters = {}) {
    let sql = `
      SELECT 
        c.*,
        cat.name as category_name,
        cat.slug as category_slug,
        cat.icon as category_icon,
        cat.color as category_color,
        COUNT(DISTINCT e.id) as enrolled_count,
        COUNT(DISTINCT l.id) as lessons_count,
        COUNT(DISTINCT cs.id) as sections_count,
        AVG(CASE WHEN cp.completion_percentage > 0 THEN cp.completion_percentage END) as avg_completion
      FROM courses c
      LEFT JOIN course_categories cat ON c.category_id = cat.id
      LEFT JOIN enrollments e ON c.id = e.course_id
      LEFT JOIN lessons l ON c.id = l.course_id AND l.is_active = 1
      LEFT JOIN course_sections cs ON c.id = cs.course_id AND cs.is_active = 1
      LEFT JOIN course_progress cp ON c.id = cp.course_id
      WHERE c.is_active = 1
    `;
    
    const params = [];
    
    // فلاتر البحث
    if (filters.category_id) {
      sql += ' AND c.category_id = ?';
      params.push(filters.category_id);
    }
    
    if (filters.category_slug) {
      sql += ' AND cat.slug = ?';
      params.push(filters.category_slug);
    }
    
    if (filters.difficulty) {
      sql += ' AND c.difficulty = ?';
      params.push(filters.difficulty);
    }
    
    if (filters.featured) {
      sql += ' AND c.is_featured = 1';
    }
    
    if (filters.search) {
      sql += ' AND (c.title LIKE ? OR c.description LIKE ? OR c.short_description LIKE ?)';
      params.push(`%${filters.search}%`, `%${filters.search}%`, `%${filters.search}%`);
    }
    
    if (filters.price_min) {
      sql += ' AND c.price >= ?';
      params.push(filters.price_min);
    }
    
    if (filters.price_max) {
      sql += ' AND c.price <= ?';
      params.push(filters.price_max);
    }
    
    if (filters.free_only) {
      sql += ' AND c.price = 0';
    }
    
    sql += ` 
      GROUP BY c.id 
      ORDER BY ${filters.sort || 'c.created_at'} ${filters.order || 'DESC'}
    `;
    
    if (filters.limit) {
      sql += ' LIMIT ?';
      params.push(parseInt(filters.limit));
      
      if (filters.offset) {
        sql += ' OFFSET ?';
        params.push(parseInt(filters.offset));
      }
    }
    
    return await query(sql, params);
  }

  // جلب كورس بالتفصيل مع الفصول والدروس
  static async findByIdDetailed(id, userId = null) {
    // معلومات الكورس الأساسية
    const courseData = await query(`
      SELECT 
        c.*,
        cat.name as category_name,
        cat.slug as category_slug,
        cat.icon as category_icon,
        cat.color as category_color,
        COUNT(DISTINCT l.id) as lessons_count,
        COUNT(DISTINCT cs.id) as sections_count,
        COUNT(DISTINCT e.id) as enrolled_count,
        ${userId ? `
          MAX(CASE WHEN e.user_id = ? THEN 1 ELSE 0 END) as is_enrolled,
          MAX(CASE WHEN e.user_id = ? THEN cp.completion_percentage ELSE NULL END) as user_progress,
          MAX(CASE WHEN e.user_id = ? THEN cp.current_section_id ELSE NULL END) as current_section_id,
          MAX(CASE WHEN e.user_id = ? THEN cp.current_lesson_id ELSE NULL END) as current_lesson_id
        ` : '0 as is_enrolled, NULL as user_progress, NULL as current_section_id, NULL as current_lesson_id'}
      FROM courses c
      LEFT JOIN course_categories cat ON c.category_id = cat.id
      LEFT JOIN lessons l ON c.id = l.course_id AND l.is_active = 1
      LEFT JOIN course_sections cs ON c.id = cs.course_id AND cs.is_active = 1
      LEFT JOIN enrollments e ON c.id = e.course_id
      ${userId ? 'LEFT JOIN course_progress cp ON c.id = cp.course_id AND cp.user_id = ?' : ''}
      WHERE c.id = ? AND c.is_active = 1
      GROUP BY c.id
    `, userId ? [userId, userId, userId, userId, userId, id] : [id]);

    if (courseData.length === 0) {
      return null;
    }

    const course = courseData[0];

    // جلب الفصول مع الدروس
    const sections = await query(`
      SELECT 
        cs.*,
        COUNT(l.id) as lessons_count,
        SUM(l.duration) as total_duration,
        ${userId ? `
          COUNT(CASE WHEN lp.is_completed = 1 THEN 1 END) as completed_lessons,
          SUM(CASE WHEN lp.watched_duration > 0 THEN 1 ELSE 0 END) as started_lessons
        ` : '0 as completed_lessons, 0 as started_lessons'}
      FROM course_sections cs
      LEFT JOIN lessons l ON cs.id = l.section_id AND l.is_active = 1
      ${userId ? 'LEFT JOIN lesson_progress lp ON l.id = lp.lesson_id AND lp.user_id = ?' : ''}
      WHERE cs.course_id = ? AND cs.is_active = 1
      GROUP BY cs.id
      ORDER BY cs.order_index ASC
    `, userId ? [userId, id] : [id]);

    // جلب الدروس لكل فصل
    for (let section of sections) {
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
      `, userId ? [userId, section.id] : [section.id]);
    }

    return {
      ...course,
      sections
    };
  }

  // جلب كورس بالمعرف أو Slug
  static async findBySlug(slug, userId = null) {
    const courses = await query(`
      SELECT id FROM courses WHERE slug = ? AND is_active = 1
    `, [slug]);

    if (courses.length === 0) {
      return null;
    }

    return await this.findByIdDetailed(courses[0].id, userId);
  }

  // جلب الكورسات المميزة
  static async findFeatured(limit = 6) {
    return await query(`
      SELECT 
        c.*,
        cat.name as category_name,
        cat.slug as category_slug,
        cat.icon as category_icon,
        COUNT(DISTINCT e.id) as enrolled_count,
        COUNT(DISTINCT l.id) as lessons_count
      FROM courses c
      LEFT JOIN course_categories cat ON c.category_id = cat.id
      LEFT JOIN enrollments e ON c.id = e.course_id
      LEFT JOIN lessons l ON c.id = l.course_id AND l.is_active = 1
      WHERE c.is_active = 1 AND c.is_featured = 1
      GROUP BY c.id
      ORDER BY c.created_at DESC
      LIMIT ?
    `, [limit]);
  }

  // جلب فئات الكورسات
  static async getCategories() {
    return await query(`
      SELECT 
        cat.*,
        COUNT(c.id) as course_count,
        COUNT(DISTINCT e.user_id) as total_enrolled
      FROM course_categories cat
      LEFT JOIN courses c ON cat.id = c.category_id AND c.is_active = 1
      LEFT JOIN enrollments e ON c.id = e.course_id
      WHERE cat.is_active = 1
      GROUP BY cat.id
      ORDER BY course_count DESC
    `);
  }

  // البحث المتقدم
  static async search(searchTerm, filters = {}) {
    let sql = `
      SELECT 
        c.*,
        cat.name as category_name,
        cat.slug as category_slug,
        cat.icon as category_icon,
        COUNT(DISTINCT e.id) as enrolled_count,
        COUNT(DISTINCT l.id) as lessons_count,
        CASE 
          WHEN c.title LIKE ? THEN 10
          WHEN c.short_description LIKE ? THEN 5
          WHEN c.description LIKE ? THEN 3
          ELSE 1
        END as relevance_score
      FROM courses c
      LEFT JOIN course_categories cat ON c.category_id = cat.id
      LEFT JOIN enrollments e ON c.id = e.course_id
      LEFT JOIN lessons l ON c.id = l.course_id AND l.is_active = 1
      WHERE c.is_active = 1 AND (
        c.title LIKE ?
        OR c.description LIKE ?
        OR c.short_description LIKE ?
        OR cat.name LIKE ?
      )
    `;
    
    const searchPattern = `%${searchTerm}%`;
    const params = [
      searchPattern, searchPattern, searchPattern, // for relevance calculation
      searchPattern, searchPattern, searchPattern, searchPattern // for WHERE clause
    ];
    
    if (filters.category_id) {
      sql += ' AND c.category_id = ?';
      params.push(filters.category_id);
    }
    
    if (filters.difficulty) {
      sql += ' AND c.difficulty = ?';
      params.push(filters.difficulty);
    }
    
    sql += ' GROUP BY c.id ORDER BY relevance_score DESC, c.created_at DESC';
    
    if (filters.limit) {
      sql += ' LIMIT ?';
      params.push(parseInt(filters.limit));
    }
    
    return await query(sql, params);
  }

  // إحصائيات الكورس
  static async getStats(courseId) {
    const stats = await query(`
      SELECT 
        c.total_lessons,
        c.total_duration,
        COUNT(DISTINCT e.user_id) as total_enrolled,
        COUNT(DISTINCT CASE WHEN cp.completion_percentage = 100 THEN cp.user_id END) as completed_users,
        AVG(CASE WHEN cp.completion_percentage > 0 THEN cp.completion_percentage END) as avg_completion,
        COUNT(DISTINCT CASE WHEN cp.last_activity_at >= DATE_SUB(NOW(), INTERVAL 7 DAY) THEN cp.user_id END) as active_users_week,
        COUNT(DISTINCT CASE WHEN cp.last_activity_at >= DATE_SUB(NOW(), INTERVAL 30 DAY) THEN cp.user_id END) as active_users_month
      FROM courses c
      LEFT JOIN enrollments e ON c.id = e.course_id
      LEFT JOIN course_progress cp ON c.id = cp.course_id
      WHERE c.id = ?
      GROUP BY c.id
    `, [courseId]);
    
    return stats[0] || null;
  }
}

module.exports = Course;