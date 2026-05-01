const admin = require('firebase-admin');
const serviceAccount = require('./serviceAccountKey.json');
const fs = require('fs');
const path = require('path');

// Initialization
admin.initializeApp({
  credential: admin.credential.cert(serviceAccount)
});

const db = admin.firestore();
const auth = admin.auth();

// Main funcion
async function resetProjectDatabase() {
  
  // Get the collections in firestore
  console.log('Begin Resetting the firestore...');
  console.log(`-----------------------------------------------`);
  const collections = await db.listCollections();
  const collectionNames = collections.map(col => col.id);
  
  // Clear all the original collections
  console.log(`Start cleaning the original collections`);
  for (const collectionName of collectionNames) {
    await deleteCollection(collectionName, 100);
    console.log(`Firestore Cleared: ${collectionName}`);
  }
  console.log(`-----------------------------------------------`);

  // Setting the basic collection information
  await resetAndImportAll("1_People");
  await resetAndImportAll("2_Facility");
  await resetAndImportAll("3_Request");
  await resetAndImportAll("4_Other");

  // Connecting the mapping id and generate supplementray information
  // Warning : Do not change the sequence
  await assignStaffToFacilities();
  await assignMemberToProfile();
  await populateRequestCollections("request");
  await populateRequestCollections("repair");
  await randomizeMatchingIds();
 
  // Generate supplementary information
  await createFriendsCollection();
  await syncFriendships();
  await generateNotification();
  await generateTimeSlots();
  await syncRequestsToTimeSlots();

  // Clear and generate authenticartion information
  await syncUsersToAuth();
  process.exit();
}

// Assign staff IDs to facilities
async function assignStaffToFacilities() {
  try {
    // 1. Get all staff IDs where role == "staff"
    const staffSnapshot = await db.collection('admin_staff')
      .where('role', '==', 'staff')
      .get();

    if (staffSnapshot.empty) {
      console.log('No employees with the "staff" role found.');
      return;
    }

    const staffIds = staffSnapshot.docs.map(doc => doc.id);
    console.log(`Retrieved ${staffIds.length} staff members.`);

    // 2. Get all facilities
    const facilitySnapshot = await db.collection('facility').get();

    if (facilitySnapshot.empty) {
      console.log('Facility collection is empty, no assignment needed.');
      return;
    }

    // 3. Start batch update (using WriteBatch for higher performance)
    const batch = db.batch();
    
    facilitySnapshot.docs.forEach((doc, index) => {
      // Use modulo operation (%) for cyclic assignment
      // Example: If there are 3 staff and 5 facilities, assignment indices are 0, 1, 2, 0, 1
      const assignedStaffId = staffIds[index % staffIds.length];
      
      const facilityRef = db.collection('facility').doc(doc.id);
      batch.update(facilityRef, { staff_id: assignedStaffId });
      
      //console.log(`场馆 [${doc.id}] 已分配给员工 [${assignedStaffId}]`);
    });

    // 4. Commit
    await batch.commit();
    console.log('Success : update facility : staff_id');

  } catch (error) {
    console.error('Error :', err);
  }
}

// Assign member_id to profiles, requiring matching counts (manually controlled via JSON)
async function assignMemberToProfile() {
  try {
    // 1. Get all member IDs
    const memberSnapshot = await db.collection('member').get();

    if (memberSnapshot.empty) {
      console.log('No member information found.');
      return;
    }

    // 2. Get all profile IDs
    const profileSnapshot = await db.collection('profile').get();

    if (profileSnapshot.empty) {
      console.log('No profile information found.');
      return;
    }

    if(memberSnapshot.size != profileSnapshot.size)
    {
      console.log('Mismatch in member and profile counts');
      return;
    }

    // 3. Start batch update (using WriteBatch for higher performance)
    const batch = db.batch();

    const memberDocs = memberSnapshot.docs;
    const profileDocs = profileSnapshot.docs;
    
    profileDocs.forEach((profileDoc, index) => {
      const memberDoc = memberDocs[index];

      const profileRef = db.collection('profile').doc(profileDoc.id);
      const memberRef = db.collection('member').doc(memberDoc.id);

      // Record the associated member_id in the profile
      batch.update(profileRef, { member_id: memberDoc.id });

      // Record the associated profile_id in the member
      batch.update(memberRef, { profile_ID: profileDoc.id });

    });

    // 4. Commit all batch
    await batch.commit();
    console.log('Success : update profile : member_id');

  } catch (error) {
    console.error('Error :', error);
  }
}

// Assign member, facility, and staff to requests
async function populateRequestCollections(CollectionName) {
  try {
    console.log('Starting synchronization of', CollectionName, 'collection fields...');

    // Generate 7 possible dates (Today + next 6 days)
    const dateRange = [];
    for (let i = 0; i <= 6; i++) {
      const d = new Date();
      d.setDate(d.getDate() + i);
      dateRange.push(d.toISOString().split('T')[0]);
    }

    // 1. Get all member IDs
    const memberSnapshot = await db.collection('member').get();
    const memberIds = memberSnapshot.docs.map(doc => doc.id);

    // 2. Get all facility data (including internal staff_id)
    const facilitySnapshot = await db.collection('facility').get();
    const facilities = facilitySnapshot.docs.map(doc => ({
      id: doc.id,
      staff_id: doc.data().staff_id // Get the facility's preset person-in-charge ID
    }));

    if (memberIds.length === 0 || facilities.length === 0) {
      console.error('Error: member or facility collection is empty, cannot assign.');
      return;
    }

    // 3. Get all CollectionNames to be completed
    const requestSnapshot = await db.collection(CollectionName).get();
    
    const batch = db.batch();
    let count = 0;

    requestSnapshot.docs.forEach((doc, index) => {
      // Strategy: Cyclic assignment to simulate different members applying for different venues
      const randomMemberId = memberIds[index % memberIds.length];
      const targetFacility = facilities[index % facilities.length];
      // Randomly pick a date from the 7-day range
      const randomDate = dateRange[Math.floor(Math.random() * dateRange.length)];

      const requestRef = db.collection(CollectionName).doc(doc.id);
      
      batch.update(requestRef, {
        member_id: randomMemberId,
        facility_id: targetFacility.id,
        staff_id: targetFacility.staff_id || "", // Automatically associate with the venue's staff
        date: randomDate // Set the date to a random day within today and the next 7 days
      });

      count++;
    });

    // 4. Submit batch updates
    if (count > 0) {
      await batch.commit();
      console.log(`Successfully updated ${count} application records!`);
    } else {
      console.log('No documents found to update.');
    }

  } catch (error) {
    console.error('Error during update process:', error);
  }
}

// Fill sender_id and reciever_id in matching collection
async function randomizeMatchingIds() {
  try {
    console.log('Starting random assignment of friend request senders and receivers...');

    // 1. Get all member IDs
    const memberSnapshot = await db.collection('member').get();
    const memberIds = memberSnapshot.docs.map(doc => doc.id);

    if (memberIds.length < 2) {
      console.error('Error: Insufficient members (need at least 2) to create friend requests.');
      return;
    }

    // 2. Get all pending matching records
    const matchingSnapshot = await db.collection('matching').get();
    
    const batch = db.batch();
    let count = 0;

    matchingSnapshot.docs.forEach((doc) => {
      // 3. Random logic: Randomly select two different IDs from the array
      let senderIdx = Math.floor(Math.random() * memberIds.length);
      let recieverIdx = Math.floor(Math.random() * memberIds.length);

      // Ensure sender and receiver are not the same person
      while (recieverIdx === senderIdx) {
        recieverIdx = Math.floor(Math.random() * memberIds.length);
      }

      const senderId = memberIds[senderIdx];
      const recieverId = memberIds[recieverIdx];

      // 4. Update matching records
      const matchingRef = db.collection('matching').doc(doc.id);
      batch.update(matchingRef, {
        sender_id: senderId,
        reciever_id: recieverId
      });

      count++;
    });

    // 5. Submit batch updates
    if (count > 0) {
      await batch.commit();
      console.log(`Successfully assigned IDs for ${count} matching records!`);
    }

  } catch (error) {
    console.error('Error during random assignment:', error);
  }
}

// Create a friends relationship table for each member
async function createFriendsCollection() {
  try {
    console.log('Initializing friend tables for all members...');

    // 1. Get all members
    const memberSnapshot = await db.collection('member').get();

    if (memberSnapshot.empty) {
      console.log('No member data found.');
      return;
    }

    const batch = db.batch();
    let count = 0;

    memberSnapshot.docs.forEach((doc) => {
      const memberId = doc.id;
      
      // 2. Create a new document in the friends collection
      // Suggestion: Use the member ID as the friends document ID for easier querying
      const friendRef = db.collection('friends').doc(memberId);
      
      batch.set(friendRef, {
        member_id: memberId,
        friends_ids: [] // Initialize as an empty array (Array[String])
      });

      count++;

    });

    // 3. Submit all changes
    await batch.commit();
    console.log(`Success! Created friend relationship tables for ${count} members.`);

  } catch (error) {
    console.error('Initialization failed:', error);
  }
}
async function syncFriendships() {
  console.log('Monitoring status changes in the matching collection...');

  try {
    // 1. Get all matching records with status 'accepted'
    const matchingSnapshot = await db.collection('matching')
      .where('status', '==', 'accepted')
      .get();

    if (matchingSnapshot.empty) {
      console.log('No accepted friend requests found.');
      return;
    }

    const batch = db.batch();
    let updateCount = 0;

    for (const doc of matchingSnapshot.docs) {
      const data = doc.data();
      const senderId = data.sender_id;
      const recieverId = data.reciever_id;

      if (!senderId || !recieverId) continue;

      // 2. Get bidirectional friends document references
      // Assume friends collection document IDs match member_id
      const senderFriendRef = db.collection('friends').doc(senderId);
      const recieverFriendRef = db.collection('friends').doc(recieverId);

      // 3. Use arrayUnion atomic operation to add friend IDs
      // This avoids duplicates and the need to read array content first
      batch.update(senderFriendRef, {
        friends_ids: admin.firestore.FieldValue.arrayUnion(recieverId)
      });

      batch.update(recieverFriendRef, {
        friends_ids: admin.firestore.FieldValue.arrayUnion(senderId)
      });

      updateCount++;
    }

    // 4. Submit batch updates
    await batch.commit();
    console.log(`Sync complete! Processed ${updateCount} bidirectional friend relationships.`);

  } catch (error) {
    console.error('Error syncing friend relationships:', error);
  }
}

async function generateNotification() {
  try {
    console.log('Generating personalized notifications based on current status...');

    const batch = db.batch();
    let notificationCount = 0;

    // 1. Define message templates for Request statuses
    const requestMessages = {
      "pending": "Your facility request has been uploaded and is waiting to be checked.",
      "accepted": "Your facility request has been accepted.",
      "rejected": "Sorry, your facility request has been rejected. Please check the staff response for details.",
      "alternative_suggested": "An alternative time has been suggested for your booking. Please review it.",
      "upcoming": "Get ready! Your booking is confirmed and upcoming soon.",
      "completed": "Your session has ended. We hope you enjoyed the facility!",
      "cancelled": "Your facility request has been successfully cancelled."
    };

    // 2. Define message templates for Repair statuses
    const repairMessages = {
      "pending": "Your repair report is received. Our maintenance team will look into it shortly.",
      "resolved": "Great news! The issue you reported has been resolved. Thanks for your patience."
    };

    
    // 3. Process Request collection
    const requestSnapshot = await db.collection('request').get();
    requestSnapshot.docs.forEach(doc => {
      const data = doc.data();
      if (data.member_id && requestMessages[data.status]) {
        const notifyRef = db.collection('notification').doc();
        batch.set(notifyRef, {
          member_id: data.member_id,
          message: requestMessages[data.status],
          status_context: data.status,
          type: "facility_request",
          created_at: new Date()
        });
        notificationCount++;
      }
    });
    
    // 4. Process Repair collection
    const repairSnapshot = await db.collection('repair').get();
    repairSnapshot.docs.forEach(doc => {
      const data = doc.data();
      if (data.member_id && repairMessages[data.status]) {
        const notifyRef = db.collection('notification').doc();
        batch.set(notifyRef, {
          member_id: data.member_id,
          message: repairMessages[data.status],
          status_context: data.status,
          type: "repair_report",
          created_at: new Date()
        });
        notificationCount++;
      }
    });
    
    // 5. Submit updates
    if (notificationCount > 0) {
      await batch.commit();
      console.log(`Success! Generated ${notificationCount} notifications based on current status.`);
    }

  } catch (error) {
    console.error('Failed to generate notifications:', error);
  }
}

/**
 * Deletes all users from Firebase Authentication in batches.
 */
async function clearAllAuthUsers() {
  console.log('Clearing all users from Firebase Authentication...');
  let nextPageToken;
  let totalDeleted = 0;

  do {
    const listUsersResult = await auth.listUsers(1000, nextPageToken);
    const uids = listUsersResult.users.map((userRecord) => userRecord.uid);
    if (uids.length > 0) {
      await auth.deleteUsers(uids);
      totalDeleted += uids.length;
    }
    nextPageToken = listUsersResult.pageToken;
  } while (nextPageToken);

  console.log(`Successfully cleared ${totalDeleted} users from Firebase Auth.`);
}

async function syncUsersToAuth() {
  try {
    // First, clear all existing users in Firebase Auth
    await clearAllAuthUsers();

    console.log('Syncing Firestore users to Firebase Authentication...');

    // 1. Define collections to read
    const collections = ['member', 'admin_staff'];
    const usersToImport = [];

    for (const colName of collections) {
      const snapshot = await db.collection(colName).get();

      snapshot.docs.forEach(doc => {
        const data = doc.data();
        if (data.email) {
          usersToImport.push({
            uid: doc.id, // Use Firestore doc ID as Auth UID for consistency
            email: data.email,
            emailVerified: true, // Mark as verified
            password: '123456',  // Standard initial password
            displayName: data.name
          });
        }
      });
    }

    if (usersToImport.length === 0) {
      console.log('No valid email info found.');
      return;
    }

    console.log("success");
    for (const user of usersToImport) {
      try {
        await auth.createUser(user);
        console.log(`Successfully created user: ${user.email}`);
      } catch (err) {
        if (err.code === 'auth/email-already-exists') {
          console.log(`Skipping existing email: ${user.email}`);
        } else {
          console.error(`Failed to create ${user.email}:`, err.message);
        }
      }
    }
    
    console.log('--- Sync Complete ---');
  } catch (error) {
    console.error('Fatal error during sync process:', error);
  }
}

async function generateTimeSlots() {
  try {
    console.log('Generating time slots for the next 7 days...');

    const facilitySnapshot = await db.collection('facility').get();
    if (facilitySnapshot.empty) return;

    // 1. Initialize the first batch
    let batch = db.batch(); 
    let slotCount = 0;

    const dates = [];
    for (let i = 0; i < 7; i++) {
      const d = new Date();
      d.setDate(d.getDate() + i);
      dates.push(d.toISOString().split('T')[0]);
    }

    for (const facilityDoc of facilitySnapshot.docs) {
      const facility = facilityDoc.data();
      const facilityId = facilityDoc.id;
      
      const openHour = parseInt(facility.start_time);
      const closeHour = parseInt(facility.end_time);
      for (const date of dates) {
        for (let hour = openHour; hour < closeHour; hour++) {
          const slotRef = db.collection('time_slot').doc();
          
          batch.set(slotRef, {
            facility_id: facilityId,
            date: date,
            start_time: hour.toString(),
            end_time: (hour + 1).toString(),
            status: "open",
            request_id: ""
          });

          slotCount++;

          if (slotCount % 500 === 0) {
            await batch.commit();
            console.log(`Commit time slot ${slotCount} ...`);
            batch = db.batch(); //
          }
        }
      }
    }

    if (slotCount % 500 !== 0) {
      await batch.commit();
    }
    
    console.log(`Generating time slots: ${slotCount}`);

  } catch (error) {
    console.error('Error:', error);
  }
}


async function syncRequestsToTimeSlots() {
  try {
    console.log('Syncing application records to time slots (supporting cross-period matching)...');

    const requestSnapshot = await db.collection('request').get();
    if (requestSnapshot.empty) return;

    let batch = db.batch();
    let updateCount = 0;

    for (const requestDoc of requestSnapshot.docs) {
      const requestData = requestDoc.data();
      if (!requestData) continue;

      const { facility_id, date, start_time, end_time } = requestData;
      
      // Convert application times to numbers for comparison
      const reqStart = parseInt(start_time);
      const reqEnd = parseInt(end_time);

      // 1. Get all time slots for this facility on this date
      // Get the Request date (assuming it's a native Timestamp)
      const reqDate = requestData.date; 

      // Query time
      const slotsSnapshot = await db.collection('time_slot')
        .where('facility_id', '==', facility_id)
        .where('date', '==', reqDate) // Match the entire day
        .get();

      if (!slotsSnapshot.empty) {
        for (const slotDoc of slotsSnapshot.docs) {
          const slotData = slotDoc.data();
          const slotStart = parseInt(slotData.start_time);
          const slotEnd = parseInt(slotData.end_time);

          // 2. Core logic: Determine inclusion relationship
          // Condition: TimeSlot is within the Request time range
          if (slotStart >= reqStart && slotEnd <= reqEnd) {
            const slotRef = db.collection('time_slot').doc(slotDoc.id);
            
            batch.update(slotRef, {
              status: "locked",
              request_id: requestDoc.id,
            });

            updateCount++;

            // Submit every 500 operations and reset batch
            if (updateCount % 500 === 0) {
              await batch.commit();
              console.lo
              g(`Processed ${updateCount} time slot locks...`);
              batch = db.batch();
            }
          }
        }
      }
    }

    if (updateCount % 500 !== 0) {
      await batch.commit();
    }

    console.log(`Sync complete! Locked ${updateCount} time slots meeting the inclusion criteria.`);

  } catch (error) {
    console.error('❌ Sync failed:', error);
  }
}

/**
 * Recursively delete all documents in a collection (Firestore limit of 500 per batch)
 */

async function resetAndImportAll(Subfolder) {
  console.log('Start Setting Firestore...');

  const dataDir = path.join(__dirname, 'BasicData/',Subfolder);
  
  try {
    // 1. Read all files in the data folder
    const files = fs.readdirSync(dataDir).filter(file => file.endsWith('.json'));
    
    if (files.length === 0) {
      console.log('No data file');
      return;
    }

    for (const file of files) {

      // 2. Use filename (removing .json) as collection name
      const collectionName = path.parse(file).name;
      const filePath = path.join(dataDir, file);
      
      // 3. Read and parse JSON content
      const rawData = fs.readFileSync(filePath, 'utf8');
      const items = JSON.parse(rawData);

      // 5. Batch write new data
      const batch = db.batch();
      items.forEach((item) => {

        // If no ID provided in JSON, auto-generate it
        const docId = item.id || db.collection(collectionName).doc().id;
        const docRef = db.collection(collectionName).doc(docId);
        
        const processedData = {};
  
        // Iterate through keys to automatically discover types needing conversion
        Object.keys(item).forEach(key => {
        const val = item[key];
        if (val && typeof val === 'object' && val._type === 'timestamp') {
          processedData[key] = new Date(val.value);
        } else {
          processedData[key] = val;
        }
        });

        batch.set(docRef, {
          ...processedData
        });
      });

      await batch.commit();
    }
    console.log(`Finished Setting Firestore`);
  } catch (err) {
    console.error('Error :', err);
  } 
}

/**
 * Recursive collection deletion function (maintaining previous logic)
 */
async function deleteCollection(collectionPath, batchSize) {
  const collectionRef = db.collection(collectionPath);
  const query = collectionRef.orderBy('__name__').limit(batchSize);

  return new Promise((resolve, reject) => {
    deleteQueryBatch(query, resolve).catch(reject);
  });
}

async function deleteQueryBatch(query, resolve) {
  const snapshot = await query.get();

  const batchSize = snapshot.size;
  if (batchSize === 0) {
    resolve();
    return;
  }

  const batch = db.batch();
  snapshot.docs.forEach((doc) => {
    batch.delete(doc.ref);
  });
  await batch.commit();

  // Recursively handle the next batch
  process.nextTick(() => {
    deleteQueryBatch(query, resolve);
  });
}

resetProjectDatabase();