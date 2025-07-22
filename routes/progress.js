const express = require('express');
const { param, query } = require('express-validator');
const ProgressController = require('../controllers/progressController');
const { authenticateToken } = require('../middleware/auth');

const router = express.Router();

// تقدم كورس محدد
router.get('/course/:courseId', [
  param('courseId').isInt().withMessage('معرف الكورس يجب أن يكون رقم'),
  authenticateToken
], ProgressController.getCourseProgress);

// إحصائيات المستخدم الشاملة
router.get('/stats', authenticateToken, ProgressController.getUserStats);

// لوحة المعلومات
router.get('/dashboard', authenticateToken, ProgressController.getDashboard);

// تقرير أسبوعي
router.get('/weekly-report', authenticateToken, ProgressController.getWeeklyReport);

// تقرير شهري
router.get('/monthly-report', authenticateToken, ProgressController.getMonthlyReport);

// مقارنة الأداء
router.get('/comparison', authenticateToken, ProgressController.getComparisonStats);

// تقدم الفصل
router.get('/section/:sectionId', [
  param('sectionId').isInt().withMessage('معرف الفصل يجب أن يكون رقم'),
  authenticateToken
], ProgressController.getSectionProgress);

// إحصائيات يومية
router.get('/daily/:date?', [
  param('date').optional().isISO8601().withMessage('تاريخ غير صحيح'),
  authenticateToken
], ProgressController.getDailyStats);

module.exports = router;