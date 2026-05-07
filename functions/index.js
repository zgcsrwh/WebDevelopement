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

// 导入 upsertFacility
const { upsertFacility } = require("./upsertFacility");
exports.upsertFacility = upsertFacility;

// 导入 maintainTimeSlotWindow (scheduled function)
const { maintainTimeSlotWindow } = require("./maintainTimeSlotWindow");
exports.maintainTimeSlotWindow = maintainTimeSlotWindow;

// 导入 expirePendingBookingRequests (scheduled function)
const { expirePendingBookingRequests } = require("./expirePendingBookingRequests");
exports.expirePendingBookingRequests = expirePendingBookingRequests;

// 导入 deleteFacility
const { deleteFacility } = require("./deleteFacility");
exports.deleteFacility = deleteFacility;

// 导入 submitRepairTicket
const { submitRepairTicket } = require("./submitRepairTicket");
exports.submitRepairTicket = submitRepairTicket;

// 导入 updateTicketStatus
const { updateTicketStatus } = require("./updateTicketStatus");
exports.updateTicketStatus = updateTicketStatus;

// 导入 getUserContext
const { getUserContext } = require("./getUserContext");
exports.getUserContext = getUserContext;

// 导入 checkAccountDeletable
const { checkAccountDeletable } = require("./checkAccountDeletable");
exports.checkAccountDeletable = checkAccountDeletable;

// 导入 deleteMyAccount
const { deleteMyAccount } = require("./deleteMyAccount");
exports.deleteMyAccount = deleteMyAccount;

// 导入 createStaffAccount
const { createStaffAccount } = require("./createStaffAccount");
exports.createStaffAccount = createStaffAccount;

// 导入 disableStaffAccount
const { disableStaffAccount } = require("./disableStaffAccount");
exports.disableStaffAccount = disableStaffAccount;

// 导入 toggleMatchStatus
const { toggleMatchStatus } = require("./toggleMatchStatus");
exports.toggleMatchStatus = toggleMatchStatus;

// 导入 sendMatchRequest
const { sendMatchRequest } = require("./sendMatchRequest");
exports.sendMatchRequest = sendMatchRequest;