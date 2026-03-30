// The standard database segment definition
export const FB_SCHEMAS = {

  // Member 集合结构
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

  // Admin/Staff 集合结构
  DB_PROFILE: {
    member_id: "",
    nickname: "",
    open_match: false,
    interests: "",
    self_description: "",
    available_time: "",
    last_updated:""
  }
};