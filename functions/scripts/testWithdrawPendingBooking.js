/**
 * Local Test Script for withdrawPendingBooking
 *
 * 此脚本用于本地 Emulator 测试，验证 withdrawPendingBooking 函数逻辑。
 *
 * 使用方法:
 * 1. 启动 emulators: firebase emulators:start --only auth,firestore,functions
 * 2. 在另一个终端运行 seed: node functions/scripts/seedLocalEmulator.js
 * 3. 运行测试: node functions/scripts/testWithdrawPendingBooking.js --scenario=xxx
 *
 * 关键设计:
 * - 动态获取 Alice 的真实 Auth UID
 * - 动态创建 member、facility、request、time_slot
 * - 支持多种 scenario 测试
 * - success 场景创建至少 2 个 time_slot 绑定同一 request
 */

// ============ 安全检查 ============

if (!process.env.FIRESTORE_EMULATOR_HOST) {
  console.error("ERROR: FIRESTORE_EMULATOR_HOST not set.");
  process.exit(1);
}

// ============ 引入 ============

const { initializeApp } = require("firebase/app");
const { getAuth, connectAuthEmulator, signInWithEmailAndPassword, signOut, createUserWithEmailAndPassword } = require("firebase/auth");
const { getFunctions, connectFunctionsEmulator, httpsCallable } = require("firebase/functions");

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

let aliceUid = null;
let bobUid = null;
let createdSlotIds = [];  // 保存 success 场景创建的 slot ID

// ============ 工具函数 ============

function getFutureDate(daysFromNow) {
  const d = new Date();
  d.setDate(d.getDate() + daysFromNow);
  return d.toISOString().split("T")[0];
}

function getHourFromNow(hoursFromNow) {
  const d = new Date();
  d.setHours(d.getHours() + hoursFromNow);
  return String(d.getHours()).padStart(2, "0");
}

function normalizeErrorCode(code) {
  if (code && code.startsWith("functions/")) {
    return code.replace("functions/", "");
  }
  return code;
}

// ============ Scenario 配置 ============

const scenarios = {
  "success": {
    payload: { request_id: null },
    preProcess: "create-pending-booking",
    expectedSuccess: true,
    expectedErrorCode: null,
    verifyDatabase: true,
    checkRequestStatus: "cancelled",
    checkSlotStatus: "open",
    checkCancelTimesIncrement: false,
    checkSlotsCount: "multiple"  // 至少 2 个 slot
  },
  "already-cancelled": {
    payload: { request_id: null },
    preProcess: "create-cancelled-booking",
    expectedSuccess: null,
    expectedErrorCode: "failed-precondition",
    verifyDatabase: false
  },
  "accepted-booking": {
    payload: { request_id: null },
    preProcess: "create-accepted-booking",
    expectedSuccess: null,
    expectedErrorCode: "failed-precondition",
    verifyDatabase: false
  },
  "request-not-found": {
    payload: { request_id: "non-existent-request-id" },
    preProcess: null,
    expectedSuccess: null,
    expectedErrorCode: "not-found",
    verifyDatabase: false
  },
  "not-owner": {
    payload: { request_id: null },
    preProcess: "create-other-owner-booking",
    expectedSuccess: null,
    expectedErrorCode: "permission-denied",
    verifyDatabase: false
  },
  "slot-not-found": {
    payload: { request_id: null },
    preProcess: "create-pending-booking-no-slot",
    expectedSuccess: null,
    expectedErrorCode: "failed-precondition",
    verifyDatabase: false
  },
  "inactive-member": {
    payload: { request_id: null },
    preProcess: "create-pending-booking-inactive",
    expectedSuccess: null,
    expectedErrorCode: "failed-precondition",
    verifyDatabase: false,
    memberStatus: "suspended"
  },
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
  }
};

// ============ 主函数 ============

async function main() {
  console.log("");
  console.log("=".repeat(60));
  console.log("withdrawPendingBooking Test Script");
  console.log("=".repeat(60));
  console.log(`Scenario: ${scenario}`);
  console.log("");

  const currentScenario = scenarios[scenario];
  if (!currentScenario) {
    console.error(`ERROR: Unknown scenario: ${scenario}`);
    console.error("Available scenarios:", Object.keys(scenarios).join(", "));
    process.exit(1);
  }

  // ============ 0. 初始化用户 ============
  console.log("Initializing users...");

  let aliceUser = null;
  try {
    aliceUser = await signInWithEmailAndPassword(auth, "alice@test.com", "123456");
    aliceUid = aliceUser.user.uid;
    console.log(`  ✓ Logged in as alice@test.com, UID: ${aliceUid}`);
  } catch (error) {
    if (error.code === "auth/user-not-found") {
      aliceUser = await createUserWithEmailAndPassword(auth, "alice@test.com", "123456");
      aliceUid = aliceUser.user.uid;
      console.log(`  ✓ Created alice@test.com, UID: ${aliceUid}`);
    } else {
      console.error("ERROR: Login failed:", error.message);
      process.exit(1);
    }
  }

  // 确保 alice 存在于 member 集合，status = active
  const memberRef = db.collection("member").doc(aliceUid);
  const memberDoc = await memberRef.get();
  if (!memberDoc.exists) {
    await memberRef.set({
      name: "Alice",
      email: "alice@test.com",
      status: "active",
      cancel_times: 0,
      created_at: admin.firestore.FieldValue.serverTimestamp()
    });
  } else {
    const existingData = memberDoc.data();
    // 如果测试 inactive-member，保持 suspended；否则设为 active
    if (currentScenario.memberStatus !== "suspended") {
      await memberRef.update({ status: "active", cancel_times: 0 });
    }
  }
  console.log(`  ✓ member/${aliceUid} exists`);

  // 尝试 Bob 用户登录
  let bobUser = null;
  try {
    bobUser = await signInWithEmailAndPassword(auth, "bob@test.com", "123456");
    bobUid = bobUser.user.uid;
  } catch (error) {
    if (error.code === "auth/user-not-found") {
      bobUser = await createUserWithEmailAndPassword(auth, "bob@test.com", "123456");
      bobUid = bobUser.user.uid;
    }
  }
  if (bobUid) {
    const bobMemberRef = db.collection("member").doc(bobUid);
    const bobMemberDoc = await bobMemberRef.get();
    if (!bobMemberDoc.exists) {
      await bobMemberRef.set({
        name: "Bob",
        email: "bob@test.com",
        status: "active",
        cancel_times: 0,
        created_at: admin.firestore.FieldValue.serverTimestamp()
      });
    }
  }
  console.log(`  ✓ Bob UID: ${bobUid || "N/A"}`);

  // ============ 1. 验证 seed 数据 ============
  console.log("");
  console.log("Verifying seed data...");

  const facilityDoc = await db.collection("facility").doc("facility-001").get();
  if (!facilityDoc.exists) {
    console.error("ERROR: facility/facility-001 not found.");
    process.exit(1);
  }
  console.log("  ✓ facility/facility-001 exists");

  // ============ 2. 执行 preProcess ============

  if (currentScenario.preProcess === "create-pending-booking") {
    console.log("Pre-processing: creating a pending booking with multiple slots...");

    const futureDate = getFutureDate(3);
    const startHour = "10";
    const endHour = "13";  // 3 小时，需要 3 个 slot

    // 创建 pending request
    const requestRef = db.collection("request").doc("test-withdraw-pending-" + Date.now());
    await requestRef.set({
      member_id: aliceUid,
      facility_id: "facility-001",
      staff_id: "staff-001",
      status: "pending",
      date: futureDate,
      start_time: startHour,
      end_time: endHour,
      participant_ids: ["friend-001", "friend-002"],
      completed_at: "",
      created_at: admin.firestore.FieldValue.serverTimestamp()
    });
    currentScenario.payload.request_id = requestRef.id;
    console.log(`  ✓ Created request: ${requestRef.id}`);

    // 锁定多个 time_slot（至少 2 个）
    createdSlotIds = [];  // 重置
    for (let hour = parseInt(startHour); hour < parseInt(endHour); hour++) {
      const hourStr = String(hour).padStart(2, "0");
      const slotId = `facility-001-${futureDate}-${hourStr}`;
      const slotRef = db.collection("time_slot").doc(slotId);
      await slotRef.set({
        facility_id: "facility-001",
        date: futureDate,
        start_time: hour,
        end_time: hour + 1,
        status: "locked",
        request_id: requestRef.id,
        created_at: admin.firestore.FieldValue.serverTimestamp()
      });
      createdSlotIds.push(slotId);  // 保存 slot ID
      console.log(`  ✓ Locked time_slot: ${slotId}`);
    }

  } else if (currentScenario.preProcess === "create-cancelled-booking") {
    console.log("Pre-processing: creating an already cancelled booking...");

    const futureDate = getFutureDate(3);
    const startHour = "10";

    const requestRef = db.collection("request").doc("test-withdraw-cancelled-" + Date.now());
    await requestRef.set({
      member_id: aliceUid,
      facility_id: "facility-001",
      staff_id: "staff-001",
      status: "cancelled",
      date: futureDate,
      start_time: startHour,
      end_time: "11",
      participant_ids: [],
      completed_at: admin.firestore.FieldValue.serverTimestamp(),
      created_at: admin.firestore.FieldValue.serverTimestamp()
    });
    currentScenario.payload.request_id = requestRef.id;
    console.log(`  ✓ Created request: ${requestRef.id}`);

  } else if (currentScenario.preProcess === "create-accepted-booking") {
    console.log("Pre-processing: creating an accepted booking...");

    const futureDate = getFutureDate(3);
    const startHour = "10";

    const requestRef = db.collection("request").doc("test-withdraw-accepted-" + Date.now());
    await requestRef.set({
      member_id: aliceUid,
      facility_id: "facility-001",
      staff_id: "staff-001",
      status: "accepted",
      date: futureDate,
      start_time: startHour,
      end_time: "11",
      participant_ids: [],
      completed_at: admin.firestore.FieldValue.serverTimestamp(),
      created_at: admin.firestore.FieldValue.serverTimestamp()
    });
    currentScenario.payload.request_id = requestRef.id;
    console.log(`  ✓ Created request: ${requestRef.id}`);

    // 锁定 time_slot
    const slotRef = db.collection("time_slot").doc(`facility-001-${futureDate}-${startHour}-accepted`);
    await slotRef.set({
      facility_id: "facility-001",
      date: futureDate,
      start_time: parseInt(startHour),
      end_time: parseInt(startHour) + 1,
      status: "locked",
      request_id: requestRef.id,
      created_at: admin.firestore.FieldValue.serverTimestamp()
    });
    console.log(`  ✓ Locked time_slot: ${slotRef.id}`);

  } else if (currentScenario.preProcess === "create-other-owner-booking") {
    console.log("Pre-processing: creating a pending booking owned by Bob...");

    const futureDate = getFutureDate(3);
    const startHour = "10";

    const requestRef = db.collection("request").doc("test-withdraw-other-" + Date.now());
    await requestRef.set({
      member_id: bobUid,  // Bob's request
      facility_id: "facility-001",
      staff_id: "staff-001",
      status: "pending",
      date: futureDate,
      start_time: startHour,
      end_time: "11",
      participant_ids: [],
      completed_at: "",
      created_at: admin.firestore.FieldValue.serverTimestamp()
    });
    currentScenario.payload.request_id = requestRef.id;
    console.log(`  ✓ Created request owned by Bob: ${requestRef.id}`);

    // 锁定 time_slot
    const slotRef = db.collection("time_slot").doc(`facility-001-${futureDate}-${startHour}-other`);
    await slotRef.set({
      facility_id: "facility-001",
      date: futureDate,
      start_time: parseInt(startHour),
      end_time: parseInt(startHour) + 1,
      status: "locked",
      request_id: requestRef.id,
      created_at: admin.firestore.FieldValue.serverTimestamp()
    });
    console.log(`  ✓ Locked time_slot for Bob's booking`);

  } else if (currentScenario.preProcess === "create-pending-booking-no-slot") {
    console.log("Pre-processing: creating a pending booking without locked time_slot...");

    const futureDate = getFutureDate(3);
    const startHour = "10";

    const requestRef = db.collection("request").doc("test-withdraw-no-slot-" + Date.now());
    await requestRef.set({
      member_id: aliceUid,
      facility_id: "facility-001",
      staff_id: "staff-001",
      status: "pending",
      date: futureDate,
      start_time: startHour,
      end_time: "11",
      participant_ids: [],
      completed_at: "",
      created_at: admin.firestore.FieldValue.serverTimestamp()
    });
    currentScenario.payload.request_id = requestRef.id;
    console.log(`  ✓ Created request without time_slot: ${requestRef.id}`);
    // 注意：此场景不创建 time_slot

  } else if (currentScenario.preProcess === "create-pending-booking-inactive") {
    console.log("Pre-processing: creating a pending booking with suspended member...");

    const futureDate = getFutureDate(3);
    const startHour = "10";

    // 设置 member 为 suspended
    await memberRef.set({
      name: "Alice",
      email: "alice@test.com",
      status: "suspended",
      cancel_times: 0,
      created_at: admin.firestore.FieldValue.serverTimestamp()
    });
    console.log(`  ✓ Set member status to suspended`);

    const requestRef = db.collection("request").doc("test-withdraw-inactive-" + Date.now());
    await requestRef.set({
      member_id: aliceUid,
      facility_id: "facility-001",
      staff_id: "staff-001",
      status: "pending",
      date: futureDate,
      start_time: startHour,
      end_time: "11",
      participant_ids: [],
      completed_at: "",
      created_at: admin.firestore.FieldValue.serverTimestamp()
    });
    currentScenario.payload.request_id = requestRef.id;
    console.log(`  ✓ Created request: ${requestRef.id}`);

    // 锁定 time_slot
    const slotRef = db.collection("time_slot").doc(`facility-001-${futureDate}-${startHour}-inactive`);
    await slotRef.set({
      facility_id: "facility-001",
      date: futureDate,
      start_time: parseInt(startHour),
      end_time: parseInt(startHour) + 1,
      status: "locked",
      request_id: requestRef.id,
      created_at: admin.firestore.FieldValue.serverTimestamp()
    });
    console.log(`  ✓ Locked time_slot: ${slotRef.id}`);
  }

  // ============ 3. 登录用户 ============

  if (!currentScenario.skipLogin) {
    const loginEmail = currentScenario.loginAs === "bob" ? "bob@test.com" : "alice@test.com";
    const loginPassword = "123456";

    console.log(`Logging in as ${loginEmail}...`);

    try {
      const userCredential = await signInWithEmailAndPassword(auth, loginEmail, loginPassword);
      console.log(`  ✓ Logged in as: ${userCredential.user.email}`);
      console.log(`  ✓ UID: ${userCredential.user.uid}`);
    } catch (error) {
      console.error("ERROR: Login failed:", error.message);
      process.exit(1);
    }
  } else if (scenario === "unauthenticated") {
    // unauthenticated 场景：初始化后需要 signOut
    console.log("Signing out for unauthenticated scenario...");
    await signOut(auth);
    const currentUser = auth.currentUser;
    console.log(`  ✓ Signed out, currentUser: ${currentUser ? currentUser.email : null}`);
  }

  // ============ 4. 调用 withdrawPendingBooking ============

  console.log("");
  console.log("Building payload...");

  const payload = { ...currentScenario.payload };
  console.log(`Payload (${scenario}):`, JSON.stringify(payload, null, 2));
  console.log("");

  console.log("Calling withdrawPendingBooking...");

  const withdrawPendingBookingFn = httpsCallable(functions, "withdrawPendingBooking");

  try {
    const result = await withdrawPendingBookingFn(payload);

    // ============ 5. 验证成功结果 ============

    if (currentScenario.expectedSuccess === true) {
      console.log("");
      console.log("=".repeat(60));
      console.log("Function Result:");
      console.log("=".repeat(60));
      console.log(JSON.stringify(result.data, null, 2));

      if (currentScenario.verifyDatabase) {
        console.log("");
        console.log("Verifying results with Admin SDK...");

        // 检查 request 状态
        const requestDoc = await db.collection("request").doc(payload.request_id).get();
        if (!requestDoc.exists) {
          console.error("ERROR: Request not found!");
          process.exit(1);
        }

        const requestData = requestDoc.data();
        const actualStatus = requestData.status;
        const expectedStatus = currentScenario.checkRequestStatus;

        if (actualStatus !== expectedStatus) {
          console.error(`ERROR: Request status is "${actualStatus}", expected "${expectedStatus}"`);
          process.exit(1);
        }
        console.log(`  ✓ Request status: ${actualStatus}`);

        // 检查 completed_at（应该是 Firestore Timestamp，不是空字符串）
        if (requestData.completed_at) {
          const completedAt = requestData.completed_at?.toDate
            ? requestData.completed_at.toDate().toISOString()
            : requestData.completed_at;
          console.log(`  ✓ Request completed_at: ${completedAt}`);
          if (completedAt === "") {
            console.error("ERROR: completed_at should not be empty string");
            process.exit(1);
          }
        } else {
          console.error("ERROR: completed_at is null/undefined");
          process.exit(1);
        }

        // 检查 request.updated_at
        if (requestData.updated_at) {
          const updatedAt = requestData.updated_at?.toDate
            ? requestData.updated_at.toDate().toISOString()
            : requestData.updated_at;
          console.log(`  ✓ Request updated_at: ${updatedAt}`);
        }

        // 检查 time_slot 状态（通过保存的 slot ID 列表逐个验证）
        // 注意：不能用 where("request_id", "==", requestId) 查询，因为成功后 request_id 已清空
        if (currentScenario.checkSlotsCount === "multiple" && createdSlotIds.length < 2) {
          console.error(`ERROR: Expected at least 2 time_slots, got ${createdSlotIds.length}`);
          process.exit(1);
        }

        for (const slotId of createdSlotIds) {
          const slotDoc = await db.collection("time_slot").doc(slotId).get();
          if (!slotDoc.exists) {
            console.error(`ERROR: time_slot ${slotId} not found!`);
            process.exit(1);
          }

          const slotData = slotDoc.data();
          if (slotData.status !== currentScenario.checkSlotStatus) {
            console.error(`ERROR: time_slot ${slotId} status is "${slotData.status}", expected "${currentScenario.checkSlotStatus}"`);
            process.exit(1);
          }
          if (slotData.request_id !== "") {
            console.error(`ERROR: time_slot ${slotId} request_id is "${slotData.request_id}", expected ""`);
            process.exit(1);
          }
          if (!slotData.updated_at) {
            console.error(`ERROR: time_slot ${slotId} updated_at is missing`);
            process.exit(1);
          }
          console.log(`  ✓ time_slot ${slotId} released: status="${slotData.status}", request_id="${slotData.request_id}"`);
        }

        // 检查 member.cancel_times（withdraw 不增加此字段）
        const memberData = (await memberRef.get()).data();
        const cancelTimes = memberData.cancel_times || 0;
        console.log(`  ✓ member.cancel_times: ${cancelTimes} (should not change)`);
        if (currentScenario.checkCancelTimesIncrement && cancelTimes > 0) {
          console.error("ERROR: cancel_times should not be incremented for withdraw");
          process.exit(1);
        }

        // 检查 notification
        const notifDocs = await db.collection("notification")
          .where("reference_id", "==", payload.request_id)
          .get();

        if (!notifDocs.empty) {
          console.log(`  ✓ ${notifDocs.size} notification(s) created`);

          // 验证通知不包括发起人本人
          for (const notifDoc of notifDocs.docs) {
            const notifData = notifDoc.data();
            if (notifData.member_id === aliceUid) {
              console.error(`ERROR: Notification should not be sent to the withdrawer (${aliceUid})`);
              process.exit(1);
            }
          }
          console.log("  ✓ Notifications do not include the withdrawer");

          // 验证通知包括 staff 和 participants
          const recipientIds = notifDocs.docs.map(d => d.data().member_id);
          if (!recipientIds.includes("staff-001")) {
            console.error("ERROR: Notification should include staff_id");
            process.exit(1);
          }
          console.log("  ✓ Notifications include staff_id");
        }
      }

      console.log("");
      console.log("=".repeat(60));
      console.log(`TEST PASSED: ${scenario}`);
      console.log("=".repeat(60));
      process.exit(0);
    }

  } catch (error) {
    // ============ 6. 验证失败结果 ============

    if (currentScenario.expectedErrorCode) {
      const errorCode = normalizeErrorCode(error.code);
      const expectedCode = currentScenario.expectedErrorCode;

      if (errorCode === expectedCode) {
        console.log("");
        console.log("Function Error:");
        console.log(`  Code: ${errorCode}`);
        console.log(`  Message: ${error.message}`);

        console.log("");
        console.log("=".repeat(60));
        console.log(`TEST PASSED: ${scenario} (got expected error: ${expectedCode})`);
        console.log("=".repeat(60));
        process.exit(0);
      } else {
        console.error("");
        console.error("ERROR: Unexpected error code!");
        console.error(`  Expected: ${expectedCode}`);
        console.error(`  Got: ${errorCode}`);
        console.error(`  Message: ${error.message}`);
        process.exit(1);
      }
    }

    console.error("");
    console.error("ERROR: Unexpected error!");
    console.error(`  Code: ${error.code}`);
    console.error(`  Message: ${error.message}`);
    process.exit(1);
  }
}

// 运行
main().catch((error) => {
  console.error("Test script failed:", error);
  process.exit(1);
});