/**
 * Cloud Functions 入口文件
 *
 * 导入所有 Callable Function
 * 使用 Firebase Functions v1 写法
 */

const admin = require("firebase-admin");

admin.initializeApp();

// 导入 submitBookingRequest
const { submitBookingRequest } = require("./submitBookingRequest");

exports.submitBookingRequest = submitBookingRequest;