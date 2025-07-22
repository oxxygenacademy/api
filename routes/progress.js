const express = require('express');
const { param } = require('express-validator');
const ProgressController = require('../controllers/progressController');
const { authenticateToken } = require('../middleware/auth');

const router = express.Router();

// تقدم كورس محدد
router.get('/course/:courseId', [
  param('courseId').isInt().withMessage('معرف الكورس يجب أن يكون رقم'),
  authenticateToken
], ProgressController.getCourseProgress);

// إحصائياتك الشاملة
router.get('/stats', authenticateToken, ProgressController.getUserStats);

// لوحة المعلومات
router.get('/dashboard', authenticateToken, ProgressController.getDashboard);

module.exports = router;