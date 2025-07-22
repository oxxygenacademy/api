const express = require('express');
const { body, param } = require('express-validator');
const AuthController = require('../controllers/authController');
const { authenticateToken } = require('../middleware/auth');

const router = express.Router();

// تسجيل مستخدم جديد
router.post('/register', [
  body('email')
    .isEmail()
    .normalizeEmail()
    .withMessage('البريد الإلكتروني غير صحيح'),
  body('password')
    .isLength({ min: 6 })
    .withMessage('كلمة المرور يجب أن تكون 6 أحرف على الأقل'),
  body('name')
    .trim()
    .isLength({ min: 2, max: 100 })
    .withMessage('الاسم يجب أن يكون بين 2-100 حرف')
], AuthController.register);

// تسجيل الدخول مع دعم الجهاز الواحد
router.post('/login', [
  body('email')
    .isEmail()
    .normalizeEmail()
    .withMessage('البريد الإلكتروني غير صحيح'),
  body('password')
    .notEmpty()
    .withMessage('كلمة المرور مطلوبة'),
  body('remember_me')
    .optional()
    .isBoolean()
    .withMessage('remember_me يجب أن يكون true أو false'),
  body('single_device')
    .optional()
    .isBoolean()
    .withMessage('single_device يجب أن يكون true أو false'),
  body('device_name')
    .optional()
    .isString()
    .trim()
    .isLength({ max: 100 })
    .withMessage('اسم الجهاز يجب أن يكون نص أقل من 100 حرف')
], AuthController.login);

// تجديد التوكن
router.post('/refresh', [
  body('refresh_token')
    .optional()
    .isString()
    .withMessage('توكن التجديد يجب أن يكون نص')
], AuthController.refreshToken);

// تسجيل الخروج
router.post('/logout', [
  body('reason')
    .optional()
    .isString()
    .withMessage('سبب الخروج يجب أن يكون نص')
], AuthController.logout);

// تسجيل الخروج من جميع الأجهزة
router.post('/logout-all', authenticateToken, AuthController.logoutAll);

// معلومات المستخدم الحالي
router.get('/me', authenticateToken, AuthController.me);

// جلب الجلسات النشطة
router.get('/sessions', authenticateToken, AuthController.getActiveSessions);

// إنهاء جلسة محددة
router.delete('/sessions/:sessionId', [
  param('sessionId').isInt().withMessage('معرف الجلسة يجب أن يكون رقم'),
  authenticateToken
], AuthController.revokeSession);

module.exports = router;