const Course = require('../models/Course');
const Enrollment = require('../models/Enrollment');
const { sendSuccess, sendError, sendNotFound, sendValidationError } = require('../utils/response');
const { validationResult } = require('express-validator');

class CoursesController {
  // جلب قائمة الكورسات
  static async getCourses(req, res) {
    try {
      const {
        category,
        category_slug,
        difficulty,
        featured,
        search,
        price_min,
        price_max,
        free_only,
        sort = 'created_at',
        order = 'DESC',
        page = 1,
        limit = 12
      } = req.query;

      const offset = (page - 1) * limit;
      
      const filters = {
        category,
        category_slug,
        difficulty,
        featured: featured === 'true',
        search,
        price_min,
        price_max,
        free_only: free_only === 'true',
        sort,
        order,
        limit: parseInt(limit),
        offset: parseInt(offset)
      };

      const courses = await Course.findAll(filters);
      
      // حساب العدد الإجمالي للصفحة
      const totalFilters = { ...filters };
      delete totalFilters.limit;
      delete totalFilters.offset;
      const totalCourses = await Course.findAll(totalFilters);
      
      const pagination = {
        current_page: parseInt(page),
        per_page: parseInt(limit),
        total: totalCourses.length,
        total_pages: Math.ceil(totalCourses.length / limit),
        has_next: page * limit < totalCourses.length,
        has_prev: page > 1
      };

      sendSuccess(res, {
        courses,
        pagination,
        filters: req.query
      }, 'تم جلب الكورسات بنجاح');
      
    } catch (error) {
      sendError(res, error);
    }
  }

  // جلب تفاصيل كورس
  static async getCourseDetails(req, res) {
    try {
      const { id } = req.params;
      const userId = req.user?.id;

      // البحث بالمعرف أو slug
      let course;
      if (isNaN(id)) {
        course = await Course.findBySlug(id, userId);
      } else {
        course = await Course.findByIdDetailed(id, userId);
      }
      
      if (!course) {
        return sendNotFound(res, 'الكورس غير موجود');
      }

      // جلب إحصائيات الكورس
      const stats = await Course.getStats(course.id);
      
      sendSuccess(res, {
        course: {
          ...course,
          stats
        }
      }, 'تم جلب تفاصيل الكورس بنجاح');
      
    } catch (error) {
      sendError(res, error);
    }
  }

  // الكورسات المميزة
  static async getFeaturedCourses(req, res) {
    try {
      const { limit = 6 } = req.query;
      const courses = await Course.findFeatured(parseInt(limit));
      
      sendSuccess(res, { courses }, 'تم جلب الكورسات المميزة بنجاح');
      
    } catch (error) {
      sendError(res, error);
    }
  }

  // فئات الكورسات
  static async getCategories(req, res) {
    try {
      const categories = await Course.getCategories();
      
      sendSuccess(res, { categories }, 'تم جلب الفئات بنجاح');
      
    } catch (error) {
      sendError(res, error);
    }
  }

  // البحث في الكورسات
  static async searchCourses(req, res) {
    try {
      const { q: searchTerm, category, difficulty, limit = 20 } = req.query;
      
      if (!searchTerm || searchTerm.trim().length < 2) {
        return sendError(res, 'يجب أن يكون البحث مكون من حرفين على الأقل', 400);
      }

      const filters = { category, difficulty, limit: parseInt(limit) };
      const courses = await Course.search(searchTerm.trim(), filters);
      
      sendSuccess(res, {
        courses,
        search_term: searchTerm,
        filters,
        count: courses.length
      }, `تم العثور على ${courses.length} نتيجة`);
      
    } catch (error) {
      sendError(res, error);
    }
  }

  // الاشتراك في كورس
  static async enrollCourse(req, res) {
    try {
      const errors = validationResult(req);
      if (!errors.isEmpty()) {
        return sendValidationError(res, errors.array());
      }

      const { id } = req.params;
      const userId = req.user.id;

      // التحقق من وجود الكورس
      const course = await Course.findByIdDetailed(id);
      if (!course) {
        return sendNotFound(res, 'الكورس غير موجود');
      }

      // التحقق من الاشتراك المسبق
      const existingEnrollment = await Enrollment.findByUserAndCourse(userId, id);
      if (existingEnrollment) {
        return sendError(res, 'أنت مشترك في هذا الكورس مسبقاً', 409);
      }

      // إنشاء الاشتراك
      const enrollment = await Enrollment.create({
        user_id: userId,
        course_id: id,
        payment_status: course.price > 0 ? 'pending' : 'free',
        payment_amount: course.price
      });

      sendSuccess(res, {
        enrollment_id: enrollment.insertId,
        course_title: course.title,
        course_id: id,
        enrolled_at: new Date().toISOString(),
        payment_status: course.price > 0 ? 'pending' : 'free'
      }, 'تم الاشتراك في الكورس بنجاح', 201);
      
    } catch (error) {
      sendError(res, error);
    }
  }

  // إلغاء الاشتراك
  static async unenrollCourse(req, res) {
    try {
      const { id } = req.params;
      const userId = req.user.id;

      const enrollment = await Enrollment.findByUserAndCourse(userId, id);
      if (!enrollment) {
        return sendNotFound(res, 'لست مشتركاً في هذا الكورس');
      }

      await Enrollment.delete(enrollment.id);
      
      sendSuccess(res, null, 'تم إلغاء الاشتراك بنجاح');
      
    } catch (error) {
      sendError(res, error);
    }
  }

  // فصول الكورس مع الدروس
  static async getCourseSections(req, res) {
    try {
      const { id } = req.params;
      const userId = req.user?.id;

      // التحقق من الاشتراك إذا كان المستخدم مسجل دخول
      if (userId) {
        const enrollment = await Enrollment.findByUserAndCourse(userId, id);
        if (!enrollment) {
          return sendError(res, 'يجب الاشتراك في الكورس أولاً', 403);
        }
      }

      const course = await Course.findByIdDetailed(id, userId);
      if (!course) {
        return sendNotFound(res, 'الكورس غير موجود');
      }

      sendSuccess(res, {
        course_id: course.id,
        course_title: course.title,
        sections: course.sections
      }, 'تم جلب فصول الكورس بنجاح');
      
    } catch (error) {
      sendError(res, error);
    }
  }
}

module.exports = CoursesController;