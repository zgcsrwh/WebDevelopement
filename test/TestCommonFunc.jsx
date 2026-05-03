import { db } from "../src/provider/FirebaseConfig";
import { doc, writeBatch, collection, getDocs } from "firebase/firestore";
import { useAuth } from "../src/provider/AuthContext";
import { vi } from "vitest";

export async function testViewFacility() {

    const today = new Date().toISOString().slice(0, 10);
    const tomorrow = new Date();
    tomorrow.setDate(tomorrow.getDate() + 1);
    const tomorrowString = tomorrow.toISOString().slice(0, 10);

    // Add a Facility Information
    const batch = writeBatch(db);
    const facilityRef = doc(db, 'facility', "fac_ID_1");

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
    const facilityRef2 = doc(db, 'facility', "fac_ID_2");
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

    batch.set(doc(db, 'time_slot', "ts_1"), { facility_id: "fac_ID_1", date: today, start_time: "06", end_time: "07", status: "open", request_id: "" });
    batch.set(doc(db, 'time_slot', "ts_2"), { facility_id: "fac_ID_1", date: today, start_time: "07", end_time: "08", status: "open", request_id: "" });
    batch.set(doc(db, 'time_slot', "ts_3"), { facility_id: "fac_ID_1", date: today, start_time: "08", end_time: "09", status: "locked", request_id: "" });
    batch.set(doc(db, 'time_slot', "ts_4"), { facility_id: "fac_ID_1", date: today, start_time: "09", end_time: "10", status: "open", request_id: "" });

    batch.set(doc(db, 'time_slot', "ts_5"), { facility_id: "fac_ID_1", date: tomorrowString, start_time: "06", end_time: "07", status: "locked", request_id: "" });
    batch.set(doc(db, 'time_slot', "ts_6"), { facility_id: "fac_ID_1", date: tomorrowString, start_time: "07", end_time: "08", status: "locked", request_id: "" });
    batch.set(doc(db, 'time_slot', "ts_7"), { facility_id: "fac_ID_1", date: tomorrowString, start_time: "08", end_time: "09", status: "locked", request_id: "" });
    batch.set(doc(db, 'time_slot', "ts_8"), { facility_id: "fac_ID_1", date: tomorrowString, start_time: "09", end_time: "10", status: "locked", request_id: "" });
    
    await batch.commit();
};

export async function testViewBookings() {

    const batch = writeBatch(db);

    const today = new Date().toISOString().slice(0, 10);

    const tomorrow = new Date();
    tomorrow.setDate(tomorrow.getDate() + 1);
    const tomorrowString = tomorrow.toISOString().slice(0, 10);

    const yesterday = new Date();
    yesterday.setDate(yesterday.getDate() - 1);
    const yesterdayString = yesterday.toISOString().slice(0, 10);

    batch.set(doc(db, 'facility', "fac_ID_1"), {
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

    batch.set(doc(db, 'request', "req_ID_1"), {
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

    batch.set(doc(db, 'request', "req_ID_2"), {
        member_id: "test_member",
        facility_id: "fac_ID_1",
        staff_id: "",
        attendent: 4,
        activity_description: "Weekly friendly mixed-doubles badminton match with college classmates.",
        status: "upcoming",
        staff_response: "Approved Description",
        date: tomorrowString,
        start_time: "7",
        end_time: "8",
        created_at: today,
        completed_at: today
    }); 

    batch.set(doc(db, 'request', "req_ID_3"), {
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

    batch.set(doc(db, 'request', "req_ID_4"), {
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

    batch.set(doc(db, 'request', "req_ID_5"), {
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

    batch.set(doc(db, 'request', "req_ID_6"), {
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

    batch.set(doc(db, 'request', "req_ID_7"), {
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

    batch.set(doc(db, 'time_slot', "ts_1"), { facility_id: "fac_ID_1", date: tomorrowString, start_time: "06", end_time: "07", status: "locked", request_id: "req_ID_1" });
    batch.set(doc(db, 'time_slot', "ts_2"), { facility_id: "fac_ID_1", date: tomorrowString, start_time: "07", end_time: "08", status: "locked", request_id: "req_ID_2" });

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

export async function testLogout() {

    if (useAuth && useAuth.mockReturnValue) {
        useAuth.mockReturnValue({
            sessionProfile: null,
            sessionRole: null,
            logout: vi.fn(() => Promise.resolve())
        });
    }
}


export async function clearCollection(collectionName) {
  const querySnapshot = await getDocs(collection(db, collectionName));
  const batch = writeBatch(db);
  
  querySnapshot.forEach((document) => {
    batch.delete(document.ref);
  });
  
  await batch.commit();
}