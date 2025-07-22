const express = require('express');
const { param } = require('express-validator');
const LessonsController = require('../controllers/lessonsController');
const { authenticateToken, optionalAuth } = require('../middleware/auth');

const router = express.Router();

// جلب تفاصيل درس (مع مصادقة اختيارية)
router.get('/:id', [
  param('id').isInt().withMessage('معرف الدرس يجب أن يكون رقم'),
  optionalAuth
], LessonsController.getLesson);

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

// تسجيل مشاهدة درس (يتطلب مصادقة)
router.post('/:id/watch', [
  param('id').isInt().withMessage('معرف الدرس يجب أن يكون رقم'),
  authenticateToken
], LessonsController.recordWatch);

// تحديد درس كمكتمل (يتطلب مصادقة)
router.post('/:id/complete', [
  param('id').isInt().withMessage('معرف الدرس يجب أن يكون رقم'),
  authenticateToken
], LessonsController.markComplete);

module.exports = router;
