const express = require('express');
const { body, param } = require('express-validator');
const LessonsController = require('../controllers/lessonsController');
const { authenticateToken, optionalAuth } = require('../middleware/auth');

const router = express.Router();

// جلب دروس كورس محدد
router.get('/course/:courseId', [
  param('courseId').isInt().withMessage('معرف الكورس يجب أن يكون رقم'),
  optionalAuth
], LessonsController.getCourseLessons);

// جلب دروس فصل محدد
router.get('/section/:sectionId', [
  param('sectionId').isInt().withMessage('معرف الفصل يجب أن يكون رقم'),
  optionalAuth
], LessonsController.getSectionLessons);

// جلب درس محدد
router.get('/:id', [
  param('id').isInt().withMessage('معرف الدرس يجب أن يكون رقم'),
  optionalAuth
], LessonsController.getLesson);

// تسجيل مشاهدة درس
router.post('/:id/watch', [
  param('id').isInt().withMessage('معرف الدرس يجب أن يكون رقم'),
  authenticateToken
], LessonsController.recordWatch);

// تحديث تقدم الدرس
router.put('/:id/progress', [
  param('id').isInt().withMessage('معرف الدرس يجب أن يكون رقم'),
  body('watched_duration').isInt({ min: 0 }).withMessage('مدة المشاهدة يجب أن تكون رقم موجب'),
  body('last_watched_position').isInt({ min: 0 }).withMessage('موضع المشاهدة يجب أن يكون رقم موجب'),
  body('completion_percentage').optional().isInt({ min: 0, max: 100 }).withMessage('نسبة الإكمال يجب أن تكون بين 0 و 100'),
  authenticateToken
], LessonsController.updateLessonProgress);

// تحديد الدرس كمكتمل
router.post('/:id/complete', [
  param('id').isInt().withMessage('معرف الدرس يجب أن يكون رقم'),
  authenticateToken
], LessonsController.markAsCompleted);

module.exports = router;