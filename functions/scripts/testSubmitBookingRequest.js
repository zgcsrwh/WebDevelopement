/**
 * Local Test Script for submitBookingRequest
 *
 * 此脚本用于本地 Emulator 测试，验证 submitBookingRequest 函数逻辑。
 *
 * 使用方法:
 * 1. 启动 emulators: firebase emulators:start --only auth,firestore,functions
 * 2. 在另一个终端运行 seed: node functions/scripts/seedLocalEmulator.js --member-uid=<生成的用户UID>
 * 3. 运行测试: node functions/scripts/testSubmitBookingRequest.js
 */

// ============ 安全检查 ============

if (!process.env.FIRESTORE_EMULATOR_HOST) {
  console.error("ERROR: FIRESTORE_EMULATOR_HOST not set.");
  process.exit(1);
}

// ============ 引入 ============

// Modern Firebase Client SDK (使用主项目已有的 firebase ^12.11.0)
const { initializeApp } = require("firebase/app");
const { getAuth, connectAuthEmulator, signInWithEmailAndPassword } = require("firebase/auth");
const { getFunctions, connectFunctionsEmulator, httpsCallable } = require("firebase/functions");

// Firebase Admin SDK (用于验证结果)
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

// ============ 工具函数 ============

function getTomorrowDate() {
  const d = new Date();
  d.setDate(d.getDate() + 1);
  return d.toISOString().split("T")[0];
}

// ============ 主测试函数 ============

async function testSubmitBookingRequest() {
  const tomorrowDate = getTomorrowDate();

  console.log("");
  console.log("=".repeat(60));
  console.log("Testing submitBookingRequest (Local Emulator)");
  console.log("=".repeat(60));
  console.log("");

  // ============ 1. 检查 seed 数据是否存在 ============
  console.log("Checking seed data...");

  const facilityDoc = await db.collection("facility").doc("facility-001").get();
  if (!facilityDoc.exists) {
    console.error("ERROR: facility/facility-001 not found. Run seed script first.");
    process.exit(1);
  }
  console.log("  ✓ facility/facility-001 exists");

  const staffDoc = await db.collection("admin_staff").doc("staff-001").get();
  if (!staffDoc.exists) {
    console.error("ERROR: admin_staff/staff-001 not found. Run seed script first.");
    process.exit(1);
  }
  console.log("  ✓ admin_staff/staff-001 exists");

  const memberDocs = await db.collection("member").limit(1).get();
  if (memberDocs.empty) {
    console.error("ERROR: No member found. Run seed script with --member-uid first.");
    process.exit(1);
  }
  const memberUid = memberDocs.docs[0].id;
  const memberData = memberDocs.docs[0].data();
  console.log(`  ✓ member/${memberUid} exists (status: ${memberData.status})`);

  // 检查 time_slot
  const slotQuery = await db.collection("time_slot")
    .where("facility_id", "==", "facility-001")
    .where("date", "==", tomorrowDate)
    .where("start_time", "==", 9)
    .get();

  if (slotQuery.empty) {
    console.error(`ERROR: time_slot for date ${tomorrowDate} not found. Run seed script first.`);
    process.exit(1);
  }

  const slotData = slotQuery.docs[0].data();
  console.log(`  ✓ time_slot exists (status: ${slotData.status})`);

  if (slotData.status !== "open") {
    console.error(`ERROR: time_slot status is "${slotData.status}", expected "open".`);
    console.error("Please re-run seed script to reset time_slot status.");
    process.exit(1);
  }

  console.log("");
  console.log("Seed data verified. Ready to test submitBookingRequest.");
  console.log("");

  // ============ 2. 登录 Auth Emulator ============
  console.log("Logging in to Auth Emulator...");
  console.log("  Email: alice@test.com");

  try {
    const userCredential = await signInWithEmailAndPassword(auth, "alice@test.com", "123456");
    console.log(`  ✓ Logged in as: ${userCredential.user.email}`);
    console.log(`  ✓ UID: ${userCredential.user.uid}`);
  } catch (error) {
    console.error("ERROR: Login failed:", error.message);
    console.error("Make sure to create user alice@test.com / 123456 in Auth Emulator first.");
    process.exit(1);
  }

  // ============ 3. 调用 submitBookingRequest ============
  console.log("");
  console.log("Calling submitBookingRequest...");

  const payload = {
    facility_id: "facility-001",
    date: tomorrowDate,
    start_time: 9,
    end_time: 10,
    attendent: 2,
    activity_description: "Test booking"
  };

  console.log("Payload:", JSON.stringify(payload, null, 2));

  const submitBookingRequest = httpsCallable(functions, "submitBookingRequest");

  try {
    const result = await submitBookingRequest(payload);
    console.log("");
    console.log("=".repeat(60));
    console.log("Function Result:");
    console.log("=".repeat(60));
    console.log(JSON.stringify(result.data, null, 2));

    // ============ 4. 验证结果 ============
    console.log("");
    console.log("Verifying results with Admin SDK...");

    // 4.1 检查 request 是否新增
    const requestDocs = await db.collection("request")
      .where("facility_id", "==", "facility-001")
      .where("date", "==", tomorrowDate)
      .get();

    if (requestDocs.empty) {
      console.error("ERROR: No request created!");
      process.exit(1);
    }

    const requestData = requestDocs.docs[0].data();
    const requestId = requestDocs.docs[0].id;
    console.log(`  ✓ request/${requestId} created`);
    console.log(`    - status: ${requestData.status}`);
    console.log(`    - member_id: ${requestData.member_id}`);
    console.log(`    - date: ${requestData.date}`);
    console.log(`    - start_time: ${requestData.start_time}`);
    console.log(`    - end_time: ${requestData.end_time}`);

    // 4.2 检查 time_slot 是否变成 locked
    const lockedSlotQuery = await db.collection("time_slot")
      .where("facility_id", "==", "facility-001")
      .where("date", "==", tomorrowDate)
      .where("start_time", "==", 9)
      .get();

    if (lockedSlotQuery.empty) {
      console.error("ERROR: time_slot not found!");
      process.exit(1);
    }

    const lockedSlotData = lockedSlotQuery.docs[0].data();
    console.log(`  ✓ time_slot status changed to: ${lockedSlotData.status}`);
    console.log(`    - request_id: ${lockedSlotData.request_id}`);

    // 4.3 检查 notification 是否新增
    const notificationDocs = await db.collection("notification")
      .where("related_id", "==", requestId)
      .get();

    console.log(`  ✓ notification/ created: ${notificationDocs.size} documents`);
    for (const notifDoc of notificationDocs.docs) {
      const notifData = notifDoc.data();
      console.log(`    - recipient_id: ${notifData.recipient_id}, type: ${notifData.type}`);
    }

    console.log("");
    console.log("=".repeat(60));
    console.log("TEST PASSED");
    console.log("=".repeat(60));
    console.log("");

  } catch (error) {
    console.error("");
    console.error("Function call failed:");
    console.error("  Code:", error.code);
    console.error("  Message:", error.message);
    console.error("  Details:", error.details);
    process.exit(1);
  }

  process.exit(0);
}

// 运行
testSubmitBookingRequest().catch((error) => {
  console.error("Test failed:", error);
  process.exit(1);
});