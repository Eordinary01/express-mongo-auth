const ApiError = require('../utils/ApiError');

const parse = (schema, input) => {
  const result = schema.safeParse(input ?? {});
  if (!result.success) {
    const details = result.error.issues.map((issue) => ({
      field: issue.path.join('.'),
      message: issue.message,
    }));
    throw ApiError.badRequest('Validation failed', details);
  }
  return result.data;
};

const validate = (schema) => (req, _res, next) => {
  try {
    req.body = parse(schema, req.body);
    return next();
  } catch (err) {
    return next(err);
  }
};

// Express 5 exposes req.query as a read-only getter, so parsed values go on req.validatedQuery.
const validateQuery = (schema) => (req, _res, next) => {
  try {
    req.validatedQuery = parse(schema, req.query);
    return next();
  } catch (err) {
    return next(err);
  }
};

module.exports = validate;
module.exports.validateQuery = validateQuery;
