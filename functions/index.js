const functions = require("firebase-functions");
const admin = require("firebase-admin");

admin.initializeApp();

// 测试版 submitBookingRequest - 不写入数据库，只返回成功消息
// 用于验证本地 functions emulator 链路是否连通
exports.submitBookingRequest = functions.https.onCall((data, context) => {
  return {
    success: true,
    message: "submitBookingRequest callable connected"
  };
});