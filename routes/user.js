const express = require('express');
const { body, param } = require('express-validator');
const UserController = require('../controllers/userController');
const { authenticateToken } = require('../middleware/auth');

const router = express.Router();

// الملف الشخصي
router.get('/profile', authenticateToken, UserController.getProfile);

// تحديث الملف الشخصي
router.put('/profile', [
  body('name')
    .optional()
    .trim()
    .isLength({ min: 2, max: 100 })
    .withMessage('الاسم يجب أن يكون بين 2-100 حرف'),
  body('email')
    .optional()
    .isEmail()
    .normalizeEmail()
    .withMessage('البريد الإلكتروني غير صحيح'),
  authenticateToken
], UserController.updateProfile);

// كورسات المستخدم
router.get('/my-courses', authenticateToken, UserController.getMyCourses);

// إنجازات المستخدم
router.get('/achievements', authenticateToken, UserController.getAchievements);

// الدروس المفضلة
router.get('/favorites', authenticateToken, UserController.getFavorites);

// إضافة/إزالة من المفضلة
router.post('/favorites/:courseId', [
  param('courseId').isInt().withMessage('معرف الكورس يجب أن يكون رقم'),
  authenticateToken
], UserController.toggleFavorite);

// تاريخ التعلم
router.get('/learning-history', authenticateToken, UserController.getLearningHistory);

// الشهادات
router.get('/certificates', authenticateToken, UserController.getCertificates);

module.exports = router;