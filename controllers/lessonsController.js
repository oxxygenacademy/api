const Lesson = require('../models/Lesson');
const { sendSuccess, sendError, sendNotFound, sendForbidden } = require('../utils/response');

class LessonsController {
  // جلب تفاصيل درس (محسّن ومُقاوم للأخطاء)
  static async getLesson(req, res) {
    try {
      const { id } = req.params;
      const userId = req.user?.id;

      console.log(`🔍 طلب جلب الدرس: ${id} للمستخدم: ${userId || 'غير مسجل'}`);

      // التحقق من صحة معرف الدرس
      if (!id || isNaN(parseInt(id))) {
        return sendError(res, 'معرف الدرس غير صالح', 400);
      }

      // جلب تفاصيل الدرس
      const lesson = await Lesson.findById(parseInt(id), userId);

      if (!lesson) {
        return sendNotFound(res, 'الدرس غير موجود');
      }

      console.log(`✅ تم العثور على الدرس: ${lesson.title}`);

      // التحقق من إمكانية الوصول للدرس
      const accessCheck = await Lesson.checkLessonAccess(parseInt(id), userId);
      
      if (!accessCheck.hasAccess) {
        if (accessCheck.reason === 'not_enrolled') {
          return sendForbidden(res, 'يجب الاشتراك في الكورس أولاً للوصول لهذا الدرس');
        } else if (accessCheck.reason === 'lesson_not_found') {
          return sendNotFound(res, 'الدرس غير موجود');
        } else {
          return sendForbidden(res, 'ليس لديك صلاحية للوصول لهذا الدرس');
        }
      }

      // جلب التنقل والموارد بشكل آمن
      let navigation = {
        next_lesson: null,
        previous_lesson: null
      };
      let resources = [];

      try {
        console.log('🔍 جلب التنقل والموارد...');
        
        // جلب التنقل
        const [nextLesson, previousLesson] = await Promise.allSettled([
          Lesson.getNextLesson(lesson),
          Lesson.getPreviousLesson(lesson)
        ]);

        if (nextLesson.status === 'fulfilled' && nextLesson.value) {
          navigation.next_lesson = {
            id: nextLesson.value.id,
            title: nextLesson.value.title,
            slug: nextLesson.value.slug,
            duration: nextLesson.value.duration,
            is_free: nextLesson.value.is_free
          };
        }

        if (previousLesson.status === 'fulfilled' && previousLesson.value) {
          navigation.previous_lesson = {
            id: previousLesson.value.id,
            title: previousLesson.value.title,
            slug: previousLesson.value.slug,
            duration: previousLesson.value.duration,
            is_free: previousLesson.value.is_free
          };
        }

        // جلب الموارد
        try {
          resources = await Lesson.getLessonResources(parseInt(id));
        } catch (resourcesError) {
          console.log('⚠️ خطأ في جلب موارد الدرس:', resourcesError.message);
          resources = [];
        }

        console.log('✅ تم جلب التنقل والموارد بنجاح');

      } catch (navigationError) {
        console.log('⚠️ خطأ في جلب التنقل:', navigationError.message);
        // متابعة بدون التنقل
      }

      // تجميع الاستجابة النهائية
      const response = {
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
          resources: resources,
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
      };

      console.log('🎉 تم إرسال بيانات الدرس بنجاح');
      sendSuccess(res, response, 'تم جلب تفاصيل الدرس بنجاح');

    } catch (error) {
      console.error('❌ خطأ كامل في جلب الدرس:', error);
      sendError(res, 'حدث خطأ في جلب تفاصيل الدرس');
    }
  }

  // باقي الدوال...
  static async getCourseLessons(req, res) {
    try {
      const { courseId } = req.params;
      const userId = req.user?.id;

      if (!courseId || isNaN(parseInt(courseId))) {
        return sendError(res, 'معرف الكورس غير صالح', 400);
      }

      const lessons = await Lesson.getCourseeLessons(parseInt(courseId), userId);

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

  static async recordWatch(req, res) {
    try {
      const { id } = req.params;
      const userId = req.user.id;
      const watchData = req.body;

      if (!id || isNaN(parseInt(id))) {
        return sendError(res, 'معرف الدرس غير صالح', 400);
      }

      const accessCheck = await Lesson.checkLessonAccess(parseInt(id), userId);
      if (!accessCheck.hasAccess) {
        return sendForbidden(res, 'ليس لديك صلاحية للوصول لهذا الدرس');
      }

      const progress = await Lesson.recordWatchTime(parseInt(id), userId, watchData);

      sendSuccess(res, { progress }, 'تم تسجيل المشاهدة بنجاح');

    } catch (error) {
      console.error('❌ خطأ في تسجيل المشاهدة:', error);
      sendError(res, 'حدث خطأ في تسجيل المشاهدة');
    }
  }

  static async markComplete(req, res) {
    try {
      const { id } = req.params;
      const userId = req.user.id;

      if (!id || isNaN(parseInt(id))) {
        return sendError(res, 'معرف الدرس غير صالح', 400);
      }

      const accessCheck = await Lesson.checkLessonAccess(parseInt(id), userId);
      if (!accessCheck.hasAccess) {
        return sendForbidden(res, 'ليس لديك صلاحية للوصول لهذا الدرس');
      }

      const result = await Lesson.markAsCompleted(parseInt(id), userId);

      sendSuccess(res, result, 'تم تحديد الدرس كمكتمل بنجاح');

    } catch (error) {
      console.error('❌ خطأ في تحديد الدرس كمكتمل:', error);
      sendError(res, 'حدث خطأ في تحديد الدرس كمكتمل');
    }
  }
}

module.exports = LessonsController;