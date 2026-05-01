/**
 * Local Test Script for cancelConfirmedBooking
 *
 * 此脚本用于本地 Emulator 测试，验证 cancelConfirmedBooking 函数逻辑。
 *
 * 使用方法:
 * 1. 启动 emulators: firebase emulators:start --only auth,firestore,functions
 * 2. 在另一个终端运行 seed: node functions/scripts/seedLocalEmulator.js
 * 3. 运行测试: node functions/scripts/testCancelConfirmedBooking.js --scenario=xxx
 *
 * 关键设计:
 * - 动态获取 Alice 的真实 Auth UID
 * - 动态创建 member、facility、request、time_slot
 * - 支持多种 scenario 测试
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

// ============ 工具函数 ============

function getFutureDate(hoursFromNow) {
  const d = new Date();
  d.setHours(d.getHours() + hoursFromNow);
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
    preProcess: "create-future-booking",
    expectedSuccess: true,
    expectedErrorCode: null,
    verifyDatabase: true,
    checkRequestStatus: "cancelled",
    checkSlotStatus: "open",
    checkCancelTimesIncrement: true
  },
  "deadline-exceeded": {
    payload: { request_id: null },
    preProcess: "create-soon-booking",
    expectedSuccess: null,
    expectedErrorCode: "deadline-exceeded",
    verifyDatabase: false
  },
  "already-cancelled": {
    payload: { request_id: null },
    preProcess: "create-cancelled-booking",
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
    verifyDatabase: false,
    loginAs: "bob"
  },
  "slot-not-found": {
    payload: { request_id: null },
    preProcess: "create-booking-no-slot",
    expectedSuccess: null,
    expectedErrorCode: "failed-precondition",
    verifyDatabase: false
  },
  "inactive-member": {
    payload: { request_id: null },
    preProcess: "create-future-booking-inactive",
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
  console.log("cancelConfirmedBooking Test Script");
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

  // 确保 alice 存在于 member 集合
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
    if (existingData.status !== "active" && currentScenario.preProcess?.includes("inactive")) {
      // keep as suspended for inactive-member test
    } else if (existingData.status !== "active") {
      await memberRef.update({ status: "active", cancel_times: 0 });
    }
  }
  console.log(`  ✓ member/${aliceUid} exists`);

  // 尝试 Bob 用户登录
  let bobUid = null;
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

  if (currentScenario.preProcess === "create-future-booking") {
    console.log("Pre-processing: creating a future accepted booking...");

    const futureDate = getFutureDate(24);
    const startHour = getHourFromNow(24);
    const endHour = String(parseInt(startHour) + 1).padStart(2, "0");

    const requestRef = db.collection("request").doc("test-cancel-future-" + Date.now());
    await requestRef.set({
      member_id: aliceUid,
      facility_id: "facility-001",
      staff_id: "staff-001",
      status: "accepted",
      date: futureDate,
      start_time: startHour,
      end_time: endHour,
      participant_ids: [],
      created_at: admin.firestore.FieldValue.serverTimestamp()
    });
    currentScenario.payload.request_id = requestRef.id;
    console.log(`  ✓ Created request: ${requestRef.id}`);

    // 锁定 time_slot
    const slotRef = db.collection("time_slot").doc(`facility-001-${futureDate}-${startHour}`);
    await slotRef.set({
      facility_id: "facility-001",
      date: futureDate,
      start_time: parseInt(startHour),
      end_time: parseInt(endHour),
      status: "locked",
      request_id: requestRef.id,
      created_at: admin.firestore.FieldValue.serverTimestamp()
    });
    console.log(`  ✓ Locked time_slot: ${slotRef.id}`);

  } else if (currentScenario.preProcess === "create-soon-booking") {
    console.log("Pre-processing: creating a soon-to-start booking...");

    const todayDate = getFutureDate(0);
    const currentHour = String(new Date().getHours()).padStart(2, "0");
    const nextHour = String(parseInt(currentHour) + 1).padStart(2, "0");

    const requestRef = db.collection("request").doc("test-cancel-soon-" + Date.now());
    await requestRef.set({
      member_id: aliceUid,
      facility_id: "facility-001",
      staff_id: "staff-001",
      status: "accepted",
      date: todayDate,
      start_time: nextHour,
      end_time: String(parseInt(nextHour) + 1).padStart(2, "0"),
      participant_ids: [],
      created_at: admin.firestore.FieldValue.serverTimestamp()
    });
    currentScenario.payload.request_id = requestRef.id;
    console.log(`  ✓ Created request: ${requestRef.id}`);

    // 锁定 time_slot
    const slotRef = db.collection("time_slot").doc(`facility-001-${todayDate}-${nextHour}`);
    await slotRef.set({
      facility_id: "facility-001",
      date: todayDate,
      start_time: parseInt(nextHour),
      end_time: parseInt(nextHour) + 1,
      status: "locked",
      request_id: requestRef.id,
      created_at: admin.firestore.FieldValue.serverTimestamp()
    });
    console.log(`  ✓ Locked time_slot: ${slotRef.id}`);

  } else if (currentScenario.preProcess === "create-cancelled-booking") {
    console.log("Pre-processing: creating an already cancelled booking...");

    const futureDate = getFutureDate(24);
    const startHour = getHourFromNow(24);

    const requestRef = db.collection("request").doc("test-cancel-cancelled-" + Date.now());
    await requestRef.set({
      member_id: aliceUid,
      facility_id: "facility-001",
      staff_id: "staff-001",
      status: "cancelled",
      date: futureDate,
      start_time: startHour,
      end_time: String(parseInt(startHour) + 1).padStart(2, "0"),
      participant_ids: [],
      completed_at: new Date().toISOString(),
      created_at: admin.firestore.FieldValue.serverTimestamp()
    });
    currentScenario.payload.request_id = requestRef.id;
    console.log(`  ✓ Created request: ${requestRef.id}`);

  } else if (currentScenario.preProcess === "create-other-owner-booking") {
    console.log("Pre-processing: creating a booking owned by Bob...");

    const futureDate = getFutureDate(24);
    const startHour = getHourFromNow(24);

    const requestRef = db.collection("request").doc("test-cancel-other-" + Date.now());
    await requestRef.set({
      member_id: bobUid,
      facility_id: "facility-001",
      staff_id: "staff-001",
      status: "accepted",
      date: futureDate,
      start_time: startHour,
      end_time: String(parseInt(startHour) + 1).padStart(2, "0"),
      participant_ids: [],
      created_at: admin.firestore.FieldValue.serverTimestamp()
    });
    currentScenario.payload.request_id = requestRef.id;
    console.log(`  ✓ Created request owned by Bob: ${requestRef.id}`);

    // 锁定 time_slot
    const slotRef = db.collection("time_slot").doc(`facility-001-${futureDate}-${startHour}-bob`);
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

  } else if (currentScenario.preProcess === "create-booking-no-slot") {
    console.log("Pre-processing: creating a booking without locked time_slot...");

    const futureDate = getFutureDate(24);
    const startHour = getHourFromNow(24);

    const requestRef = db.collection("request").doc("test-cancel-no-slot-" + Date.now());
    await requestRef.set({
      member_id: aliceUid,
      facility_id: "facility-001",
      staff_id: "staff-001",
      status: "accepted",
      date: futureDate,
      start_time: startHour,
      end_time: String(parseInt(startHour) + 1).padStart(2, "0"),
      participant_ids: [],
      created_at: admin.firestore.FieldValue.serverTimestamp()
    });
    currentScenario.payload.request_id = requestRef.id;
    console.log(`  ✓ Created request without time_slot: ${requestRef.id}`);

  } else if (currentScenario.preProcess === "create-future-booking-inactive") {
    console.log("Pre-processing: creating a booking with suspended member...");

    const futureDate = getFutureDate(24);
    const startHour = getHourFromNow(24);

    // 设置 member 为 suspended
    await memberRef.set({
      name: "Alice",
      email: "alice@test.com",
      status: "suspended",
      cancel_times: 0,
      created_at: admin.firestore.FieldValue.serverTimestamp()
    });
    console.log(`  ✓ Set member status to suspended`);

    const requestRef = db.collection("request").doc("test-cancel-inactive-" + Date.now());
    await requestRef.set({
      member_id: aliceUid,
      facility_id: "facility-001",
      staff_id: "staff-001",
      status: "accepted",
      date: futureDate,
      start_time: startHour,
      end_time: String(parseInt(startHour) + 1).padStart(2, "0"),
      participant_ids: [],
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
  }

  // ============ 4. 调用 cancelConfirmedBooking ============

  console.log("");
  console.log("Building payload...");

  const payload = { ...currentScenario.payload };
  console.log(`Payload (${scenario}):`, JSON.stringify(payload, null, 2));
  console.log("");

  console.log("Calling cancelConfirmedBooking...");

  const cancelConfirmedBookingFn = httpsCallable(functions, "cancelConfirmedBooking");

  try {
    const result = await cancelConfirmedBookingFn(payload);

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

        // 检查 completed_at
        if (requestData.completed_at) {
          // 兼容 Firestore Timestamp 和 ISO string
          const completedAt = requestData.completed_at?.toDate
            ? requestData.completed_at.toDate().toISOString()
            : requestData.completed_at;
          console.log(`  ✓ Request completed_at: ${completedAt}`);
        }

        // 检查 slot 状态
        const slotDocs = await db.collection("time_slot")
          .where("request_id", "==", payload.request_id)
          .get();

        if (!slotDocs.empty) {
          for (const slotDoc of slotDocs.docs) {
            const slotData = slotDoc.data();
            if (slotData.status !== currentScenario.checkSlotStatus) {
              console.error(`ERROR: time_slot status is "${slotData.status}", expected "${currentScenario.checkSlotStatus}"`);
              process.exit(1);
            }
            console.log(`  ✓ time_slot ${slotDoc.id} status: ${slotData.status}`);
          }
        }

        // 检查 member.cancel_times
        if (currentScenario.checkCancelTimesIncrement) {
          const memberData = (await memberRef.get()).data();
          const cancelTimes = memberData.cancel_times || 0;
          console.log(`  ✓ member.cancel_times: ${cancelTimes}`);
          if (cancelTimes < 1) {
            console.error("ERROR: cancel_times should be incremented");
            process.exit(1);
          }
        }

        // 检查 notification
        const notifDocs = await db.collection("notification")
          .where("reference_id", "==", payload.request_id)
          .get();

        if (!notifDocs.empty) {
          console.log(`  ✓ ${notifDocs.size} notification(s) created`);
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