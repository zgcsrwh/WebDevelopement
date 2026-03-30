import { createContext, useContext, useEffect, useState } from 'react'
import {
  createUserWithEmailAndPassword,
  signInWithEmailAndPassword,
  signInWithPopup,
  signOut,
  sendEmailVerification,
  onAuthStateChanged,
} from 'firebase/auth'

import { doc, setDoc, getDoc, serverTimestamp, query } from 'firebase/firestore'
// 请确保路径指向你的 firebase 配置文件
import { auth, googleProvider, db } from './FirebaseConfig' 
import FirestoreFunc from './FirebaseFunc';
import {FB_SCHEMAS} from './DatabaseScheme'

const AuthContext = createContext(null)

// 自定义 Hook 方便调用
export function useAuth() {
  const context = useContext(AuthContext)
  if (!context) {
    throw new Error('useAuth must be used within an AuthProvider')
  }
  return context
}

export function AuthProvider({ children }) {
  const [currentUser, setCurrentUser] = useState(null)
  const [userData, setUserData] = useState(null)
  const [loading, setLoading] = useState(true)

  // 1. 注册逻辑
  async function signup(name, email, password, address, date_of_birth) {
    const userCredential = await createUserWithEmailAndPassword(auth, email, password)
    const user = userCredential.user

    memberData = FB_SCHEMAS.DB_MEMBER
    memberData.name = name;
    memberData.date_of_birth = date_of_birth;
    memberData.email = email;
    memberData.address = address;

    // 保存用户数据到 Firestore
    await setDoc(doc(db, 'member', user.uid), {
      name,
      email,
      address,
      date_of_birth,
      createdAt: serverTimestamp(), // 使用服务器时间戳更准确
      cancel_times : 0,
      no_show_times : 0,
      profile_ID : "",
      status : "non_verified"
    })

    // 发送邮箱验证邮件
    await sendEmailVerification(user)

    // 注册后强制登出，要求用户先去邮箱验证
    await signOut(auth)
  }

  // 2. 邮箱密码登录逻辑
  async function login(email, password) {
    const userCredential = await signInWithEmailAndPassword(auth, email, password)
    const user = userCredential.user

    // 检查邮箱是否已验证
    if (!user.emailVerified) {
      await signOut(auth)
      throw new Error('请先验证您的邮箱后再登录。请检查您的收件箱。')
    }

    const { userSnap, isMember } = await findRole(email);

    // NewRegister member : Create profile and change status
    if(isMember){
      if(userSnap.status === "non_verified"){
        userSnap.status = "active";   
        const {success, id}  = await createProfile(userSnap.id);
        if(success)
        {
          FirestoreFunc.update("member", userSnap.id, { status: "active" , profile_ID: id });     
        }
        else{
          throw new Error('Failed to generation new user profile. Please contact customer service for help');
        }       
      }
    }
    return { userSnap, isMember };
  }

  // 3. Google 登录逻辑
  async function loginWithGoogle() {
    const userCredential = await signInWithPopup(auth, googleProvider)
    const user = userCredential.user

    // 检查用户是否已存在于数据库
    const userDoc = await getDoc(doc(db, 'member', user.uid))
    const isExistMember = userDoc.exists();
    if (!isExistMember) {
      // 新用户 - 初始化用户文档
      await setDoc(doc(db, 'member', user.uid), {
        name: user.displayName,
        email: user.email,
        address: "",
        date_of_birth: '',
        createdAt: serverTimestamp(),
        cancel_times : 0,
        no_show_times : 0,
        profile_ID : "",
        status : "active"
      })  
    }
    const { userSnap, isMember } = await findRole(user.email);
    if(!isExistMember)
    {
      const { success, id}  = await createProfile(userSnap.id);
      if(success){
        FirestoreFunc.update("member", userSnap.id, { profile_ID: id });     
      }
      else{
        throw new Error('Failed to generation new user profile. Please contact customer service for help');
      }
    }

    return { userSnap, isMember };
  }

  // Find out who is the logging person
  async function findRole(email){

      // Find
    const memberSnap = await FirestoreFunc.filterSingle("member", [{ field: "email", operator: "==", value: email }]);
    const adminStaffSnap = await FirestoreFunc.filterSingle("admin_staff", [{ field: "email", operator: "==", value: email }]);

    let userSnap = null;
    let isMember = false;
    if (memberSnap.length > 0){
      userSnap = memberSnap[0];
      isMember = true;
    }
    else if(adminStaffSnap.length > 0){
      userSnap = adminStaffSnap[0];
      isMember = false;
    }
    else{   
    }

    return{userSnap, isMember};
  }

  // A new member need to create a new profile and linked
  async function createProfile(member_id)
   {
      const profileData = FB_SCHEMAS.DB_PROFILE;
      profileData.member_id = member_id;

      const {success, id} = await FirestoreFunc.create("profile", profileData);
      console.log(success);
      console.log(id);

      return {success, id} ;
   }

  // 4. 登出逻辑
  async function logout() {
    setUserData(null)
    await signOut(auth)
  }

  // 5. 监听用户认证状态变化
  useEffect(() => {
    const unsubscribe = onAuthStateChanged(auth, async (user) => {
      setCurrentUser(user)
      if (user) {
        // 如果用户已登录，获取其 Firestore 中的详细数据
        const userDoc = await getDoc(doc(db, 'users', user.uid))
        if (userDoc.exists()) {
          const data = userDoc.data()
          setUserData(data)
        }
      } else {
        setUserData(null)
      }
      
      setLoading(false)
    })

    return unsubscribe
  }, [])

  const value = {
    currentUser,
    userData,
    loading,
    signup,
    login,
    loginWithGoogle,
    logout,
  }

  return (
    <AuthContext.Provider value={value}>
      {!loading && children}
    </AuthContext.Provider>
  )
}

export default AuthProvider;