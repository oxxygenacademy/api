const { query } = require('../config/database');

class Lesson {
  // فحص الأعمدة الموجودة في جدول lessons
  static async getAvailableColumns() {
    try {
      const columns = await query('DESCRIBE lessons');
      return columns.map(col => col.Field);
    } catch (error) {
      console.error('❌ خطأ في فحص أعمدة جدول lessons:', error);
      return ['id', 'title']; // أعمدة افتراضية
    }
  }

  // بناء استعلام SELECT بناءً على الأعمدة المتاحة
  static async buildSelectQuery(availableColumns) {
    const defaultColumns = ['id', 'title', 'course_id', 'section_id'];
    const optionalColumns = ['slug', 'description', 'content', 'video_url', 'duration', 'order_index', 'is_free', 'created_at', 'updated_at'];
    
    // إضافة الأعمدة الافتراضية
    const selectedColumns = [...defaultColumns];
    
    // إضافة الأعمدة الاختيارية المتاحة
    optionalColumns.forEach(col => {
      if (availableColumns.includes(col)) {
        selectedColumns.push(col);
      }
    });

    return selectedColumns.map(col => `l.${col}`).join(', ');
  }

  // البحث عن درس بالمعرف (متكيف مع هيكل قاعدة البيانات)
  static async findById(id, userId = null) {
    try {
      console.log(`🔍 البحث عن الدرس: ${id} للمستخدم: ${userId || 'غير مسجل'}`);

      // فحص الأعمدة المتاحة
      const availableColumns = await this.getAvailableColumns();
      console.log('📋 الأعمدة المتاحة في جدول lessons:', availableColumns);

      // بناء استعلام مخصص
      const selectFields = await this.buildSelectQuery(availableColumns);
      
      const basicLessonQuery = `
        SELECT ${selectFields}
        FROM lessons l
        WHERE l.id = ? 
        LIMIT 1
      `;

      console.log('🔍 الاستعلام المُستخدم:', basicLessonQuery);

      const lessons = await query(basicLessonQuery, [id]);

      if (lessons.length === 0) {
        console.log(`❌ الدرس ${id} غير موجود`);
        return null;
      }

      const lesson = lessons[0];
      console.log(`✅ تم العثور على الدرس: ${lesson.title}`);

      // إضافة القيم الافتراضية للحقول المفقودة
      const defaultValues = {
        slug: lesson.slug || `lesson-${lesson.id}`,
        description: lesson.description || '',
        content: lesson.content || '',
        video_url: lesson.video_url || '',
        duration: lesson.duration || '00:00',
        order_index: lesson.order_index || 1,
        is_free: lesson.is_free !== undefined ? lesson.is_free : 0,
        created_at: lesson.created_at || new Date().toISOString(),
        updated_at: lesson.updated_at || new Date().toISOString()
      };

      // دمج البيانات الأساسية مع القيم الافتراضية
      const enrichedLesson = { ...defaultValues, ...lesson };

      // محاولة جلب معلومات إضافية بشكل آمن
      let sectionTitle = 'قسم غير محدد';
      let courseTitle = 'كورس غير محدد';
      let sectionOrder = 1;

      try {
        // فحص وجود جدول course_sections
        const tablesResult = await query("SHOW TABLES LIKE 'course_sections'");
        if (tablesResult.length > 0 && lesson.section_id) {
          const sectionInfo = await query(
            'SELECT title, order_index FROM course_sections WHERE id = ? LIMIT 1',
            [lesson.section_id]
          );
          if (sectionInfo.length > 0) {
            sectionTitle = sectionInfo[0].title;
            sectionOrder = sectionInfo[0].order_index || 1;
          }
        }
      } catch (sectionError) {
        console.log('⚠️ تم تخطي معلومات الفصل:', sectionError.message);
      }

      try {
        // فحص وجود جدول courses
        const tablesResult = await query("SHOW TABLES LIKE 'courses'");
        if (tablesResult.length > 0 && lesson.course_id) {
          const courseInfo = await query(
            'SELECT title FROM courses WHERE id = ? LIMIT 1',
            [lesson.course_id]
          );
          if (courseInfo.length > 0) {
            courseTitle = courseInfo[0].title;
          }
        }
      } catch (courseError) {
        console.log('⚠️ تم تخطي معلومات الكورس:', courseError.message);
      }

      // جلب تقدم المستخدم (آمن)
      let userProgress = {
        is_completed: 0,
        watch_time: 0,
        progress_percentage: 0,
        notes: '',
        bookmarked: 0,
        last_watched_at: null
      };

      if (userId) {
        try {
          const tablesResult = await query("SHOW TABLES LIKE 'lesson_progress'");
          if (tablesResult.length > 0) {
            const progressColumns = await query('DESCRIBE lesson_progress');
            const progressColumnNames = progressColumns.map(col => col.Field);
            
            const progressFields = [];
            if (progressColumnNames.includes('is_completed')) progressFields.push('is_completed');
            if (progressColumnNames.includes('watch_time')) progressFields.push('watch_time');
            if (progressColumnNames.includes('progress_percentage')) progressFields.push('progress_percentage');
            if (progressColumnNames.includes('notes')) progressFields.push('notes');
            if (progressColumnNames.includes('bookmarked')) progressFields.push('bookmarked');
            if (progressColumnNames.includes('last_watched_at')) progressFields.push('last_watched_at');
            
            if (progressFields.length > 0) {
              const progressQuery = `SELECT ${progressFields.join(', ')} FROM lesson_progress WHERE lesson_id = ? AND user_id = ? LIMIT 1`;
              const progressInfo = await query(progressQuery, [id, userId]);
              
              if (progressInfo.length > 0) {
                userProgress = { ...userProgress, ...progressInfo[0] };
              }
            }
          }
        } catch (progressError) {
          console.log('⚠️ تم تخطي تقدم المستخدم:', progressError.message);
        }
      }

      // تجميع البيانات النهائية
      const finalLesson = {
        ...enrichedLesson,
        section_title: sectionTitle,
        section_order: sectionOrder,
        course_title: courseTitle,
        ...userProgress
      };

      console.log(`✅ تم تجميع بيانات الدرس بنجاح`);
      return finalLesson;

    } catch (error) {
      console.error('❌ خطأ في جلب الدرس:', error);
      throw error;
    }
  }

  // جلب الدرس التالي (متكيف)
  static async getNextLesson(currentLesson) {
    try {
      console.log(`🔍 البحث عن الدرس التالي للدرس: ${currentLesson.id}`);

      const availableColumns = await this.getAvailableColumns();
      
      // أعمدة أساسية للتنقل
      const navigationFields = ['id', 'title'];
      if (availableColumns.includes('slug')) navigationFields.push('slug');
      if (availableColumns.includes('duration')) navigationFields.push('duration');
      if (availableColumns.includes('is_free')) navigationFields.push('is_free');

      const selectFields = navigationFields.map(col => `${col}`).join(', ');

      let nextInSectionQuery;
      let queryParams;

      if (availableColumns.includes('order_index') && currentLesson.section_id) {
        nextInSectionQuery = `
          SELECT ${selectFields}
          FROM lessons 
          WHERE section_id = ? 
            AND order_index > ? 
          ORDER BY order_index ASC
          LIMIT 1
        `;
        queryParams = [currentLesson.section_id, currentLesson.order_index || 0];
      } else {
        // استعلام بديل بناءً على ID
        nextInSectionQuery = `
          SELECT ${selectFields}
          FROM lessons 
          WHERE course_id = ? 
            AND id > ? 
          ORDER BY id ASC
          LIMIT 1
        `;
        queryParams = [currentLesson.course_id, currentLesson.id];
      }

      const nextInSection = await query(nextInSectionQuery, queryParams);

      if (nextInSection.length > 0) {
        const nextLesson = nextInSection[0];
        // إضافة القيم الافتراضية إذا كانت مفقودة
        const result = {
          id: nextLesson.id,
          title: nextLesson.title,
          slug: nextLesson.slug || `lesson-${nextLesson.id}`,
          duration: nextLesson.duration || '00:00',
          is_free: nextLesson.is_free !== undefined ? nextLesson.is_free : 0
        };
        
        console.log('✅ تم العثور على الدرس التالي');
        return result;
      }

      console.log('ℹ️ لا يوجد درس تالي');
      return null;

    } catch (error) {
      console.error('❌ خطأ في جلب الدرس التالي:', error);
      return null;
    }
  }

  // جلب الدرس السابق (متكيف)
  static async getPreviousLesson(currentLesson) {
    try {
      console.log(`🔍 البحث عن الدرس السابق للدرس: ${currentLesson.id}`);

      const availableColumns = await this.getAvailableColumns();
      
      // أعمدة أساسية للتنقل
      const navigationFields = ['id', 'title'];
      if (availableColumns.includes('slug')) navigationFields.push('slug');
      if (availableColumns.includes('duration')) navigationFields.push('duration');
      if (availableColumns.includes('is_free')) navigationFields.push('is_free');

      const selectFields = navigationFields.map(col => `${col}`).join(', ');

      let prevInSectionQuery;
      let queryParams;

      if (availableColumns.includes('order_index') && currentLesson.section_id) {
        prevInSectionQuery = `
          SELECT ${selectFields}
          FROM lessons 
          WHERE section_id = ? 
            AND order_index < ? 
          ORDER BY order_index DESC
          LIMIT 1
        `;
        queryParams = [currentLesson.section_id, currentLesson.order_index || 999];
      } else {
        // استعلام بديل بناءً على ID
        prevInSectionQuery = `
          SELECT ${selectFields}
          FROM lessons 
          WHERE course_id = ? 
            AND id < ? 
          ORDER BY id DESC
          LIMIT 1
        `;
        queryParams = [currentLesson.course_id, currentLesson.id];
      }

      const prevInSection = await query(prevInSectionQuery, queryParams);

      if (prevInSection.length > 0) {
        const prevLesson = prevInSection[0];
        // إضافة القيم الافتراضية إذا كانت مفقودة
        const result = {
          id: prevLesson.id,
          title: prevLesson.title,
          slug: prevLesson.slug || `lesson-${prevLesson.id}`,
          duration: prevLesson.duration || '00:00',
          is_free: prevLesson.is_free !== undefined ? prevLesson.is_free : 0
        };
        
        console.log('✅ تم العثور على الدرس السابق');
        return result;
      }

      console.log('ℹ️ لا يوجد درس سابق');
      return null;

    } catch (error) {
      console.error('❌ خطأ في جلب الدرس السابق:', error);
      return null;
    }
  }

  // باقي الدوال...
  static async getLessonResources(lessonId) {
    try {
      const tablesResult = await query("SHOW TABLES LIKE 'lesson_resources'");
      if (tablesResult.length === 0) {
        return [];
      }

      const resourcesQuery = `
        SELECT id, title, description, file_url, file_type, file_size, download_count
        FROM lesson_resources 
        WHERE lesson_id = ?
        ORDER BY id ASC
      `;

      const resources = await query(resourcesQuery, [lessonId]);
      return resources || [];

    } catch (error) {
      console.error('❌ خطأ في جلب موارد الدرس:', error);
      return [];
    }
  }

  static async checkLessonAccess(lessonId, userId) {
    try {
      if (!userId) {
        const availableColumns = await this.getAvailableColumns();
        
        if (availableColumns.includes('is_free')) {
          const lessonInfo = await query(
            'SELECT is_free FROM lessons WHERE id = ?',
            [lessonId]
          );
          
          if (lessonInfo.length === 0) {
            return { hasAccess: false, reason: 'lesson_not_found' };
          }

          return { 
            hasAccess: lessonInfo[0].is_free === 1, 
            reason: lessonInfo[0].is_free === 1 ? null : 'not_enrolled' 
          };
        } else {
          // إذا لم يكن عمود is_free موجود، اعتبر الدرس مجاني
          return { hasAccess: true };
        }
      }

      // للمستخدمين المسجلين - السماح بالوصول (مُبسط)
      const lessonExists = await query('SELECT id FROM lessons WHERE id = ?', [lessonId]);
      
      if (lessonExists.length === 0) {
        return { hasAccess: false, reason: 'lesson_not_found' };
      }

      return { hasAccess: true };

    } catch (error) {
      console.error('❌ خطأ في التحقق من إمكانية الوصول:', error);
      return { hasAccess: false, reason: 'error' };
    }
  }

  static async getCourseeLessons(courseId, userId = null) {
    try {
      const availableColumns = await this.getAvailableColumns();
      const selectFields = await this.buildSelectQuery(availableColumns);

      const lessonsQuery = `
        SELECT ${selectFields}
        FROM lessons l
        WHERE l.course_id = ?
        ORDER BY l.id ASC
      `;

      const lessons = await query(lessonsQuery, [courseId]);
      
      // إضافة القيم الافتراضية للدروس
      const enrichedLessons = lessons.map(lesson => ({
        id: lesson.id,
        title: lesson.title,
        slug: lesson.slug || `lesson-${lesson.id}`,
        description: lesson.description || '',
        duration: lesson.duration || '00:00',
        order_index: lesson.order_index || lesson.id,
        is_free: lesson.is_free !== undefined ? lesson.is_free : 0,
        course_id: lesson.course_id,
        section_id: lesson.section_id,
        // إضافة قيم افتراضية للتقدم
        section_title: 'قسم غير محدد',
        section_order: 1,
        is_completed: 0,
        watch_time: 0,
        progress_percentage: 0,
        last_watched_at: null
      }));

      return enrichedLessons;

    } catch (error) {
      console.error('❌ خطأ في جلب دروس الكورس:', error);
      throw error;
    }
  }

  static async recordWatchTime(lessonId, userId, watchData) {
    try {
      const tablesResult = await query("SHOW TABLES LIKE 'lesson_progress'");
      if (tablesResult.length === 0) {
        return {
          lesson_id: lessonId,
          watch_time: watchData.watch_time || 0,
          progress_percentage: 0,
          message: 'تم تسجيل المشاهدة (جدول lesson_progress غير موجود)'
        };
      }

      const { watch_time, current_position, total_duration } = watchData;
      const progressPercentage = total_duration > 0 
        ? Math.min(Math.round((current_position / total_duration) * 100), 100)
        : 0;

      // إنشاء أو تحديث تقدم الدرس
      const upsertQuery = `
        INSERT INTO lesson_progress (lesson_id, user_id, watch_time, progress_percentage) 
        VALUES (?, ?, ?, ?)
        ON DUPLICATE KEY UPDATE 
        watch_time = GREATEST(watch_time, VALUES(watch_time)),
        progress_percentage = VALUES(progress_percentage)
      `;

      await query(upsertQuery, [lessonId, userId, watch_time, progressPercentage]);

      return {
        lesson_id: lessonId,
        watch_time: watch_time || 0,
        current_position: current_position || 0,
        progress_percentage: progressPercentage,
        updated_at: new Date().toISOString()
      };

    } catch (error) {
      console.error('❌ خطأ في تسجيل المشاهدة:', error);
      throw error;
    }
  }

  static async markAsCompleted(lessonId, userId) {
    try {
      const tablesResult = await query("SHOW TABLES LIKE 'lesson_progress'");
      if (tablesResult.length === 0) {
        return {
          lesson_progress: {
            lesson_id: lessonId,
            is_completed: true,
            message: 'تم تحديد كمكتمل (جدول lesson_progress غير موجود)'
          }
        };
      }

      const upsertQuery = `
        INSERT INTO lesson_progress (lesson_id, user_id, is_completed, progress_percentage) 
        VALUES (?, ?, 1, 100)
        ON DUPLICATE KEY UPDATE is_completed = 1, progress_percentage = 100
      `;

      await query(upsertQuery, [lessonId, userId]);

      return {
        lesson_progress: {
          lesson_id: lessonId,
          is_completed: true,
          completed_at: new Date().toISOString(),
          progress_percentage: 100
        }
      };

    } catch (error) {
      console.error('❌ خطأ في تحديد الدرس كمكتمل:', error);
      throw error;
    }
  }
}

module.exports = Lesson;