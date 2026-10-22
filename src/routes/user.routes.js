const express = require('express');
const ctrl = require('../controllers/user.controller');
const validate = require('../middleware/validate');
const { authenticate, authorize } = require('../middleware/auth');
const asyncHandler = require('../utils/asyncHandler');
const { updateRoleSchema } = require('../validators/auth.validators');

const router = express.Router();

router.use(authenticate, authorize('admin'));

router.get('/', asyncHandler(ctrl.listUsers));
router.get('/:id', asyncHandler(ctrl.getUser));
router.patch('/:id/role', validate(updateRoleSchema), asyncHandler(ctrl.updateRole));
router.delete('/:id', asyncHandler(ctrl.deleteUser));

module.exports = router;
