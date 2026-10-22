const ApiError = require('../utils/ApiError');
const { isProduction, isTest } = require('../config/env');

const notFound = (req, _res, next) => next(ApiError.notFound(`Route ${req.originalUrl} not found`));

const errorHandler = (err, _req, res, _next) => {
  let error = err;

  if (err.type === 'entity.parse.failed') {
    error = ApiError.badRequest('Malformed JSON body');
  } else if (err.name === 'CastError') {
    error = ApiError.badRequest(`Invalid ${err.path}`);
  } else if (err.code === 11000) {
    error = ApiError.conflict('Resource already exists');
  } else if (!(err instanceof ApiError)) {
    if (!isTest) console.error(err);
    error = new ApiError(500, isProduction ? 'Internal server error' : err.message);
  }

  const body = { success: false, message: error.message };
  if (error.details) body.errors = error.details;
  res.status(error.statusCode).json(body);
};

module.exports = { notFound, errorHandler };
