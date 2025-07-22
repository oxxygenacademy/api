const { query } = require('../config/database');

class User {
  static async findById(id) {
    try {
      const users = await query('SELECT * FROM users WHERE id = ? LIMIT 1', [id]);
      return users[0] || null;
    } catch (error) {
      console.error('❌ خطأ في جلب المستخدم:', error);
      throw error;
    }
  }

  static async findByEmail(email) {
    try {
      const users = await query('SELECT * FROM users WHERE email = ? LIMIT 1', [email]);
      return users[0] || null;
    } catch (error) {
      console.error('❌ خطأ في البحث بالإيميل:', error);
      throw error;
    }
  }

  static async create(userData) {
    try {
      const { email, password, name } = userData;
      
      const result = await query(
        'INSERT INTO users (email, password, name) VALUES (?, ?, ?)',
        [email, password, name]
      );
      
      return result.insertId;
    } catch (error) {
      console.error('❌ خطأ في إنشاء المستخدم:', error);
      throw error;
    }
  }
}

module.exports = User;
