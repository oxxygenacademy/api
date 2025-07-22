const mysql = require('mysql2/promise');
const fs = require('fs');
const path = require('path');
require('dotenv').config();

async function setupDatabase() {
  console.log('🚀 بدء إعداد قاعدة البيانات المحدثة...');
  
  let connection;
  
  try {
    // الاتصال بـ MySQL بدون تحديد قاعدة بيانات
    connection = await mysql.createConnection({
      host: process.env.DB_HOST || 'localhost',
      port: process.env.DB_PORT || 3306,
      user: process.env.DB_USER || 'root',
      password: process.env.DB_PASSWORD || '',
      charset: 'utf8mb4'
    });

    console.log('✅ تم الاتصال بخادم MySQL');

    // إنشاء قاعدة البيانات
    await connection.execute(`CREATE DATABASE IF NOT EXISTS ${process.env.DB_NAME} CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci`);
    console.log(`✅ تم إنشاء قاعدة البيانات: ${process.env.DB_NAME}`);

    // الاتصال بقاعدة البيانات
    await connection.changeUser({ database: process.env.DB_NAME });

    // إنشاء الجداول بالترتيب الصحيح
    const tables = [
      // 1. جدول المستخدمين
      {
        name: 'users',
        sql: `
          CREATE TABLE IF NOT EXISTS users (
            id INT PRIMARY KEY AUTO_INCREMENT,
            email VARCHAR(255) UNIQUE NOT NULL,
            password VARCHAR(255) NOT NULL,
            name VARCHAR(255) NOT NULL,
            avatar VARCHAR(500) NULL,
            is_active BOOLEAN DEFAULT TRUE,
            email_verified BOOLEAN DEFAULT FALSE,
            created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
            updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
            
            INDEX idx_email (email),
            INDEX idx_active (is_active),
            INDEX idx_created (created_at)
          ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci
        `
      },

      // 2. جدول أقسام الكورسات
      {
        name: 'course_categories',
        sql: `
          CREATE TABLE IF NOT EXISTS course_categories (
            id INT PRIMARY KEY AUTO_INCREMENT,
            name VARCHAR(255) NOT NULL,
            slug VARCHAR(255) UNIQUE NOT NULL,
            description TEXT,
            icon VARCHAR(500),
            color VARCHAR(50),
            is_active BOOLEAN DEFAULT TRUE,
            created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
            updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
            
            INDEX idx_slug (slug),
            INDEX idx_active (is_active)
          ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci
        `
      },

      // 3. جدول الكورسات
      {
        name: 'courses',
        sql: `
          CREATE TABLE IF NOT EXISTS courses (
            id INT PRIMARY KEY AUTO_INCREMENT,
            category_id INT NOT NULL,
            title VARCHAR(500) NOT NULL,
            slug VARCHAR(500) UNIQUE NOT NULL,
            description TEXT,
            short_description VARCHAR(1000),
            price DECIMAL(10,2) DEFAULT 0.00,
            thumbnail VARCHAR(500),
            video_preview VARCHAR(500),
            difficulty ENUM('beginner', 'intermediate', 'advanced') DEFAULT 'beginner',
            language VARCHAR(50) DEFAULT 'ar',
            is_active BOOLEAN DEFAULT TRUE,
            is_featured BOOLEAN DEFAULT FALSE,
            total_duration INT DEFAULT 0,
            total_lessons INT DEFAULT 0,
            created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
            updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
            
            FOREIGN KEY (category_id) REFERENCES course_categories(id) ON DELETE RESTRICT,
            INDEX idx_category (category_id),
            INDEX idx_slug (slug),
            INDEX idx_active (is_active),
            INDEX idx_featured (is_featured),
            INDEX idx_difficulty (difficulty),
            INDEX idx_created (created_at)
          ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci
        `
      },

      // 4. جدول فصول الكورس
      {
        name: 'course_sections',
        sql: `
          CREATE TABLE IF NOT EXISTS course_sections (
            id INT PRIMARY KEY AUTO_INCREMENT,
            course_id INT NOT NULL,
            title VARCHAR(500) NOT NULL,
            description TEXT,
            order_index INT DEFAULT 0,
            is_active BOOLEAN DEFAULT TRUE,
            created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
            updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
            
            FOREIGN KEY (course_id) REFERENCES courses(id) ON DELETE CASCADE,
            INDEX idx_course (course_id),
            INDEX idx_order (course_id, order_index),
            INDEX idx_active (is_active)
          ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci
        `
      },

      // 5. جدول الدروس
      {
        name: 'lessons',
        sql: `
          CREATE TABLE IF NOT EXISTS lessons (
            id INT PRIMARY KEY AUTO_INCREMENT,
            course_id INT NOT NULL,
            section_id INT NOT NULL,
            title VARCHAR(500) NOT NULL,
            description TEXT,
            video_url VARCHAR(1000),
            duration INT DEFAULT 0,
            order_index INT DEFAULT 0,
            is_preview BOOLEAN DEFAULT FALSE,
            is_active BOOLEAN DEFAULT TRUE,
            created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
            updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
            
            FOREIGN KEY (course_id) REFERENCES courses(id) ON DELETE CASCADE,
            FOREIGN KEY (section_id) REFERENCES course_sections(id) ON DELETE CASCADE,
            INDEX idx_course (course_id),
            INDEX idx_section (section_id),
            INDEX idx_order (section_id, order_index),
            INDEX idx_active (is_active),
            INDEX idx_preview (is_preview)
          ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci
        `
      },

      // 6. جدول الاشتراكات
      {
        name: 'enrollments',
        sql: `
          CREATE TABLE IF NOT EXISTS enrollments (
            id INT PRIMARY KEY AUTO_INCREMENT,
            user_id INT NOT NULL,
            course_id INT NOT NULL,
            payment_status ENUM('pending', 'completed', 'failed', 'free') DEFAULT 'free',
            payment_amount DECIMAL(10,2) DEFAULT 0.00,
            enrolled_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
            expires_at TIMESTAMP NULL,
            completed_at TIMESTAMP NULL,
            
            FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE,
            FOREIGN KEY (course_id) REFERENCES courses(id) ON DELETE CASCADE,
            UNIQUE KEY unique_enrollment (user_id, course_id),
            INDEX idx_user (user_id),
            INDEX idx_course (course_id),
            INDEX idx_payment_status (payment_status),
            INDEX idx_enrolled (enrolled_at)
          ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci
        `
      },

      // 7. جدول تقدم الدروس
      {
        name: 'lesson_progress',
        sql: `
          CREATE TABLE IF NOT EXISTS lesson_progress (
            id INT PRIMARY KEY AUTO_INCREMENT,
            user_id INT NOT NULL,
            lesson_id INT NOT NULL,
            course_id INT NOT NULL,
            section_id INT NOT NULL,
            watched_duration INT DEFAULT 0,
            completion_percentage INT DEFAULT 0,
            is_completed BOOLEAN DEFAULT FALSE,
            last_watched_position INT DEFAULT 0,
            watch_count INT DEFAULT 0,
            first_watched_at TIMESTAMP NULL,
            last_watched_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
            completed_at TIMESTAMP NULL,
            created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
            
            FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE,
            FOREIGN KEY (lesson_id) REFERENCES lessons(id) ON DELETE CASCADE,
            FOREIGN KEY (course_id) REFERENCES courses(id) ON DELETE CASCADE,
            FOREIGN KEY (section_id) REFERENCES course_sections(id) ON DELETE CASCADE,
            UNIQUE KEY unique_lesson_progress (user_id, lesson_id),
            INDEX idx_user_course (user_id, course_id),
            INDEX idx_user_section (user_id, section_id),
            INDEX idx_completion (completion_percentage),
            INDEX idx_completed (is_completed),
            INDEX idx_last_watched (last_watched_at)
          ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci
        `
      },

      // 8. جدول تقدم الكورسات
      {
        name: 'course_progress',
        sql: `
          CREATE TABLE IF NOT EXISTS course_progress (
            id INT PRIMARY KEY AUTO_INCREMENT,
            user_id INT NOT NULL,
            course_id INT NOT NULL,
            total_lessons INT DEFAULT 0,
            completed_lessons INT DEFAULT 0,
            total_sections INT DEFAULT 0,
            completed_sections INT DEFAULT 0,
            completion_percentage INT DEFAULT 0,
            total_duration INT DEFAULT 0,
            watched_duration INT DEFAULT 0,
            current_lesson_id INT NULL,
            current_section_id INT NULL,
            last_activity_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
            started_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
            completed_at TIMESTAMP NULL,
            
            FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE,
            FOREIGN KEY (course_id) REFERENCES courses(id) ON DELETE CASCADE,
            FOREIGN KEY (current_lesson_id) REFERENCES lessons(id) ON DELETE SET NULL,
            FOREIGN KEY (current_section_id) REFERENCES course_sections(id) ON DELETE SET NULL,
            UNIQUE KEY unique_course_progress (user_id, course_id),
            INDEX idx_user (user_id),
            INDEX idx_course (course_id),
            INDEX idx_completion (completion_percentage),
            INDEX idx_activity (last_activity_at)
          ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci
        `
      },

      // 9. جدول الجلسات
      {
        name: 'sessions',
        sql: `
          CREATE TABLE IF NOT EXISTS sessions (
            id INT PRIMARY KEY AUTO_INCREMENT,
            user_id INT NOT NULL,
            token VARCHAR(500) NOT NULL UNIQUE,
            device_info VARCHAR(500),
            ip_address VARCHAR(45),
            user_agent TEXT,
            is_active BOOLEAN DEFAULT TRUE,
            expires_at TIMESTAMP NOT NULL,
            last_used_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
            created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
            
            FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE,
            INDEX idx_token (token),
            INDEX idx_user (user_id),
            INDEX idx_expires (expires_at),
            INDEX idx_active (is_active)
          ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci
        `
      },

      // 10. جدول المفضلات
      {
        name: 'user_favorites',
        sql: `
          CREATE TABLE IF NOT EXISTS user_favorites (
            id INT PRIMARY KEY AUTO_INCREMENT,
            user_id INT NOT NULL,
            course_id INT NOT NULL,
            created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
            
            FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE,
            FOREIGN KEY (course_id) REFERENCES courses(id) ON DELETE CASCADE,
            UNIQUE KEY unique_favorite (user_id, course_id),
            INDEX idx_user_favorites (user_id),
            INDEX idx_course_favorites (course_id)
          ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci
        `
      }
    ];

    // إنشاء الجداول
    for (const table of tables) {
      try {
        await connection.execute(table.sql);
        console.log(`✅ تم إنشاء جدول: ${table.name}`);
      } catch (error) {
        if (error.code === 'ER_TABLE_EXISTS_ERROR') {
          console.log(`⚠️  الجدول موجود مسبقاً: ${table.name}`);
        } else {
          console.error(`❌ خطأ في إنشاء جدول ${table.name}:`, error.message);
          throw error;
        }
      }
    }

    console.log('🎉 تم إعداد قاعدة البيانات بنجاح!');
    
    // التحقق من الجداول
    const [tables_result] = await connection.execute('SHOW TABLES');
    console.log(`📋 عدد الجداول المنشأة: ${tables_result.length}`);
    
    tables_result.forEach(table => {
      const tableName = Object.values(table)[0];
      console.log(`   📁 ${tableName}`);
    });

  } catch (error) {
    console.error('❌ خطأ في إعداد قاعدة البيانات:', error.message);
    throw error;
  } finally {
    if (connection) {
      await connection.end();
      console.log('🔒 تم إغلاق الاتصال');
    }
  }
}

// تشغيل السكريبت
if (require.main === module) {
  setupDatabase();
}

module.exports = setupDatabase;