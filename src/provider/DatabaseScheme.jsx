// DatabaseScheme stores old default shapes used by early Firebase helper code.
// Some service files use these shapes as simple defaults.
export const FB_SCHEMAS = {

  // Member data.
  DB_MEMBER: {
    name: "",
    date_of_birth: "",
    email: "",
    address: "",
    status: "non_verified",
    profile_ID: "",
    cancel_times: 0,
    no_show_times: 0
  },

  // Match profile data.
  DB_PROFILE: {
    member_id: "",
    nickname: "",
    open_match: false,
    interests: "",
    self_description: "",
    available_time: "",
    last_updated: ""
  },

  // Staff and admin data.
  DB_ADMIN_STAFF: {
    name: "",
    date_of_birth: "",
    email: "",
    address: "",
    role: "",
    status: "active"
  },

  // Facility data.
  DB_FACILITY: {
    name: "",
    sport_type: "",
    description: "",
    usage_guidelines: "",
    capacity: 0,
    status: "normal",
    staff_id: "",
    start_time: 9,
    end_time: 18,
    location: ""
  },

  // Booking request data.
  DB_REQUEST: {
    member_id: "",
    facility_id: "",
    staff_id: "",
    attendent: 0,
    activity_description: "",
    status: "",
    staff_response: "",
    date: "",
    start_time: "",
    end_time: "",
    completed_at: ""
  },

  // Repair ticket data.
  DB_REPAIR: {
    member_id: "",
    facility_id: "",
    staff_id: "",
    type: "surface",
    repair_description: "",
    status: "",
    completed_at: ""
  },

  // Match request data.
  DB_MATCHING: {
    sender_id: "",
    reciever_id: "",
    apply_description: "",
    respond_message: "",
    status: "",
    completed_at: ""
  },

  // Notification data.
  DB_NOTIFICATION: {
    user_id: "",
    type: "",
    message: "",
    status: "",
    completed_at: ""
  },

  // Time slot data.
  DB_TIME_SLOT: {
    facility_id: "",
    request_id: "",
    date: "",
    start_time: "",
    status: ""
  }

};
