const express = require('express');
const { body, param, query } = require('express-validator');
const CoursesController = require('../controllers/coursesController');
const { authenticateToken, optionalAuth } = require('../middleware/auth');

const router = express.Router();

// جلب قائمة الكورسات (عام)
router.get('/', CoursesController.getCourses);

// البحث في الكورسات
router.get('/search', [
  query('q').notEmpty().withMessage('مطلوب نص البحث').isLength({ min: 2 }).withMessage('يجب أن يكون البحث مكون من حرفين على الأقل')
], CoursesController.searchCourses);

// الكورسات المميزة
router.get('/featured', CoursesController.getFeaturedCourses);

// فئات الكورسات
router.get('/categories', CoursesController.getCategories);

// تفاصيل كورس محدد (بالمعرف أو slug)
router.get('/:id', [
  param('id').notEmpty().withMessage('معرف الكورس مطلوب'),
  optionalAuth
], CoursesController.getCourseDetails);

// فصول الكورس مع الدروس
router.get('/:id/sections', [
  param('id').isInt().withMessage('معرف الكورس يجب أن يكون رقم'),
  optionalAuth
], CoursesController.getCourseSections);

// الاشتراك في كورس
router.post('/:id/enroll', [
  param('id').isInt().withMessage('معرف الكورس يجب أن يكون رقم'),
  authenticateToken
], CoursesController.enrollCourse);

// إلغاء الاشتراك
router.delete('/:id/enroll', [
  param('id').isInt().withMessage('معرف الكورس يجب أن يكون رقم'),
  authenticateToken
], CoursesController.unenrollCourse);

module.exports = router;