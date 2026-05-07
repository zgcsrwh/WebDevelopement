const functions = require("firebase-functions");
const admin = require("firebase-admin");
const { getAuth } = require("firebase-admin/auth");
const { FieldValue } = require("firebase-admin/firestore");

const db = admin.firestore();

/**
 * createStaffAccount - Admin creates Staff account
 *
 * API 8.3: Create staff account
 *
 * Payload (Network实测):
 * {
 *   name: "rr",
 *   date_of_birth: "2026-05-07T00:00:00.000Z",
 *   address: "hhh",
 *   email: "wndwnc@163.com",
 *   password: "Staff1234"
 * }
 */
const createStaffAccount = functions.https.onCall(async (data, context) => {
  // 1. Permission check: must be logged in
  if (!context.auth) {
    throw new functions.https.HttpsError("unauthenticated", "Must be signed in.");
  }

  const callerUid = context.auth.uid;

  // 2. Permission check: caller must be active Admin
  const callerDoc = await db.doc(`admin_staff/${callerUid}`).get();
  if (!callerDoc.exists) {
    throw new functions.https.HttpsError("permission-denied", "Not a staff account.");
  }

  const callerData = callerDoc.data();
  const callerRole = String(callerData.role || "").toLowerCase();
  const callerStatus = String(callerData.status || "").toLowerCase();

  if (callerRole !== "admin") {
    throw new functions.https.HttpsError("permission-denied", "Only admins can create staff accounts.");
  }

  if (callerStatus !== "active") {
    throw new functions.https.HttpsError("failed-precondition", "Your account is not active.");
  }

  // 3. Field validation: name
  const name = String(data.name || "").trim();
  if (!name) {
    throw new functions.https.HttpsError("invalid-argument", "Please enter a valid name.");
  }
  if (name.length > 80) {
    throw new functions.https.HttpsError("invalid-argument", "Name must be 80 characters or less.");
  }
  if (name.includes("<") || name.includes(">")) {
    throw new functions.https.HttpsError("invalid-argument", "Name cannot contain '<' or '>'.");
  }

  // 4. Field validation: email
  const email = String(data.email || "").trim().toLowerCase();
  if (!email) {
    throw new functions.https.HttpsError("invalid-argument", "Please enter a valid email.");
  }
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
    throw new functions.https.HttpsError("invalid-argument", "Invalid email format.");
  }

  // 5. Field validation: date_of_birth
  const dateOfBirthInput = String(data.date_of_birth || "").trim();
  if (!dateOfBirthInput) {
    throw new functions.https.HttpsError("invalid-argument", "Please enter date of birth.");
  }

  // Compatible with YYYY-MM-DD and ISO date string
  let normalizedDate = "";
  if (/^\d{4}-\d{2}-\d{2}$/.test(dateOfBirthInput)) {
    normalizedDate = dateOfBirthInput;
  } else {
    const parsed = new Date(dateOfBirthInput);
    if (Number.isNaN(parsed.getTime())) {
      throw new functions.https.HttpsError("invalid-argument", "Invalid date of birth.");
    }
    normalizedDate = parsed.toISOString().slice(0, 10); // "2026-05-07"
  }

  // Validate date range
  const today = new Date();
  today.setHours(23, 59, 59, 999);
  const birthDate = new Date(normalizedDate);
  const minDate = new Date("1900-01-01");

  if (birthDate > today) {
    throw new functions.https.HttpsError("invalid-argument", "Date of birth cannot be in the future.");
  }
  if (birthDate < minDate) {
    throw new functions.https.HttpsError("invalid-argument", "Date of birth cannot be before 1900-01-01.");
  }

  // 6. Field validation: address
  const address = String(data.address || "").trim();
  if (!address) {
    throw new functions.https.HttpsError("invalid-argument", "Please enter an address.");
  }
  if (address.length > 200) {
    throw new functions.https.HttpsError("invalid-argument", "Address must be 200 characters or less.");
  }
  if (address.includes("<") || address.includes(">")) {
    throw new functions.https.HttpsError("invalid-argument", "Address cannot contain '<' or '>'.");
  }

  // 7. Field validation: password
  const password = String(data.password || "");
  if (!password) {
    throw new functions.https.HttpsError("invalid-argument", "Password is required.");
  }
  if (password.length < 8 || password.length > 128) {
    throw new functions.https.HttpsError("invalid-argument", "Password must be 8-128 characters.");
  }
  if (!/[a-zA-Z]/.test(password)) {
    throw new functions.https.HttpsError("invalid-argument", "Password must contain at least one letter.");
  }
  if (!/[0-9]/.test(password)) {
    throw new functions.https.HttpsError("invalid-argument", "Password must contain at least one number.");
  }
  if (/\s/.test(password)) {
    throw new functions.https.HttpsError("invalid-argument", "Password cannot contain spaces.");
  }

  // 8. Email global uniqueness check

  // 8.1 Check Firebase Auth
  try {
    await getAuth().getUserByEmail(email);
    // If no exception thrown, user already exists
    throw new functions.https.HttpsError("already-exists", "An account already exists for this email address.");
  } catch (authError) {
    if (authError.code === "auth/user-not-found") {
      // User does not exist, continue
    } else if (authError.code === "auth/email-already-exists") {
      throw new functions.https.HttpsError("already-exists", "An account already exists for this email address.");
    } else if (authError instanceof functions.https.HttpsError) {
      throw authError; // Already an HttpsError, re-throw
    } else {
      // Other errors, treat as internal error
      console.error("Firebase Auth check error:", authError);
      throw new functions.https.HttpsError("internal", "The request could not be completed.");
    }
  }

  // 8.2 Check admin_staff collection
  const existingStaff = await db
    .collection("admin_staff")
    .where("email", "==", email)
    .limit(1)
    .get();
  if (!existingStaff.empty) {
    throw new functions.https.HttpsError("already-exists", "An account already exists for this email address.");
  }

  // 8.3 Check member collection
  const existingMember = await db
    .collection("member")
    .where("email", "==", email)
    .limit(1)
    .get();
  if (!existingMember.empty) {
    throw new functions.https.HttpsError("already-exists", "An account already exists for this email address.");
  }

  // 9. Create Auth user
  let userRecord = null;
  try {
    userRecord = await getAuth().createUser({
      email,
      password,
      emailVerified: false,
      displayName: name,
    });
  } catch (createError) {
    console.error("Failed to create Auth user:", createError);
    if (createError.code === "auth/email-already-exists") {
      throw new functions.https.HttpsError("already-exists", "An account already exists for this email address.");
    }
    throw new functions.https.HttpsError("internal", "The request could not be completed.");
  }

  const newUid = userRecord.uid;

  // 10. Create admin_staff document
  try {
    await db.doc(`admin_staff/${newUid}`).set({
      name,
      email,
      address,
      date_of_birth: normalizedDate,
      role: "staff",
      status: "active",
      created_at: FieldValue.serverTimestamp(),
      updated_at: FieldValue.serverTimestamp(),
    });
  } catch (firestoreError) {
    console.error("Failed to create admin_staff document:", firestoreError);

    // 11. Rollback: delete the created Auth user
    try {
      await getAuth().deleteUser(newUid);
    } catch (rollbackError) {
      console.error("Failed to rollback Auth user:", rollbackError);
    }

    throw new functions.https.HttpsError("internal", "The request could not be completed.");
  }

  // 12. Return success
  return {
    success: true,
    staff_id: newUid,
  };
});

module.exports = { createStaffAccount };