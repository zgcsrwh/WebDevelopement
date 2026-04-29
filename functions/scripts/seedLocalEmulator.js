/**
 * Local Emulator Seed Data Script
 *
 * 此脚本只连接本地 Firestore Emulator，不写入云端数据库。
 */

const admin = require("firebase-admin");

// ============ 安全检查 ============

// 检查 FIRESTORE_EMULATOR_HOST
if (!process.env.FIRESTORE_EMULATOR_HOST) {
  console.error("ERROR: FIRESTORE_EMULATOR_HOST not set.");
  console.error("This script only works with local Firestore Emulator.");
  console.error("");
  console.error("Please run: firebase emulators:start --only auth,firestore");
  console.error("Then run this script in another terminal.");
  process.exit(1);
}

// 禁止检测（防止误写入云端）- 直接退出
const forbiddenEnvVars = [
  "GOOGLE_APPLICATION_CREDENTIALS",
  "FIREBASE_CONFIG"
];

for (const envVar of forbiddenEnvVars) {
  if (process.env[envVar]) {
    console.error(`ERROR: ${envVar} is set. This script should not connect to cloud.`);
    console.error("Please unset this environment variable before running.");
    process.exit(1);
  }
}

// ============ 初始化 ============

// 使用 projectId 初始化（不需要 serviceAccount）
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

function getTodayDate() {
  return new Date().toISOString().split("T")[0];
}

// ============ 主函数 ============

async function seedData() {
  const tomorrowDate = getTomorrowDate();
  const todayDate = getTodayDate();

  console.log("");
  console.log("=".repeat(60));
  console.log("Local Emulator Seed Data Script");
  console.log("=".repeat(60));
  console.log("");
  console.log(`Date: ${todayDate}`);
  console.log(`Test Date (tomorrow): ${tomorrowDate}`);
  console.log("");

  // ============ 1. 创建 admin_staff ============
  console.log("Writing admin_staff...");

  const staffRef = db.collection("admin_staff").doc("staff-001");
  await staffRef.set({
    name: "Kim Smith",
    email: "kim@test.com",
    role: "staff",
    status: "active",
    created_at: admin.firestore.FieldValue.serverTimestamp()
  });

  console.log("  ✓ admin_staff/staff-001");

  // ============ 2. 创建 facility ============
  console.log("Writing facility...");

  const facilityRef = db.collection("facility").doc("facility-001");
  await facilityRef.set({
    name: "Badminton Court A",
    sport_type: "Badminton",
    description: "Professional PVC sports flooring with 6 international standard courts.",
    usage_guidelines: "Non-marking sports shoes are mandatory.",
    capacity: 4,
    status: "normal",
    staff_id: "staff-001",
    start_time: 9,
    end_time: 22,
    location: "Center Hall, First floor"
  });

  console.log("  ✓ facility/facility-001");

  // ============ 3. 创建 time_slot（4条）===========
  console.log("Writing time_slot...");

  const timeSlotHours = [9, 10, 11, 12];
  for (const hour of timeSlotHours) {
    const slotId = `facility-001-${tomorrowDate}-${hour}`;
    const slotRef = db.collection("time_slot").doc(slotId);

    await slotRef.set({
      facility_id: "facility-001",
      date: tomorrowDate,
      start_time: hour,
      end_time: hour + 1,
      status: "open",
      request_id: "",
      created_at: admin.firestore.FieldValue.serverTimestamp()
    });

    console.log(`  ✓ time_slot/${slotId}`);
  }

  // ============ 4. 创建 member ============
  console.log("");

  // 检查是否传入了 member UID 参数
  const args = process.argv.slice(2);
  let memberUid = null;

  for (const arg of args) {
    if (arg.startsWith("--member-uid=")) {
      memberUid = arg.replace("--member-uid=", "");
    }
  }

  // 必须传入 --member-uid
  if (!memberUid) {
    console.error("ERROR: --member-uid is required.");
    console.error("");
    console.error("This script requires a real Auth Emulator user UID because:");
    console.error("- member document ID must match Auth user UID");
    console.error("- submitBookingRequest uses context.auth.uid to verify member identity");
    console.error("");
    console.error("Steps:");
    console.error("  1. Start emulators: firebase emulators:start --only auth,firestore,functions");
    console.error("  2. Open Emulator UI: http://127.0.0.1:4000/auth");
    console.error("  3. Create a test user in Auth Emulator");
    console.error("  4. Copy the generated UID from the user details");
    console.error("  5. Run: node functions/scripts/seedLocalEmulator.js --member-uid=<COPIED_UID>");
    console.error("");
    process.exit(1);
  }

  // 创建 member 文档
  console.log(`Writing member/${memberUid}...`);

  const memberRef = db.collection("member").doc(memberUid);
  await memberRef.set({
    name: "Alice",
    email: "alice@test.com",
    status: "active",
    profile_ID: "profile-001",
    created_at: admin.firestore.FieldValue.serverTimestamp()
  });

  console.log(`  ✓ member/${memberUid}`);
  console.log("");
  console.log(`IMPORTANT: member document ID must match Auth user UID (${memberUid})`);
  console.log("");

  // ============ 输出结果 ============
  console.log("-".repeat(60));
  console.log("Seed data written successfully!");
  console.log("-".repeat(60));
  console.log("");
  console.log("Documents created:");
  console.log("  - admin_staff/staff-001");
  console.log("  - facility/facility-001");
  console.log("  - time_slot/ (4 documents for " + tomorrowDate + ")");
  console.log(`  - member/${memberUid}`);
  console.log("");
  console.log("IMPORTANT: This is LOCAL emulator data, not cloud!");
  console.log("");

  // 验证数据
  console.log("Verifying data...");

  const facilityDoc = await db.collection("facility").doc("facility-001").get();
  console.log(`  ${facilityDoc.exists ? "✓" : "✗"} facility/facility-001`);

  const staffDoc = await db.collection("admin_staff").doc("staff-001").get();
  console.log(`  ${staffDoc.exists ? "✓" : "✗"} admin_staff/staff-001`);

  const memberDoc = await db.collection("member").doc(memberUid).get();
  console.log(`  ${memberDoc.exists ? "✓" : "✗"} member/${memberUid}`);

  const slotCount = await db.collection("time_slot")
    .where("facility_id", "==", "facility-001")
    .where("date", "==", tomorrowDate)
    .count()
    .get();

  console.log(`  ${slotCount.data().count === 4 ? "✓" : "✗"} time_slot/ (${slotCount.data().count} documents)`);
  console.log("");

  console.log("=".repeat(60));
  console.log("Next steps:");
  console.log("1. Ensure auth, firestore, functions emulators are running");
  console.log("2. Create/login with the test user in Auth Emulator or frontend");
  console.log("3. Verify member/" + memberUid + " exists and has status: active");
  console.log("4. Test submitBookingRequest with date: " + tomorrowDate);
  console.log("=".repeat(60));

  process.exit(0);
}

// 运行
seedData().catch((error) => {
  console.error("Seed script failed:", error);
  process.exit(1);
});