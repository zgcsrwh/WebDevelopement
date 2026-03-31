// The standard database segment definition
export const FB_SCHEMAS = {

  // Member信息
  DB_MEMBER: {
    name: "",
    date_of_birth:  "",
    email: "",
    address: "",
    status: "non_verified",
    profile_ID : "",
    cancel_times: 0,
    no_show_times: 0
  },

  // 用户档案
  DB_PROFILE: {
    member_id: "",
    nickname: "",
    open_match: false,
    interests: "",
    self_description: "",
    available_time: "",
    last_updated:""
  },

  // 员工信息
  DB_ADMIN_STAFF: {
    name: "",
    date_of_birth:  "",
    email: "",
    address: "",
    role: "",
    status: "active"
  },

  // 场馆信息
  DB_FACILITY: {
    name: "",
    sport_type: "",
    description: "",
    usage_guidelines : "",
    capacity: 0,
    status : "normal",
    staff_id : "",
    start_time : 9,
    end_time : 18,
    location : ""
  },

  // 场馆申请订单
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

  // 场馆维修订单
  DB_REPAIR: {
    member_id: "",
    facility_id: "",
    staff_id: "",
    type: "surface",
    repair_description: "",
    status: "",
    completed_at: ""
  },

  // 匹配好友交互信息
  DB_MATCHING: {
    sender_id: "",
    reciever_id: "",
    apply_description: "",
    respond_message: "",
    status: "",
    completed_at: ""
  },

    // 通知信息
  DB_NOTIFICATION: {
    user_id: "",
    type : "",
    message: "",
    status: "",
    completed_at: ""
  },

  DB_TIME_SLOT: {
    facility_id: "",
    request_id : "",
    date: "",
    start_time: "",
    status: ""
  }

};