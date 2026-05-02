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

// 导入 processBookingApproval
const { processBookingApproval } = require("./processBookingApproval");
exports.processBookingApproval = processBookingApproval;

// 导入 cancelConfirmedBooking
const { cancelConfirmedBooking } = require("./cancelConfirmedBooking");
exports.cancelConfirmedBooking = cancelConfirmedBooking;

// 导入 withdrawPendingBooking
const { withdrawPendingBooking } = require("./withdrawPendingBooking");
exports.withdrawPendingBooking = withdrawPendingBooking;

// 导入 checkInBooking
const { checkInBooking } = require("./checkInBooking");
exports.checkInBooking = checkInBooking;

// 导入 sendBookingReminders
const { sendBookingReminders } = require("./sendBookingReminders");
exports.sendBookingReminders = sendBookingReminders;

// 导入 settleNoShowBookings
const { settleNoShowBookings } = require("./settleNoShowBookings");
exports.settleNoShowBookings = settleNoShowBookings;