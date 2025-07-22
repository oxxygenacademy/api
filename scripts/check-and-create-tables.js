const { query, testConnection, closePool } = require('../config/database');

async function checkAndCreateTables() {
  console.log('🔍 فحص وإنشاء الجداول المفقودة...');

  try {
    const isConnected = await testConnection();
    if (!isConnected) {
      throw new Error('فشل الاتصال بقاعدة البيانات');
    }

    // فحص الجداول الموجودة
    const tables = await query('SHOW TABLES');
    const tableNames = tables.map(table => Object.values(table)[0]);
    
    console.log('📋 الجداول الموجودة:', tableNames);

    // إنشاء جدول lesson_progress إذا لم يكن موجود
    if (!tableNames.includes('lesson_progress')) {
      console.log('🆕 إنشاء جدول lesson_progress...');
      
      await query(`
        CREATE TABLE lesson_progress (
          id INT AUTO_INCREMENT PRIMARY KEY,
          lesson_id INT NOT NULL,
          user_id INT NOT NULL,
          is_completed TINYINT(1) DEFAULT 0,
          watch_time INT DEFAULT 0,
          current_position INT DEFAULT 0,
          progress_percentage INT DEFAULT 0,
          notes TEXT,
          bookmarked TINYINT(1) DEFAULT 0,
          last_watched_at TIMESTAMP NULL,
          completed_at TIMESTAMP NULL,
          created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
          updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
          UNIQUE KEY unique_user_lesson (user_id, lesson_id),
          INDEX idx_lesson_user (lesson_id, user_id),
          INDEX idx_user_progress (user_id, is_completed)
        ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci
      `);
      
      console.log('✅ تم إنشاء جدول lesson_progress');
    } else {
      console.log('✅ جدول lesson_progress موجود');
      
      // فحص الأعمدة المطلوبة
      const columns = await query('DESCRIBE lesson_progress');
      const columnNames = columns.map(col => col.Field);
      
      console.log('📋 أعمدة lesson_progress:', columnNames);
      
      // إضافة الأعمدة المفقودة
      const requiredColumns = [
        { name: 'watch_time', type: 'INT DEFAULT 0' },
        { name: 'current_position', type: 'INT DEFAULT 0' },
        { name: 'progress_percentage', type: 'INT DEFAULT 0' },
        { name: 'notes', type: 'TEXT' },
        { name: 'bookmarked', type: 'TINYINT(1) DEFAULT 0' },
        { name: 'last_watched_at', type: 'TIMESTAMP NULL' },
        { name: 'completed_at', type: 'TIMESTAMP NULL' }
      ];
      
      for (const col of requiredColumns) {
        if (!columnNames.includes(col.name)) {
          try {
            await query(`ALTER TABLE lesson_progress ADD COLUMN ${col.name} ${col.type}`);
            console.log(`✅ تم إضافة عمود: ${col.name}`);
          } catch (error) {
            console.log(`⚠️ خطأ في إضافة عمود ${col.name}:`, error.message);
          }
        }
      }
    }

    // فحص الجداول الأخرى المطلوبة
    const requiredTables = [
      {
        name: 'lesson_resources',
        sql: `
          CREATE TABLE lesson_resources (
            id INT AUTO_INCREMENT PRIMARY KEY,
            lesson_id INT NOT NULL,
            title VARCHAR(255) NOT NULL,
            description TEXT,
            file_url VARCHAR(500),
            file_type VARCHAR(50),
            file_size VARCHAR(50),
            download_count INT DEFAULT 0,
            order_index INT DEFAULT 0,
            is_active TINYINT(1) DEFAULT 1,
            created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
            updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
            INDEX idx_lesson (lesson_id),
            INDEX idx_active (is_active)
          ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci
        `
      },
      {
        name: 'favorites',
        sql: `
          CREATE TABLE favorites (
            id INT AUTO_INCREMENT PRIMARY KEY,
            user_id INT NOT NULL,
            course_id INT NOT NULL,
            added_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
            UNIQUE KEY unique_user_course (user_id, course_id),
            INDEX idx_user (user_id),
            INDEX idx_course (course_id)
          ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci
        `
      },
      {
        name: 'user_preferences',
        sql: `
          CREATE TABLE user_preferences (
            id INT AUTO_INCREMENT PRIMARY KEY,
            user_id INT NOT NULL,
            setting_key VARCHAR(100) NOT NULL,
            setting_value TEXT,
            created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
            updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
            UNIQUE KEY unique_user_setting (user_id, setting_key),
            INDEX idx_user (user_id)
          ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci
        `
      },
      {
        name: 'course_progress',
        sql: `
          CREATE TABLE course_progress (
            id INT AUTO_INCREMENT PRIMARY KEY,
            user_id INT NOT NULL,
            course_id INT NOT NULL,
            progress_percentage INT DEFAULT 0,
            completed_lessons INT DEFAULT 0,
            total_watch_time INT DEFAULT 0,
            last_accessed TIMESTAMP NULL,
            estimated_completion TIMESTAMP NULL,
            created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
            updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
            UNIQUE KEY unique_user_course (user_id, course_id),
            INDEX idx_user (user_id),
            INDEX idx_course (course_id)
          ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci
        `
      },
      {
        name: 'certificates',
        sql: `
          CREATE TABLE certificates (
            id INT AUTO_INCREMENT PRIMARY KEY,
            user_id INT NOT NULL,
            course_id INT NOT NULL,
            certificate_number VARCHAR(100) UNIQUE NOT NULL,
            issued_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
            is_verified TINYINT(1) DEFAULT 1,
            created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
            INDEX idx_user (user_id),
            INDEX idx_course (course_id),
            INDEX idx_number (certificate_number)
          ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci
        `
      },
      {
        name: 'user_achievements',
        sql: `
          CREATE TABLE user_achievements (
            id INT AUTO_INCREMENT PRIMARY KEY,
            user_id INT NOT NULL,
            achievement_id INT NOT NULL,
            earned_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
            UNIQUE KEY unique_user_achievement (user_id, achievement_id),
            INDEX idx_user (user_id)
          ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci
        `
      }
    ];

    for (const table of requiredTables) {
      if (!tableNames.includes(table.name)) {
        try {
          console.log(`🆕 إنشاء جدول ${table.name}...`);
          await query(table.sql);
          console.log(`✅ تم إنشاء جدول ${table.name}`);
        } catch (error) {
          console.log(`⚠️ خطأ في إنشاء جدول ${table.name}:`, error.message);
        }
      } else {
        console.log(`✅ جدول ${table.name} موجود`);
      }
    }

    // إضافة أعمدة مفقودة في الجداول الموجودة
    if (tableNames.includes('users')) {
      const userColumns = await query('DESCRIBE users');
      const userColumnNames = userColumns.map(col => col.Field);
      
      const userRequiredColumns = [
        { name: 'bio', type: 'TEXT' },
        { name: 'phone', type: 'VARCHAR(20)' },
        { name: 'country', type: 'VARCHAR(100)' },
        { name: 'city', type: 'VARCHAR(100)' },
        { name: 'timezone', type: 'VARCHAR(50) DEFAULT "Asia/Riyadh"' },
        { name: 'language', type: 'VARCHAR(10) DEFAULT "ar"' },
        { name: 'phone_verified', type: 'TINYINT(1) DEFAULT 0' },
        { name: 'last_login', type: 'TIMESTAMP NULL' }
      ];
      
      for (const col of userRequiredColumns) {
        if (!userColumnNames.includes(col.name)) {
          try {
            await query(`ALTER TABLE users ADD COLUMN ${col.name} ${col.type}`);
            console.log(`✅ تم إضافة عمود ${col.name} لجدول users`);
          } catch (error) {
            console.log(`⚠️ خطأ في إضافة عمود ${col.name}:`, error.message);
          }
        }
      }
    }

    console.log('🎉 تم فحص وإنشاء جميع الجداول المطلوبة!');

  } catch (error) {
    console.error('❌ خطأ في فحص وإنشاء الجداول:', error.message);
  } finally {
    await closePool();
  }
}

if (require.main === module) {
  checkAndCreateTables();
}

module.exports = checkAndCreateTables;