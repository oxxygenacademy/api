const express = require('express');
const { param } = require('express-validator');
const StatsController = require('../controllers/statsController');
const { authenticateToken, optionalAuth } = require('../middleware/auth');

const router = express.Router();

// إحصائيات المنصة العامة (عامة)
router.get('/platform', StatsController.getPlatformStats);

// إحصائيات المستخدم الشخصية
router.get('/user', authenticateToken, StatsController.getUserStats);

// إحصائيات كورس محدد للمستخدم
router.get('/course/:courseId', [
  param('courseId').isInt().withMessage('معرف الكورس يجب أن يكون رقم'),
  authenticateToken
], StatsController.getCourseStats);

// تحليلات الكورس (للمدرسين/الإدارة)
router.get('/course/:courseId/analytics', [
  param('courseId').isInt().withMessage('معرف الكورس يجب أن يكون رقم'),
  optionalAuth
], StatsController.getCourseAnalytics);

// إنجازات المستخدم
router.get('/achievements', authenticateToken, StatsController.getUserAchievements);

// مقارنة الأداء
router.get('/comparison', authenticateToken, StatsController.getComparisonStats);

// التقرير الأسبوعي
router.get('/weekly-report', authenticateToken, StatsController.getWeeklyReport);

// إحصائيات الفئات
router.get('/categories', StatsController.getCategoryStats);

// إحصائيات المدرسين (إضافية)
router.get('/instructors', StatsController.getInstructorStats);

// اتجاهات التعلم
router.get('/trends', StatsController.getLearningTrends);

module.exports = router;