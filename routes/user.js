const express = require('express');
const { body, param } = require('express-validator');
const UserController = require('../controllers/userController');
const { authenticateToken } = require('../middleware/auth');

const router = express.Router();

// الملف الشخصي
router.get('/profile', authenticateToken, UserController.getProfile);
router.put('/profile', [
  authenticateToken,
  body('name').optional().isLength({ min: 2, max: 100 }).withMessage('الاسم يجب أن يكون بين 2-100 حرف'),
  body('bio').optional().isLength({ max: 500 }).withMessage('السيرة الذاتية يجب ألا تتجاوز 500 حرف'),
  body('phone').optional().isMobilePhone().withMessage('رقم الهاتف غير صالح')
], UserController.updateProfile);

// كورساتي
router.get('/my-courses', authenticateToken, UserController.getMyCourses);

// المفضلات
router.get('/favorites', authenticateToken, UserController.getFavorites);
router.post('/favorites/:courseId', [
  authenticateToken,
  param('courseId').isInt().withMessage('معرف الكورس يجب أن يكون رقم')
], UserController.toggleFavorite);

// الإنجازات
router.get('/achievements', authenticateToken, UserController.getAchievements);

// الشهادات
router.get('/certificates', authenticateToken, UserController.getCertificates);

module.exports = router;