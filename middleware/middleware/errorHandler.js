const { sendError } = require('../utils/response');

const errorHandler = (error, req, res, next) => {
  console.error('❌ خطأ في النظام:', {
    message: error.message,
    stack: error.stack,
    url: req.url,
    method: req.method,
    user: req.user?.id,
    timestamp: new Date().toISOString()
  });

  // أخطاء قاعدة البيانات
  if (error.code) {
    switch (error.code) {
      case 'ER_SUBQUERY_NO_1_ROW':
        return sendError(res, 'خطأ في استعلام قاعدة البيانات - نتائج متعددة غير متوقعة', 500, {
          code: 'DATABASE_SUBQUERY_ERROR',
          details: 'تم إرجاع أكثر من نتيجة واحدة من الاستعلام الفرعي'
        });
      
      case 'ER_NO_SUCH_TABLE':
        return sendError(res, 'خطأ في هيكل قاعدة البيانات', 500, {
          code: 'DATABASE_STRUCTURE_ERROR'
        });
      
      case 'ER_DUP_ENTRY':
        return sendError(res, 'البيانات موجودة مسبقاً', 409, {
          code: 'DUPLICATE_ENTRY'
        });
      
      case 'ER_ACCESS_DENIED_ERROR':
        return sendError(res, 'خطأ في الاتصال بقاعدة البيانات', 500, {
          code: 'DATABASE_CONNECTION_ERROR'
        });
      
      default:
        return sendError(res, 'خطأ في قاعدة البيانات', 500, {
          code: 'DATABASE_ERROR',
          dbError: error.code
        });
    }
  }

  // أخطاء JWT
  if (error.name === 'JsonWebTokenError') {
    return sendError(res, 'توكن غير صالح', 401, {
      code: 'INVALID_TOKEN'
    });
  }

  if (error.name === 'TokenExpiredError') {
    return sendError(res, 'انتهت صلاحية التوكن', 401, {
      code: 'TOKEN_EXPIRED'
    });
  }

  // خطأ عام
  return sendError(res, 'حدث خطأ داخلي في الخادم', 500, {
    code: 'INTERNAL_SERVER_ERROR'
  });
};

module.exports = errorHandler;
