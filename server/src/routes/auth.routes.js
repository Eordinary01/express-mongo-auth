const express = require('express');
const rateLimit = require('express-rate-limit');
const ctrl = require('../controllers/auth.controller');
const validate = require('../middleware/validate');
const { authenticate } = require('../middleware/auth');
const asyncHandler = require('../utils/asyncHandler');
const { isTest } = require('../config/env');
const {
  registerSchema,
  loginSchema,
  refreshSchema,
  changePasswordSchema,
} = require('../validators/auth.validators');

const router = express.Router();

const authLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  limit: 20,
  standardHeaders: 'draft-7',
  legacyHeaders: false,
  skip: () => isTest,
  message: { success: false, message: 'Too many attempts, please try again later' },
});

router.post('/register', authLimiter, validate(registerSchema), asyncHandler(ctrl.register));
router.post('/login', authLimiter, validate(loginSchema), asyncHandler(ctrl.login));
router.post('/refresh', validate(refreshSchema), asyncHandler(ctrl.refresh));
router.post('/logout', validate(refreshSchema), asyncHandler(ctrl.logout));
router.post('/logout-all', authenticate, asyncHandler(ctrl.logoutAll));
router.get('/me', authenticate, asyncHandler(ctrl.me));
router.patch(
  '/password',
  authenticate,
  validate(changePasswordSchema),
  asyncHandler(ctrl.changePassword),
);

module.exports = router;
