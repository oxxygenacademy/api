const Lesson = require('../models/Lesson');
const LessonProgress = require('../models/LessonProgress');
const Enrollment = require('../models/Enrollment');
const Section = require('../models/Section');
const { sendSuccess, sendError, sendNotFound, sendUnauthorized, sendValidationError } = require('../utils/response');
const { validationResult } = require('express-validator');

class LessonsController {
  // جلب دروس الكورس
  static async getCourseLessons(req, res) {
    try {
      const { courseId } = req.params;
      const userId = req.user?.id;

      // التحقق من الاشتراك إذا كان المستخدم مسجل دخول
      if (userId) {
        const enrollment = await Enrollment.findByUserAndCourse(userId, courseId);
        if (!enrollment) {
          return sendUnauthorized(res, 'يجب الاشتراك في الكورس أولاً');
        }
      }

      const lessons = await Lesson.findByCourse(courseId, userId);
      
      // فلترة الدروس للمستخدمين غير المشتركين (المعاينة فقط)
      const filteredLessons = userId ? lessons : lessons.filter(lesson => lesson.is_preview);

      sendSuccess(res, {
        lessons: filteredLessons,
        total_lessons: lessons.length,
        preview_lessons: lessons.filter(l => l.is_preview).length,
        course_id: courseId
      }, 'تم جلب دروس الكورس بنجاح');
      
    } catch (error) {
      sendError(res, error);
    }
  }

  // جلب دروس الفصل
  static async getSectionLessons(req, res) {
    try {
      const { sectionId } = req.params;
      const userId = req.user?.id;

      const section = await Section.findByIdDetailed(sectionId, userId);
      
      if (!section) {
        return sendNotFound(res, 'الفصل غير موجود');
      }

      // التحقق من الاشتراك إذا كان المستخدم مسجل دخول
      if (userId) {
        const enrollment = await Enrollment.findByUserAndCourse(userId, section.course_id);
        if (!enrollment) {
          return sendUnauthorized(res, 'يجب الاشتراك في الكورس أولاً');
        }
      }

      // فلترة الدروس للمستخدمين غير المشتركين
      const filteredLessons = userId ? section.lessons : section.lessons.filter(lesson => lesson.is_preview);

      sendSuccess(res, {
        section: {
          id: section.id,
          title: section.title,
          description: section.description,
          course_title: section.course_title,
          lessons_count: section.lessons_count,
          total_duration: section.total_duration
        },
        lessons: filteredLessons,
        total_lessons: section.lessons.length,
        preview_lessons: section.lessons.filter(l => l.is_preview).length
      }, 'تم جلب دروس الفصل بنجاح');
      
    } catch (error) {
      sendError(res, error);
    }
  }

  // جلب درس محدد
  static async getLesson(req, res) {
    try {
      const { id } = req.params;
      const userId = req.user?.id;

      const lesson = await Lesson.findById(id, userId);
      
      if (!lesson) {
        return sendNotFound(res, 'الدرس غير موجود');
      }

      // التحقق من صلاحية الوصول
      if (!lesson.is_preview && (!userId || !lesson.enrollment_id)) {
        return sendUnauthorized(res, 'يجب الاشتراك في الكورس لمشاهدة هذا الدرس');
      }

      // جلب الدرس التالي والسابق
      const [nextLesson, previousLesson] = await Promise.all([
        Lesson.getNextLesson(lesson.course_id, lesson.order_index, userId),
        Lesson.getPreviousLesson(lesson.course_id, lesson.order_index, userId)
      ]);

      sendSuccess(res, {
        lesson,
        navigation: {
          next_lesson: nextLesson,
          previous_lesson: previousLesson
        }
      }, 'تم جلب الدرس بنجاح');
      
    } catch (error) {
      sendError(res, error);
    }
  }

  // تحديث تقدم الدرس
  static async updateLessonProgress(req, res) {
    try {
      const errors = validationResult(req);
      if (!errors.isEmpty()) {
        return sendValidationError(res, errors.array());
      }

      const { id } = req.params;
      const userId = req.user.id;
      const {
        watched_duration,
        last_watched_position,
        completion_percentage
      } = req.body;

      // التحقق من وجود الدرس والاشتراك
      const lesson = await Lesson.findById(id, userId);
      
      if (!lesson) {
        return sendNotFound(res, 'الدرس غير موجود');
      }

      if (!lesson.enrollment_id && !lesson.is_preview) {
        return sendUnauthorized(res, 'يجب الاشتراك في الكورس أولاً');
      }

      // تحديث التقدم
      const progressData = await LessonProgress.updateProgress(userId, id, {
        watched_duration: parseInt(watched_duration),
        last_watched_position: parseInt(last_watched_position),
        completion_percentage: parseInt(completion_percentage)
      });

      // تحديث إحصائيات الدرس
      await Lesson.updateStats(id);

      sendSuccess(res, {
        progress: progressData,
        lesson_id: id
      }, 'تم تحديث التقدم بنجاح');
      
    } catch (error) {
      sendError(res, error);
    }
  }

  // تسجيل مشاهدة (لإحصائيات سريعة)
  static async recordWatch(req, res) {
    try {
      const { id } = req.params;
      const userId = req.user?.id;

      if (!userId) {
        return sendUnauthorized(res, 'يجب تسجيل الدخول');
      }

      const lesson = await Lesson.findById(id, userId);
      
      if (!lesson) {
        return sendNotFound(res, 'الدرس غير موجود');
      }

      if (!lesson.enrollment_id && !lesson.is_preview) {
        return sendUnauthorized(res, 'يجب الاشتراك في الكورس أولاً');
      }

      // تسجيل مشاهدة بسيطة
      await LessonProgress.updateProgress(userId, id, {
        watched_duration: 1,
        last_watched_position: 0,
        completion_percentage: 0
      });

      sendSuccess(res, null, 'تم تسجيل المشاهدة');
      
    } catch (error) {
      sendError(res, error);
    }
  }

  // تحديد الدرس كمكتمل
  static async markAsCompleted(req, res) {
    try {
      const { id } = req.params;
      const userId = req.user.id;

      const lesson = await Lesson.findById(id, userId);
      
      if (!lesson) {
        return sendNotFound(res, 'الدرس غير موجود');
      }

      if (!lesson.enrollment_id && !lesson.is_preview) {
        return sendUnauthorized(res, 'يجب الاشتراك في الكورس أولاً');
      }

      // تحديد الدرس كمكتمل
      const progressData = await LessonProgress.updateProgress(userId, id, {
        watched_duration: lesson.duration,
        last_watched_position: lesson.duration,
        completion_percentage: 100
      });

      sendSuccess(res, {
        progress: progressData,
        lesson_id: id
      }, 'تم تحديد الدرس كمكتمل');
      
    } catch (error) {
      sendError(res, error);
    }
  }
}

module.exports = LessonsController;