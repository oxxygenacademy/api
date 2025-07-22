const Lesson = require('../models/Lesson');
const { sendSuccess, sendError, sendNotFound, sendForbidden } = require('../utils/response');

class LessonsController {
  // جلب تفاصيل درس مع التنقل (مُصحح)
  static async getLesson(req, res) {
    try {
      const { id } = req.params;
      const userId = req.user?.id;

      console.log(`🔍 طلب جلب الدرس: ${id} للمستخدم: ${userId || 'غير مسجل'}`);

      // جلب تفاصيل الدرس
      const lesson = await Lesson.findById(id, userId);

      if (!lesson) {
        return sendNotFound(res, 'الدرس غير موجود');
      }

      // التحقق من إمكانية الوصول للدرس
      if (userId) {
        const accessCheck = await Lesson.checkLessonAccess(id, userId);
        if (!accessCheck.hasAccess) {
          if (accessCheck.reason === 'not_enrolled') {
            return sendForbidden(res, 'يجب الاشتراك في الكورس أولاً للوصول لهذا الدرس');
          }
        }
      } else if (!lesson.is_free) {
        return sendForbidden(res, 'يجب تسجيل الدخول والاشتراك في الكورس للوصول لهذا الدرس');
      }

      try {
        // جلب الدرس التالي والسابق بشكل آمن
        console.log('🔍 جلب التنقل...');
        
        const [nextLesson, previousLesson, resources] = await Promise.allSettled([
          Lesson.getNextLesson(lesson),
          Lesson.getPreviousLesson(lesson),
          Lesson.getLessonResources(id)
        ]);

        const navigation = {
          next_lesson: nextLesson.status === 'fulfilled' && nextLesson.value ? {
            id: nextLesson.value.id,
            title: nextLesson.value.title,
            slug: nextLesson.value.slug,
            duration: nextLesson.value.duration,
            is_free: nextLesson.value.is_free
          } : null,
          previous_lesson: previousLesson.status === 'fulfilled' && previousLesson.value ? {
            id: previousLesson.value.id,
            title: previousLesson.value.title,
            slug: previousLesson.value.slug,
            duration: previousLesson.value.duration,
            is_free: previousLesson.value.is_free
          } : null
        };

        const lessonResources = resources.status === 'fulfilled' ? resources.value : [];

        console.log('✅ تم جلب الدرس بنجاح');

        sendSuccess(res, {
          lesson: {
            id: lesson.id,
            title: lesson.title,
            slug: lesson.slug,
            description: lesson.description,
            content: lesson.content,
            video_url: lesson.video_url,
            video_duration: lesson.duration,
            order_index: lesson.order_index,
            is_free: lesson.is_free,
            section: {
              id: lesson.section_id,
              title: lesson.section_title,
              order: lesson.section_order
            },
            course: {
              id: lesson.course_id,
              title: lesson.course_title
            },
            resources: lessonResources,
            navigation: navigation,
            user_progress: userId ? {
              is_completed: lesson.is_completed === 1,
              watch_time: lesson.watch_time || 0,
              progress_percentage: lesson.progress_percentage || 0,
              notes: lesson.notes || '',
              bookmarked: lesson.bookmarked === 1,
              last_watched_at: lesson.last_watched_at
            } : null
          }
        }, 'تم جلب تفاصيل الدرس بنجاح');

      } catch (navigationError) {
        console.error('⚠️ خطأ في جلب التنقل:', navigationError);
        
        // إرسال الدرس بدون التنقل في حالة الخطأ
        sendSuccess(res, {
          lesson: {
            id: lesson.id,
            title: lesson.title,
            slug: lesson.slug,
            description: lesson.description,
            content: lesson.content,
            video_url: lesson.video_url,
            video_duration: lesson.duration,
            order_index: lesson.order_index,
            is_free: lesson.is_free,
            section: {
              id: lesson.section_id,
              title: lesson.section_title,
              order: lesson.section_order
            },
            course: {
              id: lesson.course_id,
              title: lesson.course_title
            },
            resources: [],
            navigation: {
              next_lesson: null,
              previous_lesson: null
            },
            user_progress: userId ? {
              is_completed: lesson.is_completed === 1,
              watch_time: lesson.watch_time || 0,
              progress_percentage: lesson.progress_percentage || 0,
              notes: lesson.notes || '',
              bookmarked: lesson.bookmarked === 1,
              last_watched_at: lesson.last_watched_at
            } : null
          }
        }, 'تم جلب تفاصيل الدرس بنجاح (بدون تنقل)');
      }

    } catch (error) {
      console.error('❌ خطأ في جلب الدرس:', error);
      sendError(res, 'حدث خطأ في جلب تفاصيل الدرس');
    }
  }

  // جلب دروس الكورس
  static async getCourseLessons(req, res) {
    try {
      const { courseId } = req.params;
      const userId = req.user?.id;

      const lessons = await Lesson.getCourseeLessons(courseId, userId);

      // تجميع الدروس حسب الفصول
      const sections = {};
      lessons.forEach(lesson => {
        if (!sections[lesson.section_id]) {
          sections[lesson.section_id] = {
            id: lesson.section_id,
            title: lesson.section_title,
            order: lesson.section_order,
            lessons: []
          };
        }
        sections[lesson.section_id].lessons.push({
          id: lesson.id,
          title: lesson.title,
          slug: lesson.slug,
          description: lesson.description,
          duration: lesson.duration,
          order_index: lesson.order_index,
          is_free: lesson.is_free,
          user_progress: userId ? {
            is_completed: lesson.is_completed === 1,
            watch_time: lesson.watch_time || 0,
            progress_percentage: lesson.progress_percentage || 0,
            last_watched_at: lesson.last_watched_at
          } : null
        });
      });

      const sectionsArray = Object.values(sections).sort((a, b) => a.order - b.order);

      sendSuccess(res, {
        lessons: sectionsArray,
        total_lessons: lessons.length,
        course_id: parseInt(courseId)
      }, 'تم جلب دروس الكورس بنجاح');

    } catch (error) {
      console.error('❌ خطأ في جلب دروس الكورس:', error);
      sendError(res, 'حدث خطأ في جلب دروس الكورس');
    }
  }

  // جلب دروس الفصل
  static async getSectionLessons(req, res) {
    try {
      const { sectionId } = req.params;
      const userId = req.user?.id;

      const lessons = await Lesson.getSectionLessons(sectionId, userId);

      const formattedLessons = lessons.map(lesson => ({
        id: lesson.id,
        title: lesson.title,
        slug: lesson.slug,
        description: lesson.description,
        duration: lesson.duration,
        order_index: lesson.order_index,
        is_free: lesson.is_free,
        section: {
          id: lesson.section_id,
          title: lesson.section_title,
          order: lesson.section_order
        },
        user_progress: userId ? {
          is_completed: lesson.is_completed === 1,
          watch_time: lesson.watch_time || 0,
          progress_percentage: lesson.progress_percentage || 0,
          last_watched_at: lesson.last_watched_at
        } : null
      }));

      sendSuccess(res, {
        lessons: formattedLessons,
        total_lessons: formattedLessons.length,
        section_id: parseInt(sectionId)
      }, 'تم جلب دروس الفصل بنجاح');

    } catch (error) {
      console.error('❌ خطأ في جلب دروس الفصل:', error);
      sendError(res, 'حدث خطأ في جلب دروس الفصل');
    }
  }

  // تسجيل مشاهدة درس
  static async recordWatch(req, res) {
    try {
      const { id } = req.params;
      const userId = req.user.id;
      const watchData = req.body;

      // التحقق من إمكانية الوصول للدرس
      const accessCheck = await Lesson.checkLessonAccess(id, userId);
      if (!accessCheck.hasAccess) {
        return sendForbidden(res, 'ليس لديك صلاحية للوصول لهذا الدرس');
      }

      const progress = await Lesson.recordWatchTime(id, userId, watchData);

      sendSuccess(res, { progress }, 'تم تسجيل المشاهدة بنجاح');

    } catch (error) {
      console.error('❌ خطأ في تسجيل المشاهدة:', error);
      sendError(res, 'حدث خطأ في تسجيل المشاهدة');
    }
  }

  // تحديد درس كمكتمل
  static async markComplete(req, res) {
    try {
      const { id } = req.params;
      const userId = req.user.id;

      // التحقق من إمكانية الوصول للدرس
      const accessCheck = await Lesson.checkLessonAccess(id, userId);
      if (!accessCheck.hasAccess) {
        return sendForbidden(res, 'ليس لديك صلاحية للوصول لهذا الدرس');
      }

      const result = await Lesson.markAsCompleted(id, userId);

      sendSuccess(res, result, 'تم تحديد الدرس كمكتمل بنجاح');

    } catch (error) {
      console.error('❌ خطأ في تحديد الدرس كمكتمل:', error);
      sendError(res, 'حدث خطأ في تحديد الدرس كمكتمل');
    }
  }
}

module.exports = LessonsController;
