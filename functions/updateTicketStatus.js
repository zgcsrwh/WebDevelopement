/**
 * updateTicketStatus Cloud Function
 *
 * Staff 将报修单标记为已解决，并触发 facility.status 恢复逻辑
 *
 * ID 类型：全部使用 string
 * Status 类型：string
 * 错误处理：throw new functions.https.HttpsError
 */

const functions = require("firebase-functions");
const admin = require("firebase-admin");
const { FieldValue } = require("firebase-admin/firestore");

const db = admin.firestore();

/**
 * updateTicketStatus - Staff 标记报修单为已解决
 */
const updateTicketStatus = functions.https.onCall(async (data, context) => {
  // ========== 1. 参数校验 ==========
  const repairId = (data.repairt_id || data.repair_id || "").trim();
  if (!repairId) {
    throw new functions.https.HttpsError("invalid-argument", "repairt_id is required");
  }

  const status = (data.status || "").trim();
  if (!status) {
    throw new functions.https.HttpsError("invalid-argument", "status is required");
  }

  if (status.toLowerCase() !== "resolved") {
    throw new functions.https.HttpsError(
      "failed-precondition",
      "Repairs can only be moved to resolved in this workflow"
    );
  }

  // ========== 2. Staff 认证 ==========
  const userId = context.auth?.uid;
  if (!userId) {
    throw new functions.https.HttpsError("unauthenticated", "User must be authenticated");
  }

  const staffDoc = await db.collection("admin_staff").doc(userId).get();
  if (!staffDoc.exists) {
    throw new functions.https.HttpsError("permission-denied", "Staff account not found");
  }

  const staffData = staffDoc.data();
  const role = String(staffData.role || "").toLowerCase();
  const staffStatus = String(staffData.status || "").toLowerCase();

  // 校验 role（只允许 Staff）
  if (role !== "staff") {
    throw new functions.https.HttpsError(
      "permission-denied",
      "Only staff can perform this operation"
    );
  }

  // 校验 status
  if (staffStatus !== "active") {
    throw new functions.https.HttpsError(
      "permission-denied",
      "Staff account is not active"
    );
  }

  // ========== 3. Transaction 内主要逻辑 ==========
  let facilityRestored = false;
  const finalFacilityStatus = await db.runTransaction(async (transaction) => {
    // 1) read repair
    const repairRef = db.collection("repair").doc(repairId);
    const repairSnapshot = await transaction.get(repairRef);

    if (!repairSnapshot.exists) {
      throw new functions.https.HttpsError("not-found", "Repair ticket not found");
    }

    const repairData = repairSnapshot.data();
    if (repairData.status !== "pending") {
      throw new functions.https.HttpsError(
        "failed-precondition",
        "Repair ticket is not pending"
      );
    }

    const facilityId = repairData.facility_id;
    if (!facilityId) {
      throw new functions.https.HttpsError("internal", "Repair ticket missing facility_id");
    }

    // 2) read facility
    const facilityRef = db.collection("facility").doc(facilityId);
    const facilitySnapshot = await transaction.get(facilityRef);

    if (!facilitySnapshot.exists) {
      throw new functions.https.HttpsError("not-found", "Facility not found");
    }

    const facilityData = facilitySnapshot.data();

    // 检查 facility.status === "deleted"
    if (facilityData.status === "deleted") {
      throw new functions.https.HttpsError(
        "failed-precondition",
        "Cannot resolve repair for deleted facility"
      );
    }

    // 3) Staff 权限校验：facility.staff_id 或 repair.staff_id 任意一个匹配 userId
    const facilityStaffId = facilityData.staff_id || "";
    const repairStaffId = repairData.staff_id || "";
    const staffIds = [facilityStaffId, repairStaffId].filter(Boolean);

    if (staffIds.length === 0) {
      console.warn(`[updateTicketStatus] Repair ${repairId} and facility ${facilityId} have no staff_id assigned`);
    } else if (!staffIds.includes(userId)) {
      throw new functions.https.HttpsError(
        "permission-denied",
        "You are not authorized to resolve this repair"
      );
    }

    // 4) query same facility pending repair
    const pendingRepairQuery = db.collection("repair")
      .where("facility_id", "==", facilityId)
      .where("status", "==", "pending");

    const pendingSnapshot = await transaction.get(pendingRepairQuery);
    const otherPendingCount = pendingSnapshot.docs.filter(doc => doc.id !== repairId).length;

    // 5) write repair
    transaction.update(repairRef, {
      status: "resolved",
      staff_id: userId,
      completed_at: FieldValue.serverTimestamp(),
      updated_at: FieldValue.serverTimestamp(),
    });

    // 6) write facility（如果没有其他 pending 且 facility 未 deleted）
    if (otherPendingCount === 0 && facilityData.status !== "deleted") {
      transaction.update(facilityRef, {
        status: "normal",
        updated_at: FieldValue.serverTimestamp(),
      });
      facilityRestored = true;
    }

    // 返回最终的 facility status
    return otherPendingCount === 0 ? "normal" : facilityData.status;
  });

  // ========== 4. 返回 ==========
  return {
    success: true,
    repairt_id: repairId,
    repair_id: repairId,
    facility_status: finalFacilityStatus,
    stats: {
      facilityRestored,
      notificationsCreated: 0,
      notificationFailures: 0
    }
  };
});

module.exports = { updateTicketStatus };