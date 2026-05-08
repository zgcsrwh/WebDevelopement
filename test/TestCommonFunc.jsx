import admin from 'firebase-admin';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { vi } from 'vitest';
import { useAuth } from '../src/provider/AuthContext';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
process.env.FIRESTORE_EMULATOR_HOST = '127.0.0.1:8080';
process.env.FIREBASE_AUTH_EMULATOR_HOST = '127.0.0.1:9099';
admin.initializeApp({
  projectId: 'learnfire-e5720'
});

const db = admin.firestore();
const auth = admin.auth();

async function syncUsersToAuth(verify) {

  try {
    const collections = ['member', 'admin_staff'];
    const usersToImport = [];

    console.log(verify)
    for (const colName of collections) {
      const snapshot = await db.collection(colName).get();
      snapshot.docs.forEach(doc => {
        const data = doc.data();
        if (data.email) {
          usersToImport.push({
            uid: doc.id,
            email: data.email,
            emailVerified: verify,
            password: '123456', 
            displayName: data.name || ''
          });
        }
      });
    }

    if (usersToImport.length === 0) {
      return;
    }

    for (const user of usersToImport) {
      try {
        await auth.createUser(user);
      } catch (err) {
        if (err.code !== 'auth/uid-already-exists' && err.code !== 'auth/email-already-exists') {
          console.error(`Error creating user ${user.email}:`, err.message);
        }
      }
    }
    
  } catch (error) {
    console.error('Error:', error);
  }
}

export async function testAuthen(role, email, verify = true, ifActive = true){
    const batch = db.batch();
    const actorStatus = "active";
    if(!ifActive) {
      actorStatus = "inactive";
    }

    if (role === "member") {
        batch.set(db.collection('member').doc("member_ID_1"), {
            name: "Example Member",
            email: email,
            status : "active",
        });
    }
    else if(role === "staff"){  
        batch.set(db.collection('admin_staff').doc("staff_ID_1"), {
            name: "Example Staff",
            email: email,
            role : role,
            status : "active",
        });
    }
    else if(role === "admin"){  
        batch.set(db.collection('admin_staff').doc("admin_ID_1"), {
            name: "Example Admin",
            email: email,
            role : role,
            status : "active",
        });
    }     
    await batch.commit();
    await syncUsersToAuth(verify);
}

export async function testViewFacility() {

    const today = new Date().toISOString().slice(0, 10);
    const tomorrow = new Date();
    tomorrow.setDate(tomorrow.getDate() + 1);
    const tomorrowString = tomorrow.toISOString().slice(0, 10);

    // Add a Facility Information
    const batch = db.batch();
    const facilityRef = db.collection('facility').doc("fac_ID_1");

    batch.set(facilityRef, {
      name: "Test Venue",
      sport_type: "Basketball",
      capacity: 3,
      status: "normal",
      start_time: 6,
      end_time: 10,
      description: "My Test Description",
      location : "My Test Location",
      staff_id : "ABCDEFG",
      usage_guidelines: "My Test Usage Guidelines"
    });

    // Add a fixing Facility Information
    const facilityRef2 = db.collection('facility').doc("fac_ID_2");
    batch.set(facilityRef2, {
      name: "Fixing Venue",
      sport_type: "Tennis",
      capacity: 6,
      status: "fixing",
      start_time: 12,
      end_time: 14,
      description: "My Test Description",
      location : "My Test Location",
      staff_id : "ABCDEFG",
      usage_guidelines: "My Test Usage Guidelines"
    });

    batch.set(db.collection('time_slot').doc("ts_1"), { facility_id: "fac_ID_1", date: today, start_time: "06", end_time: "07", status: "open", request_id: "" });
    batch.set(db.collection('time_slot').doc("ts_2"), { facility_id: "fac_ID_1", date: today, start_time: "07", end_time: "08", status: "open", request_id: "" });
    batch.set(db.collection('time_slot').doc("ts_3"), { facility_id: "fac_ID_1", date: today, start_time: "08", end_time: "09", status: "locked", request_id: "" });
    batch.set(db.collection('time_slot').doc("ts_4"), { facility_id: "fac_ID_1", date: today, start_time: "09", end_time: "10", status: "open", request_id: "" });

    batch.set(db.collection('time_slot').doc("ts_5"), { facility_id: "fac_ID_1", date: tomorrowString, start_time: "06", end_time: "07", status: "locked", request_id: "" });
    batch.set(db.collection('time_slot').doc("ts_6"), { facility_id: "fac_ID_1", date: tomorrowString, start_time: "07", end_time: "08", status: "locked", request_id: "" });
    batch.set(db.collection('time_slot').doc("ts_7"), { facility_id: "fac_ID_1", date: tomorrowString, start_time: "08", end_time: "09", status: "locked", request_id: "" });
    batch.set(db.collection('time_slot').doc("ts_8"), { facility_id: "fac_ID_1", date: tomorrowString, start_time: "09", end_time: "10", status: "locked", request_id: "" });
    
    batch.set(db.collection('time_slot').doc("ts_2_1"), { facility_id: "fac_ID_2", date: today, start_time: "12", end_time: "13", status: "open", request_id: "" });
    batch.set(db.collection('time_slot').doc("ts_2_2"), { facility_id: "fac_ID_2", date: today, start_time: "13", end_time: "14", status: "open", request_id: "" });


    await batch.commit();
};

export async function testViewBookings() {

    const batch = db.batch();

    const today = new Date().toISOString().slice(0, 10);

    const tomorrow = new Date();
    tomorrow.setDate(tomorrow.getDate() + 1);
    const tomorrowString = tomorrow.toISOString().slice(0, 10);

    const yesterday = new Date();
    yesterday.setDate(yesterday.getDate() - 1);
    const yesterdayString = yesterday.toISOString().slice(0, 10);

    batch.set(db.collection('facility').doc("fac_ID_1"), {
      name: "Test Venue",
      sport_type: "Basketball",
      capacity: 3,
      status: "normal",
      start_time: 6,
      end_time: 18,
      description: "My Test Description",
      location : "My Test Location",
      staff_id : "ABCDEFG",
      usage_guidelines: "My Test Usage Guidelines"
    });

    batch.set(db.collection('request').doc("req_ID_1"), {
        member_id: "test_member",
        facility_id: "fac_ID_1",
        staff_id: "",
        attendent: 4,
        activity_description: "Weekly friendly mixed-doubles badminton match with college classmates.",
        status: "pending",
        staff_response: "",
        date: tomorrowString,
        start_time: "6",
        end_time: "7",
        created_at: today,
        completed_at: today
    });  

    batch.set(db.collection('request').doc("req_ID_2"), {
        member_id: "test_member",
        facility_id: "fac_ID_1",
        staff_id: "",
        attendent: 4,
        activity_description: "Weekly friendly mixed-doubles badminton match with college classmates.",
        status: "accepted",
        staff_response: "Approved Description",
        date: tomorrowString,
        start_time: "7",
        end_time: "8",
        created_at: today,
        completed_at: today
    }); 

    batch.set(db.collection('request').doc("req_ID_3"), {
        member_id: "test_member",
        facility_id: "fac_ID_1",
        staff_id: "",
        attendent: 4,
        activity_description: "Weekly friendly mixed-doubles badminton match with college classmates.",
        status: "rejected",
        staff_response: "Rejected Description",
        date: tomorrowString,
        start_time: "8",
        end_time: "9",
        created_at: today,
        completed_at: today
    }); 

    batch.set(db.collection('request').doc("req_ID_4"), {
        member_id: "test_member",
        facility_id: "fac_ID_1",
        staff_id: "",
        attendent: 4,
        activity_description: "Weekly friendly mixed-doubles badminton match with college classmates.",
        status: "alternative suggested",
        staff_response: "Suggested Description",
        date: tomorrowString,
        start_time: "9",
        end_time: "10",
        created_at: today,
        completed_at: today
    }); 

    batch.set(db.collection('request').doc("req_ID_5"), {
        member_id: "test_member",
        facility_id: "fac_ID_1",
        staff_id: "",
        attendent: 4,
        activity_description: "Weekly friendly mixed-doubles badminton match with college classmates.",
        status: "cancelled",
        staff_response: "Original Response for cancelled booking",
        date: tomorrowString,
        start_time: "10",
        end_time: "11",
        created_at: today,
        completed_at: today
    });   

    batch.set(db.collection('request').doc("req_ID_6"), {
        member_id: "test_member",
        facility_id: "fac_ID_1",
        staff_id: "",
        attendent: 4,
        activity_description: "Weekly friendly mixed-doubles badminton match with college classmates.",
        status: "no_show",
        staff_response: "Original Response for no show booking",
        date: yesterdayString,
        start_time: "11",
        end_time: "12",
        created_at: yesterdayString,
        completed_at: yesterdayString
    });   

    batch.set(db.collection('request').doc("req_ID_7"), {
        member_id: "test_member",
        facility_id: "fac_ID_1",
        staff_id: "",
        attendent: 4,
        activity_description: "Weekly friendly mixed-doubles badminton match with college classmates.",
        status: "completed",
        staff_response: "Original Response for completed booking",
        date: yesterdayString,
        start_time: "12",
        end_time: "13",
        created_at: yesterdayString,
        completed_at: yesterdayString
    });      

    batch.set(db.collection('time_slot').doc("ts_1"), { facility_id: "fac_ID_1", date: tomorrowString, start_time: "06", end_time: "07", status: "locked", request_id: "req_ID_1" });
    batch.set(db.collection('time_slot').doc("ts_2"), { facility_id: "fac_ID_1", date: tomorrowString, start_time: "07", end_time: "08", status: "locked", request_id: "req_ID_2" });

    await batch.commit();
};

export async function testViewReports() {

    const batch = db.batch();

    batch.set(db.collection('repair').doc("rep_ID_1"), {
      member_id: "test_member",
      facility_id: "fac_ID_1",
      staff_id: "",
      type: "Surface",
      repair_description: "A noticeable tear in the synthetic turf near the penalty spot. Needs urgent patching to prevent tripping.",
      status: "pending",
      created_at: "2026-03-20",
      completed_at: ""
    });

      batch.set(db.collection('repair').doc("rep_ID_2"), {
      member_id: "test_member",
      facility_id: "fac_ID_1",
      staff_id: "",
      type: "Equipement",
      repair_description: "Floor Broken",
      status: "resolved",
      created_at: "2026-05-01",
      completed_at: "2026-05-02"
    });  

    await batch.commit();
};

export async function testViewProfile() {

    const batch = db.batch();

    batch.set(db.collection('profile').doc("profile_ID_1"), {
      member_id: "test_member",
      nickname: "AceSpiker",
      open_match: true,
      interests: ["Badminton", "Tennis", "Swimming"],
      self_description: "Intermediate badminton player looking for doubles partners. I love competitive but friendly matches!",
      available_time: ["monday_evening", "wednesday_evening", "saturday_afternoon"],
      last_updated: "2026-03-15" 

    });


    await batch.commit();
};

export async function testLoginMember(customProfile = {}) {
    // default member
    const defaultProfile = {
        id: "test_member",
        name: "Test Member",
        email: "testMember@example.com",
        status: "active",
        role: "Member",
        date_of_birth: "2000-01-01",
        address: "southampton"
    };

    const sessionProfile = { ...defaultProfile, ...customProfile };

    // 2. 配置 mock 的登录校验数据，使得后续组件中的 useAuth() 返回的都是这个用户信息
    if (useAuth && useAuth.mockReturnValue) {
        useAuth.mockReturnValue({
            sessionProfile: sessionProfile,
            sessionRole: sessionProfile.role,
            logout: vi.fn(() => Promise.resolve())
        });
    } else {
        console.warn("useAuth is not mocked. Make sure to include vi.mock('../src/provider/AuthContext') in your test file.");
    }

    return sessionProfile;
};

export async function testLoginStaff(customProfile = {}) {
    // default staff
    const defaultProfile = {
        id: "test_staff",
        name: "Test Staff",
        email: "testStaff@example.com",
        status: "active",
        role: "staff",
        date_of_birth: "2000-01-01",
        address: "southampton"
    };

    const sessionProfile = { ...defaultProfile, ...customProfile };

    if (useAuth && useAuth.mockReturnValue) {
        useAuth.mockReturnValue({
            sessionProfile: sessionProfile,
            sessionRole: sessionProfile.role,
            logout: vi.fn(() => Promise.resolve())
        });
    } else {
        console.warn("useAuth is not mocked. Make sure to include vi.mock('../src/provider/AuthContext') in your test file.");
    }

    return sessionProfile;
};

export async function testLogout() {

    if (useAuth && useAuth.mockReturnValue) {
        useAuth.mockReturnValue({
            sessionProfile: null,
            sessionRole: null,
            logout: vi.fn(() => Promise.resolve())
        });
    }
}


async function clearAllAuthUsers() {
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
}

export async function clearCollection(collectionName) {
  const querySnapshot = await db.collection(collectionName).get();
  const batch = db.batch();

  if(collectionName === "member" || collectionName === "admin_staff")
  {
      await clearAllAuthUsers();
  }

  for (const document of querySnapshot.docs) {
    batch.delete(document.ref);
  }
  
  querySnapshot.forEach((document) => {
    batch.delete(document.ref);
  });
  
  await batch.commit();
}