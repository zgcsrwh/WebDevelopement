/**
 * settleNoShowBookings - 未到场 no-show 自动结算
 *
 * 每小时第 15 分钟运行
 * 扫描已过预约开始时间 15 分钟但未被 check-in 的 accepted booking
 * 自动更新为 no_show 状态
 */

const functions = require("firebase-functions");
const admin = require("firebase-admin");
const { FieldValue } = require("firebase-admin/firestore");

const db = admin.firestore();

// 引入公共时间工具
const { getNoShowTarget } = require("./utils/time");

/**
 * no-show 自动结算核心逻辑
 *
 * @param {Date} now - 可选，默认 new Date()
 * @returns {object} { scanned, settled, skipped, notificationFailures }
 */
async function processNoShowSettlements(now = new Date()) {
  const result = {
    scanned: 0,
    settled: 0,
    skipped: 0,
    notificationFailures: 0,
  };

  // 计算 targetDate / targetHour（当前 - 15 分钟后的整点）
  const { targetDate, targetHour } = getNoShowTarget(now);

  console.log(`[settleNoShowBookings] Processing for ${targetDate} ${targetHour}:00`);

  // 查询匹配 request
  const snapshot = await db
    .collection("request")
    .where("status", "==", "accepted")
    .where("date", "==", targetDate)
    .where("start_time", "==", targetHour)
    .get();

  result.scanned = snapshot.size;
  console.log(`[settleNoShowBookings] Found ${snapshot.size} matching requests`);

  // 处理每个 request
  for (const doc of snapshot.docs) {
    const requestId = doc.id;

    try {
      // transaction 返回是否需要创建 notification
      const shouldNotify = await db.runTransaction(async (transaction) => {
        const requestRef = db.collection("request").doc(requestId);
        const requestDoc = await transaction.get(requestRef);

        if (!requestDoc.exists) {
          return { action: "skip" };
        }

        const request = requestDoc.data();

        // 检查状态仍然是 accepted（可能被 Staff check-in 了）
        if (String(request.status || "").toLowerCase() !== "accepted") {
          return { action: "skip" };
        }

        // 更新 request 为 no_show
        transaction.update(requestRef, {
          status: "no_show",
          completed_at: FieldValue.serverTimestamp(),
          updated_at: FieldValue.serverTimestamp(),
        });

        // 返回 request 数据用于后续创建 notification
        return { action: "notify", request };
      });

      // 根据 transaction 返回结果处理
      if (shouldNotify.action === "skip") {
        result.skipped += 1;
        continue;
      }

      // action === "notify"，创建 notification
      if (shouldNotify.action === "notify" && shouldNotify.request) {
        try {
          const notifRef = db.collection("notification").doc();
          await notifRef.set({
            member_id: shouldNotify.request.member_id,
            message: "You did not arrive for your booking on time. This has been recorded as a no-show.",
            type: "facility_request",
            status_context: "no_show",
            reference_id: requestId,
            is_read: false,
            created_at: FieldValue.serverTimestamp(),
          });
          result.settled += 1;
          console.log(`[settleNoShowBookings] Settled no-show for request ${requestId}`);
        } catch (notifError) {
          result.notificationFailures += 1;
          console.error(`[settleNoShowBookings] Failed to create notification for ${requestId}:`, notifError.message);
        }
      }
    } catch (error) {
      result.skipped += 1;
      console.error(`[settleNoShowBookings] Error processing request ${requestId}:`, error.message);
    }
  }

  console.log(`[settleNoShowBookings] Done. scanned=${result.scanned}, settled=${result.settled}, skipped=${result.skipped}, notificationFailures=${result.notificationFailures}`);

  return result;
}

// Cloud Function 入口
exports.settleNoShowBookings = functions.pubsub
  .schedule("15 * * * *")
  .timeZone("Europe/London")
  .onRun(async (context) => {
    console.log("[settleNoShowBookings] Starting...");
    try {
      const result = await processNoShowSettlements();
      console.log("[settleNoShowBookings] Completed:", result);
    } catch (error) {
      console.error("[settleNoShowBookings] Error:", error.message);
    }
  });

// 导出核心逻辑供测试使用
module.exports = {
  settleNoShowBookings: exports.settleNoShowBookings,
  processNoShowSettlements,
};