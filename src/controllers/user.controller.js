const { User } = require('../models/User');
const ApiError = require('../utils/ApiError');

exports.listUsers = async (req, res) => {
  const page = Math.max(Number(req.query.page) || 1, 1);
  const limit = Math.min(Math.max(Number(req.query.limit) || 20, 1), 100);

  const [users, total] = await Promise.all([
    User.find()
      .sort({ createdAt: -1 })
      .skip((page - 1) * limit)
      .limit(limit),
    User.countDocuments(),
  ]);

  res.json({ success: true, page, limit, total, users });
};

exports.getUser = async (req, res) => {
  const user = await User.findById(req.params.id);
  if (!user) throw ApiError.notFound('User not found');
  res.json({ success: true, user });
};

exports.updateRole = async (req, res) => {
  if (req.params.id === req.user.id) {
    throw ApiError.badRequest('You cannot change your own role');
  }
  const user = await User.findByIdAndUpdate(
    req.params.id,
    { role: req.body.role },
    { new: true, runValidators: true },
  );
  if (!user) throw ApiError.notFound('User not found');
  res.json({ success: true, user });
};

exports.deleteUser = async (req, res) => {
  if (req.params.id === req.user.id) {
    throw ApiError.badRequest('You cannot delete your own account here');
  }
  const user = await User.findByIdAndDelete(req.params.id);
  if (!user) throw ApiError.notFound('User not found');
  res.status(204).end();
};
