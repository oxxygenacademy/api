const { query } = require('../config/database');
const bcrypt = require('bcryptjs');

class User {
  // إنشاء مستخدم جديد
  static async create(userData) {
    const { email, password, name } = userData;
    
    // تشفير كلمة المرور
    const hashedPassword = await bcrypt.hash(password, 12);
    
    const result = await query(
      'INSERT INTO users (email, password, name) VALUES (?, ?, ?)',
      [email, hashedPassword, name]
    );

    return {
      id: result.insertId,
      email,
      name,
      created_at: new Date()
    };
  }

  // البحث بالبريد الإلكتروني
  static async findByEmail(email) {
    const users = await query(
      'SELECT * FROM users WHERE email = ? AND is_active = 1',
      [email]
    );
    return users[0] || null;
  }

  // البحث بالمعرف
  static async findById(id) {
    const users = await query(
      'SELECT id, email, name, avatar, email_verified, created_at FROM users WHERE id = ? AND is_active = 1',
      [id]
    );
    return users[0] || null;
  }

  // التحقق من كلمة المرور
  static async verifyPassword(plainPassword, hashedPassword) {
    return await bcrypt.compare(plainPassword, hashedPassword);
  }

  // تحديث بيانات المستخدم
  static async update(id, updateData) {
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

    values.push(id);

    await query(
      `UPDATE users SET ${fields.join(', ')}, updated_at = NOW() WHERE id = ?`,
      values
    );

    return await this.findById(id);
  }
}

module.exports = User;