const { query, testConnection, closePool } = require('../config/database');

async function checkDatabaseStructure() {
  console.log('🔍 فحص هيكل قاعدة البيانات...');

  try {
    const isConnected = await testConnection();
    if (!isConnected) {
      throw new Error('فشل الاتصال بقاعدة البيانات');
    }

    // فحص الجداول الموجودة
    const tables = await query('SHOW TABLES');
    const tableNames = tables.map(table => Object.values(table)[0]);
    
    console.log('📋 الجداول الموجودة:', tableNames);

    // فحص هيكل جدول lessons
    if (tableNames.includes('lessons')) {
      console.log('\n📖 فحص هيكل جدول lessons:');
      const lessonColumns = await query('DESCRIBE lessons');
      console.log('الأعمدة الموجودة:');
      lessonColumns.forEach(col => {
        console.log(`  - ${col.Field} (${col.Type}) ${col.Null === 'NO' ? 'NOT NULL' : 'NULL'} ${col.Default ? `DEFAULT ${col.Default}` : ''}`);
      });

      // فحص البيانات الموجودة
      const sampleLesson = await query('SELECT * FROM lessons LIMIT 1');
      console.log('\n📊 عينة من البيانات:');
      if (sampleLesson.length > 0) {
        console.log('الأعمدة والقيم:', Object.keys(sampleLesson[0]));
      } else {
        console.log('لا توجد بيانات في الجدول');
      }
    }

    // فحص الجداول الأخرى
    const criticalTables = ['users', 'courses', 'course_sections', 'enrollments'];
    
    for (const tableName of criticalTables) {
      if (tableNames.includes(tableName)) {
        console.log(`\n📋 فحص هيكل جدول ${tableName}:`);
        const columns = await query(`DESCRIBE ${tableName}`);
        console.log('الأعمدة:');
        columns.forEach(col => {
          console.log(`  - ${col.Field} (${col.Type})`);
        });
      } else {
        console.log(`\n❌ جدول ${tableName} غير موجود`);
      }
    }

    console.log('\n🎉 تم فحص هيكل قاعدة البيانات!');

  } catch (error) {
    console.error('❌ خطأ في فحص هيكل قاعدة البيانات:', error.message);
  } finally {
    await closePool();
  }
}

if (require.main === module) {
  checkDatabaseStructure();
}

module.exports = checkDatabaseStructure;