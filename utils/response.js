/**
 * ردود API موحدة
 */

const sendSuccess = (res, data = null, message = 'تم بنجاح', statusCode = 200) => {
  return res.status(statusCode).json({
    success: true,
    data,
    message,
    timestamp: new Date().toISOString()
  });
};

const sendError = (res, error, statusCode = 500) => {
  // تحديد نوع الخطأ
  let errorResponse = {
    success: false,
    error: {
      code: 'UNKNOWN_ERROR',
      message: 'حدث خطأ غير متوقع'
    },
    timestamp: new Date().toISOString()
  };

  // أخطاء التحقق
  if (error.name === 'ValidationError' || error.isJoi) {
    errorResponse.error = {
      code: 'VALIDATION_ERROR',
      message: 'بيانات غير صحيحة',
      details: error.details || error.message
    };
    statusCode = 400;
  }
  
  // أخطاء قاعدة البيانات
  else if (error.code) {
    switch (error.code) {
      case 'ER_DUP_ENTRY':
        errorResponse.error = {
          code: 'DUPLICATE_ENTRY',
          message: 'البيانات موجودة مسبقاً'
        };
        statusCode = 409;
        break;
      case 'ER_NO_REFERENCED_ROW_2':
        errorResponse.error = {
          code: 'FOREIGN_KEY_ERROR',
          message: 'مرجع غير صحيح'
        };
        statusCode = 400;
        break;
      default:
        errorResponse.error = {
          code: 'DATABASE_ERROR',
          message: 'خطأ في قاعدة البيانات'
        };
    }
  }
  
  // أخطاء مخصصة
  else if (typeof error === 'string') {
    errorResponse.error.message = error;
  } else if (error.message) {
    errorResponse.error.message = error.message;
  }

  // في بيئة التطوير، إضافة تفاصيل أكثر
  if (process.env.NODE_ENV === 'development') {
    errorResponse.error.stack = error.stack;
    errorResponse.error.details = error;
  }

  return res.status(statusCode).json(errorResponse);
};

const sendValidationError = (res, errors) => {
  return res.status(400).json({
    success: false,
    error: {
      code: 'VALIDATION_ERROR',
      message: 'بيانات غير صحيحة',
      details: errors
    },
    timestamp: new Date().toISOString()
  });
};

const sendNotFound = (res, message = 'العنصر غير موجود') => {
  return res.status(404).json({
    success: false,
    error: {
      code: 'NOT_FOUND',
      message
    },
    timestamp: new Date().toISOString()
  });
};

const sendUnauthorized = (res, message = 'غير مصرح') => {
  return res.status(401).json({
    success: false,
    error: {
      code: 'UNAUTHORIZED',
      message
    },
    timestamp: new Date().toISOString()
  });
};

module.exports = {
  sendSuccess,
  sendError,
  sendValidationError,
  sendNotFound,
  sendUnauthorized
};