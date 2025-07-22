const { query } = require('../config/database');

class Enrollment {
  // إنشاء اشتراك جديد
  static async create(enrollmentData) {
    const {
      user_id,
      course_id,
      payment_status = 'free',
      payment_amount = 0
    } = enrollmentData;

    const result = await query(
      `INSERT INTO enrollments (user_id, course_id, payment_status, payment_amount) 
       VALUES (?, ?, ?, ?)`,
      [user_id, course_id, payment_status, payment_amount]
    );

    return {
      insertId: result.insertId,
      user_id,
      course_id,
      payment_status,
      payment_amount,
      enrolled_at: new Date()
    };
  }

  // البحث عن اشتراك بالمستخدم والكورس
  static async findByUserAndCourse(userId, courseId) {
    const enrollments = await query(
      'SELECT * FROM enrollments WHERE user_id = ? AND course_id = ?',
      [userId, courseId]
    );
    return enrollments[0] || null;
  }

  // جلب اشتراكات المستخدم
  static async findByUser(userId, filters = {}) {
    let sql = `
      SELECT 
        e.*,
        c.title as course_title,
        c.slug as course_slug,
        c.thumbnail as course_thumbnail,
        c.short_description as course_description,
        c.price as course_price,
        cat.name as category_name,
        cat.icon as category_icon,
        cp.completion_percentage,
        cp.last_activity_at
      FROM enrollments e
      JOIN courses c ON e.course_id = c.id
      LEFT JOIN course_categories cat ON c.category_id = cat.id
      LEFT JOIN course_progress cp ON e.course_id = cp.course_id AND e.user_id = cp.user_id
      WHERE e.user_id = ?
    `;

    const params = [userId];

    if (filters.status) {
      if (filters.status === 'completed') {
        sql += ' AND cp.completion_percentage = 100';
      } else if (filters.status === 'in_progress') {
        sql += ' AND cp.completion_percentage > 0 AND cp.completion_percentage < 100';
      } else if (filters.status === 'not_started') {
        sql += ' AND (cp.completion_percentage IS NULL OR cp.completion_percentage = 0)';
      }
    }

    sql += ' ORDER BY e.enrolled_at DESC';

    return await query(sql, params);
  }

  // جلب اشتراكات الكورس
  static async findByCourse(courseId) {
    return await query(`
      SELECT 
        e.*,
        u.name as user_name,
        u.email as user_email,
        cp.completion_percentage,
        cp.last_activity_at
      FROM enrollments e
      JOIN users u ON e.user_id = u.id
      LEFT JOIN course_progress cp ON e.course_id = cp.course_id AND e.user_id = cp.user_id
      WHERE e.course_id = ?
      ORDER BY e.enrolled_at DESC
    `, [courseId]);
  }

  // حذف اشتراك
  static async delete(enrollmentId) {
    const result = await query(
      'DELETE FROM enrollments WHERE id = ?',
      [enrollmentId]
    );
    return result.affectedRows > 0;
  }

  // تحديث حالة الدفع
  static async updatePaymentStatus(enrollmentId, status) {
    const result = await query(
      'UPDATE enrollments SET payment_status = ? WHERE id = ?',
      [status, enrollmentId]
    );
    return result.affectedRows > 0;
  }

  // إحصائيات الاشتراكات
  static async getStats() {
    const stats = await query(`
      SELECT 
        COUNT(*) as total_enrollments,
        COUNT(DISTINCT user_id) as unique_users,
        COUNT(DISTINCT course_id) as unique_courses,
        COUNT(CASE WHEN payment_status = 'completed' THEN 1 END) as paid_enrollments,
        COUNT(CASE WHEN payment_status = 'free' THEN 1 END) as free_enrollments,
        SUM(payment_amount) as total_revenue
      FROM enrollments
    `);

    return stats[0];
  }
}

module.exports = Enrollment;