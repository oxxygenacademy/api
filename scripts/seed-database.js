const bcrypt = require('bcryptjs');
const { query, testConnection } = require('../config/database');

async function seedDatabase() {
  console.log('🌱 بدء إدراج البيانات التجريبية...');

  try {
    // اختبار الاتصال
    const isConnected = await testConnection();
    if (!isConnected) {
      throw new Error('فشل الاتصال بقاعدة البيانات');
    }

    // 1. إدراج مستخدمين تجريبيين
    console.log('👥 إدراج المستخدمين...');
    
    const hashedPassword = await bcrypt.hash('123456', 12);
    
    const users = [
      {
        email: 'oxxygenacademy@test.com',
        password: hashedPassword,
        name: 'Oxxygen Academy',
        email_verified: true
      },
      {
        email: 'student1@test.com',
        password: hashedPassword,
        name: 'أحمد محمد',
        email_verified: true
      },
      {
        email: 'student2@test.com',
        password: hashedPassword,
        name: 'فاطمة علي',
        email_verified: true
      }
    ];

    for (const user of users) {
      try {
        await query(
          'INSERT INTO users (email, password, name, email_verified) VALUES (?, ?, ?, ?)',
          [user.email, user.password, user.name, user.email_verified]
        );
        console.log(`✅ تم إنشاء المستخدم: ${user.name}`);
      } catch (error) {
        if (error.code === 'ER_DUP_ENTRY') {
          console.log(`⚠️  المستخدم موجود مسبقاً: ${user.name}`);
        } else {
          throw error;
        }
      }
    }

    // 2. إدراج كورسات تجريبية
    console.log('📚 إدراج الكورسات...');
    
    const courses = [
      {
        title: 'دورة JavaScript للمبتدئين',
        description: 'تعلم أساسيات لغة JavaScript من الصفر حتى الاحتراف. ستتعلم المتغيرات، الدوال، DOM manipulation والمزيد',
        short_description: 'تعلم أساسيات JavaScript من الصفر',
        price: 99.99,
        difficulty: 'beginner',
        category: 'البرمجة',
        is_featured: true,
        total_duration: 7200, // 2 ساعة
        total_lessons: 4
      },
      {
        title: 'دورة React.js المتقدمة',
        description: 'دورة شاملة لتعلم React.js مع أحدث المميزات والتقنيات. ستبني مشاريع حقيقية وتتعلم best practices',
        short_description: 'تعلم React.js والمكتبات الحديثة',
        price: 199.99,
        difficulty: 'advanced',
        category: 'البرمجة',
        is_featured: true,
        total_duration: 14400, // 4 ساعات
        total_lessons: 6
      },
      {
        title: 'أساسيات التصميم الجرافيكي',
        description: 'تعلم أساسيات التصميم الجرافيكي باستخدام أدوات التصميم المختلفة والمبادئ الأساسية',
        short_description: 'تعلم أساسيات التصميم الجرافيكي',
        price: 149.99,
        difficulty: 'beginner',
        category: 'التصميم',
        is_featured: false,
        total_duration: 10800, // 3 ساعات
        total_lessons: 5
      }
    ];

    for (const course of courses) {
      try {
        const result = await query(
          `INSERT INTO courses (title, description, short_description, price, difficulty, 
           category, is_featured, total_duration, total_lessons) 
           VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
          [
            course.title, course.description, course.short_description,
            course.price, course.difficulty, course.category,
            course.is_featured, course.total_duration, course.total_lessons
          ]
        );
        console.log(`✅ تم إنشاء الكورس: ${course.title}`);
      } catch (error) {
        console.log(`⚠️  خطأ في إنشاء الكورس: ${course.title}`, error.message);
      }
    }

    // 3. إدراج دروس تجريبية
    console.log('🎥 إدراج الدروس...');
    
    const lessons = [
      // دروس JavaScript
      { course_id: 1, title: 'مقدمة في JavaScript', duration: 1800, order_index: 1, is_preview: true },
      { course_id: 1, title: 'المتغيرات والأنواع', duration: 1800, order_index: 2, is_preview: false },
      { course_id: 1, title: 'الدوال والشروط', duration: 1800, order_index: 3, is_preview: false },
      { course_id: 1, title: 'التعامل مع DOM', duration: 1800, order_index: 4, is_preview: false },
      
      // دروس React
      { course_id: 2, title: 'مقدمة في React', duration: 2400, order_index: 1, is_preview: true },
      { course_id: 2, title: 'Components و Props', duration: 2400, order_index: 2, is_preview: false },
      { course_id: 2, title: 'State و Hooks', duration: 2400, order_index: 3, is_preview: false },
      { course_id: 2, title: 'React Router', duration: 2400, order_index: 4, is_preview: false },
      { course_id: 2, title: 'Context API', duration: 2400, order_index: 5, is_preview: false },
      { course_id: 2, title: 'مشروع عملي', duration: 2400, order_index: 6, is_preview: false },
      
      // دروس التصميم
      { course_id: 3, title: 'مبادئ التصميم', duration: 2160, order_index: 1, is_preview: true },
      { course_id: 3, title: 'نظرية الألوان', duration: 2160, order_index: 2, is_preview: false },
      { course_id: 3, title: 'Typography', duration: 2160, order_index: 3, is_preview: false },
      { course_id: 3, title: 'تصميم Logo', duration: 2160, order_index: 4, is_preview: false },
      { course_id: 3, title: 'مشروع عملي', duration: 2160, order_index: 5, is_preview: false }
    ];

    for (const lesson of lessons) {
      try {
        await query(
          `INSERT INTO lessons (course_id, title, duration, order_index, is_preview) 
           VALUES (?, ?, ?, ?, ?)`,
          [lesson.course_id, lesson.title, lesson.duration, lesson.order_index, lesson.is_preview]
        );
        console.log(`✅ تم إنشاء الدرس: ${lesson.title}`);
      } catch (error) {
        console.log(`⚠️  خطأ في إنشاء الدرس: ${lesson.title}`);
      }
    }

    console.log('🎉 تم إدراج جميع البيانات التجريبية بنجاح!');

    // عرض إحصائيات
    const [userCount] = await query('SELECT COUNT(*) as count FROM users');
    const [courseCount] = await query('SELECT COUNT(*) as count FROM courses');
    const [lessonCount] = await query('SELECT COUNT(*) as count FROM lessons');

    console.log('\n📊 إحصائيات البيانات:');
    console.log(`👥 المستخدمين: ${userCount.count}`);
    console.log(`📚 الكورسات: ${courseCount.count}`);
    console.log(`🎥 الدروس: ${lessonCount.count}`);

  } catch (error) {
    console.error('❌ خطأ في إدراج البيانات التجريبية:', error.message);
    process.exit(1);
  }
}

// تشغيل السكريبت
if (require.main === module) {
  seedDatabase();
}

module.exports = seedDatabase;