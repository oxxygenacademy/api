const bcrypt = require('bcryptjs');
const { query, testConnection } = require('../config/database');

async function seedDatabase() {
  console.log('🌱 بدء إدراج البيانات التجريبية المحدثة...');

  try {
    const isConnected = await testConnection();
    if (!isConnected) {
      throw new Error('فشل الاتصال بقاعدة البيانات');
    }

    // 1. إدراج أقسام/تصنيفات الكورسات
    console.log('📁 إدراج أقسام الكورسات...');
    
    const categories = [
      {
        name: 'البرمجة وتطوير المواقع',
        slug: 'programming-web-development',
        description: 'تعلم البرمجة وتطوير المواقع والتطبيقات',
        icon: '💻',
        color: '#3B82F6'
      },
      {
        name: 'التصميم الجرافيكي',
        slug: 'graphic-design',
        description: 'تعلم التصميم الجرافيكي والإبداع البصري',
        icon: '🎨',
        color: '#EF4444'
      },
      {
        name: 'التسويق الرقمي',
        slug: 'digital-marketing',
        description: 'تعلم استراتيجيات التسويق الرقمي الحديثة',
        icon: '📈',
        color: '#10B981'
      },
      {
        name: 'تطوير التطبيقات',
        slug: 'mobile-development',
        description: 'تطوير تطبيقات الهواتف الذكية',
        icon: '📱',
        color: '#8B5CF6'
      }
    ];

    const categoryIds = {};
    for (const category of categories) {
      try {
        const result = await query(
          'INSERT INTO course_categories (name, slug, description, icon, color) VALUES (?, ?, ?, ?, ?)',
          [category.name, category.slug, category.description, category.icon, category.color]
        );
        categoryIds[category.slug] = result.insertId;
        console.log(`✅ تم إنشاء القسم: ${category.name}`);
      } catch (error) {
        if (error.code === 'ER_DUP_ENTRY') {
          const existing = await query('SELECT id FROM course_categories WHERE slug = ?', [category.slug]);
          categoryIds[category.slug] = existing[0].id;
          console.log(`⚠️  القسم موجود مسبقاً: ${category.name}`);
        } else {
          throw error;
        }
      }
    }

    // 2. إدراج مستخدمين تجريبيين
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

    // 3. إدراج كورسات تجريبية
    console.log('📚 إدراج الكورسات...');
    
    const courses = [
      {
        category_id: categoryIds['programming-web-development'],
        title: 'دورة JavaScript للمبتدئين',
        slug: 'javascript-beginners-course',
        description: 'تعلم أساسيات لغة JavaScript من الصفر حتى الاحتراف. ستتعلم المتغيرات، الدوال، DOM manipulation والمزيد',
        short_description: 'تعلم أساسيات JavaScript من الصفر',
        price: 99.99,
        difficulty: 'beginner',
        is_featured: true
      },
      {
        category_id: categoryIds['programming-web-development'],
        title: 'دورة React.js المتقدمة',
        slug: 'react-advanced-course',
        description: 'دورة شاملة لتعلم React.js مع أحدث المميزات والتقنيات. ستبني مشاريع حقيقية وتتعلم best practices',
        short_description: 'تعلم React.js والمكتبات الحديثة',
        price: 199.99,
        difficulty: 'advanced',
        is_featured: true
      },
      {
        category_id: categoryIds['graphic-design'],
        title: 'أساسيات التصميم الجرافيكي',
        slug: 'graphic-design-fundamentals',
        description: 'تعلم أساسيات التصميم الجرافيكي باستخدام أدوات التصميم المختلفة والمبادئ الأساسية',
        short_description: 'تعلم أساسيات التصميم الجرافيكي',
        price: 149.99,
        difficulty: 'beginner',
        is_featured: false
      }
    ];

    const courseIds = {};
    for (const course of courses) {
      try {
        const result = await query(
          `INSERT INTO courses (category_id, title, slug, description, short_description, price, difficulty, is_featured) 
           VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
          [
            course.category_id, course.title, course.slug, course.description,
            course.short_description, course.price, course.difficulty, course.is_featured
          ]
        );
        courseIds[course.slug] = result.insertId;
        console.log(`✅ تم إنشاء الكورس: ${course.title}`);
      } catch (error) {
        if (error.code === 'ER_DUP_ENTRY') {
          const existing = await query('SELECT id FROM courses WHERE slug = ?', [course.slug]);
          courseIds[course.slug] = existing[0].id;
          console.log(`⚠️  الكورس موجود مسبقاً: ${course.title}`);
        } else {
          throw error;
        }
      }
    }

    // 4. إدراج فصول الكورسات
    console.log('📖 إدراج فصول الكورسات...');
    
    const sections = [
      // فصول JavaScript
      { course_slug: 'javascript-beginners-course', title: 'الأساسيات', order_index: 1 },
      { course_slug: 'javascript-beginners-course', title: 'الدوال والمصفوفات', order_index: 2 },
      { course_slug: 'javascript-beginners-course', title: 'DOM والأحداث', order_index: 3 },
      
      // فصول React
      { course_slug: 'react-advanced-course', title: 'مقدمة React', order_index: 1 },
      { course_slug: 'react-advanced-course', title: 'Components وState', order_index: 2 },
      { course_slug: 'react-advanced-course', title: 'Hooks المتقدمة', order_index: 3 },
      
      // فصول التصميم
      { course_slug: 'graphic-design-fundamentals', title: 'مبادئ التصميم', order_index: 1 },
      { course_slug: 'graphic-design-fundamentals', title: 'الألوان والخطوط', order_index: 2 },
      { course_slug: 'graphic-design-fundamentals', title: 'مشاريع عملية', order_index: 3 }
    ];

    const sectionIds = {};
    for (const section of sections) {
      try {
        const courseId = courseIds[section.course_slug];
        const result = await query(
          'INSERT INTO course_sections (course_id, title, order_index) VALUES (?, ?, ?)',
          [courseId, section.title, section.order_index]
        );
        sectionIds[`${section.course_slug}-${section.order_index}`] = result.insertId;
        console.log(`✅ تم إنشاء الفصل: ${section.title}`);
      } catch (error) {
        console.log(`⚠️  خطأ في إنشاء الفصل: ${section.title}`, error.message);
      }
    }

    // 5. إدراج دروس تجريبية
    console.log('🎥 إدراج الدروس...');
    
    const lessons = [
      // دروس JavaScript - الأساسيات
      {
        course_slug: 'javascript-beginners-course',
        section_key: 'javascript-beginners-course-1',
        title: 'مقدمة في JavaScript',
        duration: 1800,
        order_index: 1,
        is_preview: true
      },
      {
        course_slug: 'javascript-beginners-course',
        section_key: 'javascript-beginners-course-1',
        title: 'المتغيرات والأنواع',
        duration: 1800,
        order_index: 2,
        is_preview: false
      },
      
      // دروس JavaScript - الدوال
      {
        course_slug: 'javascript-beginners-course',
        section_key: 'javascript-beginners-course-2',
        title: 'الدوال الأساسية',
        duration: 2100,
        order_index: 1,
        is_preview: false
      },
      {
        course_slug: 'javascript-beginners-course',
        section_key: 'javascript-beginners-course-2',
        title: 'المصفوفات والكائنات',
        duration: 2400,
        order_index: 2,
        is_preview: false
      },
      
      // دروس JavaScript - DOM
      {
        course_slug: 'javascript-beginners-course',
        section_key: 'javascript-beginners-course-3',
        title: 'فهم DOM',
        duration: 1800,
        order_index: 1,
        is_preview: false
      },
      {
        course_slug: 'javascript-beginners-course',
        section_key: 'javascript-beginners-course-3',
        title: 'الأحداث والتفاعل',
        duration: 2100,
        order_index: 2,
        is_preview: false
      },

      // دروس React - مقدمة
      {
        course_slug: 'react-advanced-course',
        section_key: 'react-advanced-course-1',
        title: 'ما هو React؟',
        duration: 1500,
        order_index: 1,
        is_preview: true
      },
      {
        course_slug: 'react-advanced-course',
        section_key: 'react-advanced-course-1',
        title: 'إعداد البيئة',
        duration: 2400,
        order_index: 2,
        is_preview: false
      },

      // دروس التصميم - مبادئ
      {
        course_slug: 'graphic-design-fundamentals',
        section_key: 'graphic-design-fundamentals-1',
        title: 'مبادئ التصميم الأساسية',
        duration: 2160,
        order_index: 1,
        is_preview: true
      },
      {
        course_slug: 'graphic-design-fundamentals',
        section_key: 'graphic-design-fundamentals-1',
        title: 'التوازن والتناسق',
        duration: 1800,
        order_index: 2,
        is_preview: false
      }
    ];

    for (const lesson of lessons) {
      try {
        const courseId = courseIds[lesson.course_slug];
        const sectionId = sectionIds[lesson.section_key];
        
        await query(
          `INSERT INTO lessons (course_id, section_id, title, duration, order_index, is_preview) 
           VALUES (?, ?, ?, ?, ?, ?)`,
          [courseId, sectionId, lesson.title, lesson.duration, lesson.order_index, lesson.is_preview]
        );
        console.log(`✅ تم إنشاء الدرس: ${lesson.title}`);
      } catch (error) {
        console.log(`⚠️  خطأ في إنشاء الدرس: ${lesson.title}`, error.message);
      }
    }

    // تحديث إحصائيات الكورسات
    console.log('📊 تحديث إحصائيات الكورسات...');
    await query(`
      UPDATE courses c SET 
        total_lessons = (
          SELECT COUNT(*) FROM lessons l WHERE l.course_id = c.id AND l.is_active = 1
        ),
        total_duration = (
          SELECT COALESCE(SUM(l.duration), 0) FROM lessons l WHERE l.course_id = c.id AND l.is_active = 1
        )
    `);

    console.log('🎉 تم إدراج جميع البيانات التجريبية بنجاح!');

    // عرض إحصائيات
    const [userCount] = await query('SELECT COUNT(*) as count FROM users');
    const [categoryCount] = await query('SELECT COUNT(*) as count FROM course_categories');
    const [courseCount] = await query('SELECT COUNT(*) as count FROM courses');
    const [sectionCount] = await query('SELECT COUNT(*) as count FROM course_sections');
    const [lessonCount] = await query('SELECT COUNT(*) as count FROM lessons');

    console.log('\n📊 إحصائيات البيانات:');
    console.log(`👥 المستخدمين: ${userCount.count}`);
    console.log(`📁 أقسام الكورسات: ${categoryCount.count}`);
    console.log(`📚 الكورسات: ${courseCount.count}`);
    console.log(`📖 فصول الكورسات: ${sectionCount.count}`);
    console.log(`🎥 الدروس: ${lessonCount.count}`);

  } catch (error) {
    console.error('❌ خطأ في إدراج البيانات التجريبية:', error.message);
    process.exit(1);
  }
}

if (require.main === module) {
  seedDatabase();
}

module.exports = seedDatabase;