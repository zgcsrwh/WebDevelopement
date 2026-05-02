/**
 * Local Test Script for checkInBooking
 *
 * 此脚本用于本地 Emulator 测试，验证 checkInBooking 函数逻辑。
 *
 * 使用方法:
 * 1. 启动 emulators: firebase emulators:start --only auth,firestore,functions
 * 2. 在另一个终端运行 seed: node functions/scripts/seedLocalEmulator.js --member-uid=<生成的用户UID>
 * 3. 先提交一个 booking request 并 approval 为 accepted
 * 4. 运行测试: node functions/scripts/testCheckInBooking.js --scenario=xxx
 *
 * 关键设计:
 * - Staff 登录后会获取真实的 Auth UID
 * - 在 Firestore 中创建/补齐 admin_staff/{kimUid}
 * - 确保 request.staff_id === kimUid
 * - checkInBooking 有时间窗口校验：now >= bookingStart - 15min && now < bookingStart
 * - success 场景由于窗口只有 15 分钟，可能需要人工在窗口内运行
 */

// ============ 安全检查 ============

if (!process.env.FIRESTORE_EMULATOR_HOST) {
  console.error("ERROR: FIRESTORE_EMULATOR_HOST not set.");
  process.exit(1);
}

// ============ 引入 ============

// Modern Firebase Client SDK
const { initializeApp } = require("firebase/app");
const { getAuth, connectAuthEmulator, signInWithEmailAndPassword, signOut, createUserWithEmailAndPassword } = require("firebase/auth");
const { getFunctions, connectFunctionsEmulator, httpsCallable } = require("firebase/functions");

// Firebase Admin SDK
const admin = require("firebase-admin");

// ============ Firebase Client SDK 初始化 ============

const firebaseConfig = {
  apiKey: "AIzaSyDSyXsiFqEH-OLdmHFXR8k_ZtEfhP1dk40",
  authDomain: "learnfire-e5720.firebaseapp.com",
  projectId: "learnfire-e5720",
  storageBucket: "learnfire-e5720.firebasestorage.app",
  messagingSenderId: "271681004538",
  appId: "1:271681004538:web:8630b96cbf14b1e2183a43",
  measurementId: "G-TD22LFSGHH"
};

const app = initializeApp(firebaseConfig);
const auth = getAuth(app);
const functions = getFunctions(app);

// 连接 Emulator
connectAuthEmulator(auth, "http://127.0.0.1:9099", { disableWarnings: true });
connectFunctionsEmulator(functions, "127.0.0.1", 5001);

console.log("  ✓ Firebase Client SDK initialized");
console.log("  ✓ Connected to Auth Emulator: http://127.0.0.1:9099");
console.log("  ✓ Connected to Functions Emulator: http://127.0.0.1:5001");

// ============ Firebase Admin SDK 初始化 ============

admin.initializeApp({
  projectId: "learnfire-e5720"
});

const db = admin.firestore();

// ============ 命令行参数解析 ============

const args = process.argv.slice(2);
let scenario = "success";

for (const arg of args) {
  if (arg.startsWith("--scenario=")) {
    scenario = arg.replace("--scenario=", "");
  }
}

// ============ 全局变量 ============

let kimUid = null; // Kim 的真实 Auth UID
let aliceUid = null; // Alice 的真实 Auth UID

// ============ 工具函数 ============

function getTomorrowDate() {
  const d = new Date();
  d.setDate(d.getDate() + 1);
  return d.toISOString().split("T")[0];
}

function getDateAfterDays(days) {
  const d = new Date();
  d.setDate(d.getDate() + days);
  return d.toISOString().split("T")[0];
}

/**
 * 计算 check-in 窗口是否可用
 * @returns {object} { usable: boolean, startHour: string, reason: string }
 */
function calculateCheckInWindow() {
  const now = new Date();
  const currentMinute = now.getMinutes();

  // 只有当前分钟在 45-59 时，才能用下一整点构造窗口
  if (currentMinute >= 45 && currentMinute <= 59) {
    const nextHour = now.getHours() + 1;
    return {
      usable: true,
      startHour: String(nextHour).padStart(2, "0"),
      reason: `当前时间 ${now.toTimeString().slice(0, 5)}，窗口可用`
    };
  } else {
    return {
      usable: false,
      startHour: String(now.getHours() + 1).padStart(2, "0"),
      reason: `当前时间 ${now.toTimeString().slice(0, 5)}，不在可构造窗口内（需要分钟数 45-59）`
    };
  }
}

/**
 * Normalize error code for comparison
 */
function normalizeErrorCode(code) {
  if (code && code.startsWith("functions/")) {
    return code.replace("functions/", "");
  }
  return code;
}

// ============ Scenario 配置 ============
function getTodayDate() {
  return new Date().toISOString().split("T")[0];
}

const scenarios = {
  // ========== 成功场景 ==========
  "success": {
    payload: { request_id: null },
    preProcess: "create-accepted-request",
    expectedSuccess: true,
    expectedErrorCode: null,
    verifyDatabase: true,
    checkRequestStatus: "in_progress",
    expectedUnchangedStatus: "accepted",
    checkTimeWindow: true
  },

  // ========== 失败场景 ==========
  "unauthenticated": {
    payload: { request_id: "some-id" },
    preProcess: null,
    expectedSuccess: null,
    expectedErrorCode: "unauthenticated",
    verifyDatabase: false,
    skipLogin: true
  },

  "invalid-argument": {
    payload: { request_id: "" },
    preProcess: null,
    expectedSuccess: null,
    expectedErrorCode: "invalid-argument",
    verifyDatabase: false
  },

  "not-staff": {
    payload: { request_id: "some-id" },
    preProcess: null,
    expectedSuccess: null,
    expectedErrorCode: "permission-denied",
    verifyDatabase: false,
    loginAs: "member"
  },

  "inactive-staff": {
    payload: { request_id: null },
    preProcess: "inactive-staff",
    expectedSuccess: null,
    expectedErrorCode: "failed-precondition",
    verifyDatabase: false,
    loginAs: "inactive-staff",
    expectedUnchangedStatus: "accepted"
  },

  "request-not-found": {
    payload: { request_id: "non-existent-request-id" },
    preProcess: null,
    expectedSuccess: null,
    expectedErrorCode: "not-found",
    verifyDatabase: false
  },

  "not-assigned-staff": {
    payload: { request_id: null },
    preProcess: "wrong-staff-request",
    expectedSuccess: null,
    expectedErrorCode: "permission-denied",
    verifyDatabase: false,
    expectedUnchangedStatus: "accepted"
  },

  "not-yet-open": {
    payload: { request_id: null },
    preProcess: "future-request-not-yet",
    expectedSuccess: null,
    expectedErrorCode: "failed-precondition",
    verifyDatabase: false,
    expectedUnchangedStatus: "accepted"
  },

  "window-expired": {
    payload: { request_id: null },
    preProcess: "past-request-expired",
    expectedSuccess: null,
    expectedErrorCode: "failed-precondition",
    verifyDatabase: false,
    expectedUnchangedStatus: "accepted"
  },

  "already-in-progress": {
    payload: { request_id: null },
    preProcess: "in-progress-request",
    expectedSuccess: null,
    expectedErrorCode: "failed-precondition",
    verifyDatabase: false,
    expectedUnchangedStatus: "in_progress"
  }
};

// ============ 主函数 ============

async function main() {
  // 变量定义（在 try 外声明，以便 finally 访问）
  let testPassed = false;
  let failureReason = "";
  let createdRequestId = null;
  let currentScenario = null;
  let windowInfo = null;
  let shouldSkipExecution = false;

  try {
    // 计算时间窗口（在 try 内赋值，但变量已在外声明）
    windowInfo = calculateCheckInWindow();

    console.log("");
    console.log("=".repeat(60));
    console.log("checkInBooking Test Script");
    console.log("=".repeat(60));
    console.log(`Scenario: ${scenario}`);
    console.log(`Time Window Info: ${windowInfo.reason}`);
    console.log("");

    currentScenario = scenarios[scenario];
    if (!currentScenario) {
      throw new Error(`Unknown scenario: ${scenario}`);
    }

    // success 场景需要时间窗口
    if (currentScenario.checkTimeWindow && !windowInfo.usable) {
      console.log("");
      console.log("⚠️  WARNING: success 场景需要在 check-in 窗口内运行");
      console.log("⚠️  当前时间无法自动构造可用窗口");
      console.log("⚠️  请在窗口内（当前分钟 45-59）重新运行测试");
      console.log("⚠️  或者先运行其他 failure 场景验证函数逻辑");
      console.log("");
    }

  // ============ 0. 初始化 Staff 用户 ============
  console.log("Initializing Staff user...");

  let kimUser = null;
  try {
    kimUser = await signInWithEmailAndPassword(auth, "kim@test.com", "123456");
    kimUid = kimUser.user.uid;
    console.log(`  ✓ Logged in as kim@test.com, UID: ${kimUid}`);
  } catch (error) {
    if (error.code === "auth/user-not-found") {
      try {
        kimUser = await createUserWithEmailAndPassword(auth, "kim@test.com", "123456");
        kimUid = kimUser.user.uid;
        console.log(`  ✓ Created kim@test.com, UID: ${kimUid}`);
      } catch (createError) {
        throw new Error(`Failed to create kim@test.com: ${createError.message}`);
      }
    } else {
      throw new Error(`Login failed: ${error.message}`);
    }
  }

  // 在 Firestore 中创建/补齐 admin_staff/{kimUid}
  const staffRef = db.collection("admin_staff").doc(kimUid);
  await staffRef.set({
    name: "Kim Smith",
    email: "kim@test.com",
    role: "staff",
    status: "active",
    created_at: admin.firestore.FieldValue.serverTimestamp()
  });
  console.log(`  ✓ Created/updated admin_staff/${kimUid}`);

  // 尝试 Alice 登录
  let aliceUser = null;
  try {
    aliceUser = await signInWithEmailAndPassword(auth, "alice@test.com", "123456");
    aliceUid = aliceUser.user.uid;
  } catch (error) {
    if (error.code === "auth/user-not-found") {
      aliceUser = await createUserWithEmailAndPassword(auth, "alice@test.com", "123456");
      aliceUid = aliceUser.user.uid;
    }
  }
  console.log(`  ✓ Alice UID: ${aliceUid}`);

  // 确保 alice 存在于 member 集合
  const memberRef = db.collection("member").doc(aliceUid);
  const memberDoc = await memberRef.get();
  if (!memberDoc.exists) {
    await memberRef.set({
      name: "Alice",
      email: "alice@test.com",
      status: "active",
      profile_ID: "profile-001",
      created_at: admin.firestore.FieldValue.serverTimestamp()
    });
  }
  console.log(`  ✓ member/${aliceUid} exists`);

  // 先登出
  await signOut(auth);

  // ============ 1. 验证 seed 数据 ============
  console.log("");
  console.log("Verifying seed data...");

  const facilityDoc = await db.collection("facility").doc("facility-001").get();
  if (!facilityDoc.exists) {
    throw new Error("facility/facility-001 not found.");
  }
  console.log("  ✓ facility/facility-001 exists");

  // ============ 2. 执行 preProcess ============

  // 统一处理所有 preProcess 场景
  if (currentScenario.preProcess === null || currentScenario.preProcess === undefined) {
    // 无需 preProcess，跳过
  } else if (currentScenario.preProcess === "create-accepted-request") {
    console.log("Pre-processing: creating accepted request...");

    // 检查时间窗口
    if (!windowInfo.usable) {
      console.log("");
      console.log("⚠️  WARNING: success 场景需要在 check-in 窗口内运行");
      console.log("⚠️  当前时间不在可构造窗口内（需要分钟数 45-59）");
      console.log("⚠️  请在窗口内重新运行测试");
      console.log("");
      // 跳过测试，标记为通过但不执行函数
      testPassed = true;
      failureReason = "skipped: time window not available";
      shouldSkipExecution = true;
    } else {
      // 时间窗口可用：使用今天日期 + startHour
      const startHour = windowInfo.startHour;
      const bookingDate = getTodayDate();
      console.log(`  Using date: ${bookingDate}, start_hour: ${startHour} (time window available)`);

      // 创建 accepted request，staff_id 必须是 kimUid
      const requestRef = db.collection("request").doc("test-checkin-" + Date.now());
      await requestRef.set({
        member_id: aliceUid,
        facility_id: "facility-001",
        staff_id: kimUid,
        status: "accepted",
        date: bookingDate,
        start_time: startHour,
        end_time: String(parseInt(startHour) + 1).padStart(2, "0"),
        attendent: 2,
        activity_description: "Test booking for check-in",
        participant_ids: [],
        user_id_list: [],
        created_at: admin.firestore.FieldValue.serverTimestamp()
      });
      createdRequestId = requestRef.id;
      currentScenario.payload.request_id = createdRequestId;
      console.log(`  ✓ Created request: ${requestRef.id}, status: accepted, date: ${bookingDate}, start_time: ${startHour}`);
    }
  } else if (currentScenario.preProcess === "inactive-staff") {
    console.log("Pre-processing: creating inactive staff...");

    // 创建或登录 Auth 用户 inactive@test.com
    let inactiveUser = null;
    let inactiveUid = null;
    try {
      inactiveUser = await signInWithEmailAndPassword(auth, "inactive@test.com", "123456");
      inactiveUid = inactiveUser.user.uid;
    } catch (error) {
      if (error.code === "auth/user-not-found") {
        inactiveUser = await createUserWithEmailAndPassword(auth, "inactive@test.com", "123456");
        inactiveUid = inactiveUser.user.uid;
      } else {
        throw new Error(`Failed to login inactive@test.com: ${error.message}`);
      }
    }
    console.log(`  ✓ Logged in as inactive@test.com, UID: ${inactiveUid}`);

    // 在 Firestore 中创建 admin_staff/{inactiveUid}，status 为 suspended
    const inactiveStaffRef = db.collection("admin_staff").doc(inactiveUid);
    await inactiveStaffRef.set({
      name: "Inactive Staff",
      email: "inactive@test.com",
      role: "staff",
      status: "suspended",
      created_at: admin.firestore.FieldValue.serverTimestamp()
    });
    console.log(`  ✓ Created admin_staff/${inactiveUid} (suspended)`);

    // 创建一个 accepted request，staff_id = inactiveUid（用未来时间，不需要在 check-in 窗口内）
    const requestRef = db.collection("request").doc("test-inactive-" + Date.now());
    await requestRef.set({
      member_id: aliceUid,
      facility_id: "facility-001",
      staff_id: inactiveUid,
      status: "accepted",
      date: getDateAfterDays(1),
      start_time: "10",
      end_time: "11",
      attendent: 2,
      activity_description: "Test booking for inactive-staff scenario",
      participant_ids: [],
      user_id_list: [],
      created_at: admin.firestore.FieldValue.serverTimestamp()
    });
    createdRequestId = requestRef.id;
    currentScenario.payload.request_id = createdRequestId;
    console.log(`  ✓ Created request: ${requestRef.id}, status: accepted, staff_id: ${inactiveUid}`);

  } else if (currentScenario.preProcess === "wrong-staff-request") {
    console.log("Pre-processing: creating request with wrong staff_id...");

    const otherStaffUid = "staff-999-other";
    const requestRef = db.collection("request").doc("test-wrong-staff-" + Date.now());
    await requestRef.set({
      member_id: aliceUid,
      facility_id: "facility-001",
      staff_id: otherStaffUid,
      status: "accepted",
      date: getDateAfterDays(1),
      start_time: "10",
      end_time: "11",
      attendent: 2,
      activity_description: "Test booking with wrong staff",
      participant_ids: [],
      created_at: admin.firestore.FieldValue.serverTimestamp()
    });
    createdRequestId = requestRef.id;
    currentScenario.payload.request_id = createdRequestId;
    console.log(`  ✓ Created request: ${requestRef.id} with staff_id: ${otherStaffUid}`);

  } else if (currentScenario.preProcess === "future-request-not-yet") {
    console.log("Pre-processing: creating future request (not yet in window)...");

    // 日期在未来，start_time 也在未来，肯定不在窗口内
    const requestRef = db.collection("request").doc("test-future-" + Date.now());
    await requestRef.set({
      member_id: aliceUid,
      facility_id: "facility-001",
      staff_id: kimUid,
      status: "accepted",
      date: getDateAfterDays(7), // 7 天后
      start_time: "09",
      end_time: "10",
      attendent: 2,
      activity_description: "Test future booking",
      participant_ids: [],
      created_at: admin.firestore.FieldValue.serverTimestamp()
    });
    createdRequestId = requestRef.id;
    currentScenario.payload.request_id = createdRequestId;
    console.log(`  ✓ Created request: ${requestRef.id}, date: ${getDateAfterDays(7)}`);

  } else if (currentScenario.preProcess === "past-request-expired") {
    console.log("Pre-processing: creating past request (window expired)...");

    // 日期在昨天，窗口已过
    const requestRef = db.collection("request").doc("test-past-" + Date.now());
    await requestRef.set({
      member_id: aliceUid,
      facility_id: "facility-001",
      staff_id: kimUid,
      status: "accepted",
      date: getDateAfterDays(-1), // 昨天
      start_time: "09",
      end_time: "10",
      attendent: 2,
      activity_description: "Test past booking",
      participant_ids: [],
      created_at: admin.firestore.FieldValue.serverTimestamp()
    });
    createdRequestId = requestRef.id;
    currentScenario.payload.request_id = createdRequestId;
    console.log(`  ✓ Created request: ${requestRef.id}, date: ${getDateAfterDays(-1)}`);

  } else if (currentScenario.preProcess === "in-progress-request") {
    console.log("Pre-processing: creating in_progress request...");

    const requestRef = db.collection("request").doc("test-inprogress-" + Date.now());
    await requestRef.set({
      member_id: aliceUid,
      facility_id: "facility-001",
      staff_id: kimUid,
      status: "in_progress",
      date: getDateAfterDays(1),
      start_time: "10",
      end_time: "11",
      attendent: 2,
      activity_description: "Test in-progress booking",
      participant_ids: [],
      created_at: admin.firestore.FieldValue.serverTimestamp()
    });
    createdRequestId = requestRef.id;
    currentScenario.payload.request_id = createdRequestId;
    console.log(`  ✓ Created request: ${requestRef.id}, status: in_progress`);
  }

  // 如果需要跳过执行
  if (shouldSkipExecution) {
    // 跳过后续登录和函数执行，直接返回（让 finally 执行 cleanup）
    return;
  }

  // ============ 3. 登录（根据需要） ============
  if (currentScenario.loginAs === "member") {
    console.log("Logging in as member (alice@test.com)...");
    await signInWithEmailAndPassword(auth, "alice@test.com", "123456");
    console.log("  ✓ Logged in as alice@test.com");
  } else if (currentScenario.loginAs === "inactive-staff") {
    console.log("Logging in as inactive staff (inactive@test.com)...");
    await signInWithEmailAndPassword(auth, "inactive@test.com", "123456");
    console.log("  ✓ Logged in as inactive@test.com");
  } else if (!currentScenario.skipLogin) {
    console.log("Logging in as staff (kim@test.com)...");
    await signInWithEmailAndPassword(auth, "kim@test.com", "123456");
    console.log("  ✓ Logged in as kim@test.com");
  }

  // ============ 4. 执行函数 ============
  console.log("");
  console.log("Executing checkInBooking...");

  const checkInFn = httpsCallable(functions, "checkInBooking");
  let result = null;
  let error = null;

  try {
    result = await checkInFn(currentScenario.payload);
    console.log("  ✓ Function executed successfully");
  } catch (err) {
    error = err;
    console.log(`  ✗ Function threw error: ${err.code}`);
  }

  // ============ 5. 验证结果 ============
  console.log("");
  console.log("Verifying result...");

  // 成功场景
  if (currentScenario.expectedSuccess) {
    if (error) {
      throw new Error(`Expected success but got error: ${error.code}: ${error.message}`);
    }

    if (!result?.data?.success) {
      throw new Error(`Expected success: true but got: ${JSON.stringify(result?.data)}`);
    }
    console.log("  ✓ Got success: true");

    // 验证数据库变化
    if (currentScenario.verifyDatabase && createdRequestId) {
      const requestDoc = await db.collection("request").doc(createdRequestId).get();
      const requestData = requestDoc.data();

      if (requestData.status !== currentScenario.checkRequestStatus) {
        throw new Error(`Request status not updated correctly! Expected: ${currentScenario.checkRequestStatus}, Got: ${requestData.status}`);
      }
      console.log(`  ✓ Request status updated to: ${requestData.status}`);

      if (!requestData.updated_at) {
        throw new Error("Request updated_at not set!");
      }
      console.log("  ✓ Request updated_at is set");

      // 验证 notification 创建
      const notifSnap = await db.collection("notification")
        .where("reference_id", "==", createdRequestId)
        .get();

      if (notifSnap.empty) {
        throw new Error("Notification not created!");
      }
      console.log(`  ✓ Notification created: ${notifSnap.size}`);
    }
  }

  // 失败场景
  if (currentScenario.expectedErrorCode) {
    if (!error) {
      throw new Error(`Expected error but got success: ${JSON.stringify(result?.data)}`);
    }

    const expectedCode = currentScenario.expectedErrorCode;
    const errorCode = normalizeErrorCode(error.code);

    if (errorCode !== expectedCode) {
      throw new Error(`Unexpected error code! Expected: ${expectedCode}, Got: ${errorCode}, Message: ${error.message}`);
    }

    // 验证数据库未被错误修改
    if (createdRequestId && currentScenario.expectedUnchangedStatus) {
      const requestDoc = await db.collection("request").doc(createdRequestId).get();
      const requestData = requestDoc.data();

      if (requestData && requestData.status !== currentScenario.expectedUnchangedStatus) {
        throw new Error(`Request status was incorrectly modified! Expected unchanged: ${currentScenario.expectedUnchangedStatus}, Got: ${requestData.status}`);
      }
      console.log(`  ✓ Request status unchanged: ${requestData?.status}`);

      // 验证没有创建 notification
      const notifSnap = await db.collection("notification")
        .where("reference_id", "==", createdRequestId)
        .get();

      if (!notifSnap.empty) {
        throw new Error("Notification was incorrectly created!");
      }
      console.log("  ✓ No notification created (as expected)");
    }
  }

  // 标记测试通过
  testPassed = true;
  } catch (error) {
    testPassed = false;
    failureReason = error.message;
    // 不在这里打印，让 finally 处理
  } finally {
    // ============ Cleanup（统一执行） ============
    console.log("");
    console.log("Cleaning up...");

    try {
      if (createdRequestId) {
        await db.collection("request").doc(createdRequestId).delete();
        console.log(`  ✓ Deleted request: ${createdRequestId}`);

        // 删除测试产生的 notification
        const notifSnap = await db.collection("notification")
          .where("reference_id", "==", createdRequestId)
          .get();

        for (const doc of notifSnap.docs) {
          await doc.ref.delete();
        }
        console.log(`  ✓ Deleted ${notifSnap.size} notifications`);
      }
    } catch (cleanupError) {
      console.error("  ✗ Cleanup error:", cleanupError.message);
    }
  }

  // ============ 输出结果 ============
  console.log("");
  console.log("=".repeat(60));
  // 检查是否是 skipped 场景
  if (failureReason && failureReason.startsWith("skipped:")) {
    console.log(`TEST SKIPPED: ${scenario}`);
    console.log(`Reason: ${failureReason}`);
    console.log("=".repeat(60));
    process.exit(0);
  } else if (testPassed) {
    if (currentScenario.expectedErrorCode) {
      console.log(`TEST PASSED: ${scenario} (got expected error: ${currentScenario.expectedErrorCode})`);
    } else {
      console.log(`TEST PASSED: ${scenario}`);
    }
    console.log("=".repeat(60));
    process.exit(0);
  } else {
    console.log(`TEST FAILED: ${scenario}`);
    console.log(`Reason: ${failureReason}`);
    console.log("=".repeat(60));
    process.exit(1);
  }
}

// 运行
main().catch((error) => {
  // 如果错误没被 try-catch 捕获，输出它
  console.error("Unhandled error:", error.message);
  process.exit(1);
});