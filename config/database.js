const mysql = require('mysql2/promise');
require('dotenv').config();

// إعداد Pool للاتصالات
const pool = mysql.createPool({
  host: process.env.DB_HOST || '45.84.205.153',
  port: process.env.DB_PORT || 3306,
  user: process.env.DB_USER || 'u860905067_656',
  password: process.env.DB_PASSWORD || '5ZC;d6=kQ',
  database: process.env.DB_NAME || 'u860905067_656',
  waitForConnections: true,
  connectionLimit: 10,
  queueLimit: 0,
  charset: 'utf8mb4',
  timezone: '+00:00'
});

// اختبار الاتصال
const testConnection = async () => {
  try {
    const connection = await pool.getConnection();
    console.log('✅ تم الاتصال بقاعدة البيانات MySQL بنجاح');
    connection.release();
    return true;
  } catch (error) {
    console.error('❌ خطأ في الاتصال بقاعدة البيانات:', error.message);
    return false;
  }
};

// تنفيذ استعلام
const query = async (sql, params = []) => {
  try {
    const [rows] = await pool.execute(sql, params);
    return rows;
  } catch (error) {
    console.error('خطأ في تنفيذ الاستعلام:', error.message);
    console.error('الاستعلام:', sql);
    console.error('المعاملات:', params);
    throw error;
  }
};

// تنفيذ استعلام مع معلومات إضافية
const queryWithInfo = async (sql, params = []) => {
  try {
    const result = await pool.execute(sql, params);
    return {
      rows: result[0],
      info: result[1]
    };
  } catch (error) {
    console.error('خطأ في تنفيذ الاستعلام:', error.message);
    throw error;
  }
};

// إغلاق Pool
const closePool = async () => {
  try {
    await pool.end();
    console.log('✅ تم إغلاق اتصالات قاعدة البيانات');
  } catch (error) {
    console.error('❌ خطأ في إغلاق اتصالات قاعدة البيانات:', error.message);
  }
};

module.exports = {
  pool,
  query,
  queryWithInfo,
  testConnection,
  closePool
};