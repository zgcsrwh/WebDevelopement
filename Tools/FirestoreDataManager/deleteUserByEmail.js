const admin = require('firebase-admin');
const serviceAccount = require('./serviceAccountKey.json');

if (!admin.apps.length) {
  admin.initializeApp({
    credential: admin.credential.cert(serviceAccount),
  });
}

const db = admin.firestore();
const auth = admin.auth();

async function deleteQueryDocs(querySnapshot) {
  if (querySnapshot.empty) {
    return [];
  }

  const deleted = [];
  const batch = db.batch();

  querySnapshot.docs.forEach((doc) => {
    deleted.push({ id: doc.id, data: doc.data() });
    batch.delete(doc.ref);
  });

  await batch.commit();
  return deleted;
}

async function main() {
  const email = process.argv[2];

  if (!email) {
    throw new Error('Usage: node deleteUserByEmail.js <email>');
  }

  const normalizedEmail = String(email).trim().toLowerCase();
  console.log(`Deleting records for ${normalizedEmail}...`);

  const memberSnapshot = await db.collection('member').where('email', '==', normalizedEmail).get();
  const deletedMembers = await deleteQueryDocs(memberSnapshot);

  const staffSnapshot = await db.collection('admin_staff').where('email', '==', normalizedEmail).get();
  const deletedStaff = await deleteQueryDocs(staffSnapshot);

  const profileIds = deletedMembers
    .map((item) => item.data.profile_ID)
    .filter(Boolean);

  for (const profileId of profileIds) {
    await db.collection('profile').doc(profileId).delete().catch(() => null);
  }

  for (const member of deletedMembers) {
    await db.collection('friends').doc(member.id).delete().catch(() => null);
  }

  const notificationSnapshot = await db.collection('notification').where('member_id', '==', normalizedEmail).get().catch(() => null);
  if (notificationSnapshot && !notificationSnapshot.empty) {
    await deleteQueryDocs(notificationSnapshot);
  }

  try {
    const userRecord = await auth.getUserByEmail(normalizedEmail);
    await auth.deleteUser(userRecord.uid);
    console.log(`Auth user deleted: ${userRecord.uid}`);
  } catch (error) {
    if (error.code === 'auth/user-not-found') {
      console.log('Auth user not found.');
    } else {
      throw error;
    }
  }

  console.log(`Deleted member docs: ${deletedMembers.length}`);
  console.log(`Deleted admin_staff docs: ${deletedStaff.length}`);
  console.log(`Deleted linked profile docs: ${profileIds.length}`);
}

main()
  .then(() => process.exit(0))
  .catch((error) => {
    console.error(error);
    process.exit(1);
  });
