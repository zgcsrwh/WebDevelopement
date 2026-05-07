// AuthContext keeps the signed-in user, role, and profile data for all pages.
import { createContext, useCallback, useContext, useEffect, useMemo, useState } from "react";
import {
  createUserWithEmailAndPassword,
  onAuthStateChanged,
  reload,
  sendEmailVerification,
  signInWithEmailAndPassword,
  signInWithPopup,
  signOut,
} from "firebase/auth";
import { auth, googleProvider } from "./FirebaseConfig";
import {
  createUserProfile,
  getRegistrationEligibility,
  getUserContext,
  getUserContextOnLogin,
  normalizeUserContextPayload,
} from "../services/authService";
import FirestoreFunc from "./FirebaseFunc"


const AuthContext = createContext(null);

// eslint-disable-next-line react-refresh/only-export-components
export function useAuth() {
  const context = useContext(AuthContext);
  if (!context) {
    throw new Error("useAuth must be used within AuthProvider");
  }
  return context;
}

async function signInAndLoad(email, password) {
  // Reload after login so email verification is not using stale browser data.
  const credential = await signInWithEmailAndPassword(auth, email, password);
  await reload(credential.user);
  return credential.user;
}

async function assertEmailAvailableForMemberRegistration(email) {
  // Member registration cannot reuse a staff, admin, or existing member email.
  const context = await getRegistrationEligibility(email);
  if (context.canRegister) {
    return;
  }

  if (context.role === "Member") {
    throw new Error("An account already exists for this email. Please sign in instead.");
  }

  throw new Error("This email is already used by a staff or admin account.");
}

function normalizeSessionContext(context = {}) {
  return normalizeUserContextPayload(context, context.role || "Member");
}

function canUseAccountStatus(role = "", status = "") {
  // Unassigned staff can still sign in. Deactivated staff cannot.
  const normalizedRole = String(role || "").toLowerCase();
  const normalizedStatus = String(status || "").toLowerCase();

  if (normalizedRole === "staff") {
    return normalizedStatus === "active" || normalizedStatus === "unassigned";
  }

  return normalizedStatus === "active";
}

export function AuthProvider({ children }) {
  const [currentUser, setCurrentUser] = useState(null);
  const [authReady, setAuthReady] = useState(false);
  const [sessionRole, setSessionRole] = useState("Member");
  const [sessionProfile, setSessionProfile] = useState(null);
  const [authLoading, setAuthLoading] = useState(false);
  const [registrationPending, setRegistrationPending] = useState(false);

  const resetSession = useCallback(() => {
    setSessionProfile(null);
    setSessionRole("Member");
  }, []);

  const clearRegistrationPending = useCallback(() => {
    setRegistrationPending(false);
  }, []);

  async function beginEmailVerification(email, password) {
    setAuthLoading(true);
    try {
      await assertEmailAvailableForMemberRegistration(email);
      const credential = await createUserWithEmailAndPassword(auth, email, password);
      // Store the uid in a temporary document before profile creation.
      const uid = credential.user.uid;
      FirestoreFunc.create("TempUser", {email:email, uid:uid});

      await sendEmailVerification(credential.user);
      setRegistrationPending(true);
      return { success: true };
    } finally {
      setAuthLoading(false);
    }
  }

  async function resendRegistrationVerification(email, password) {
    setAuthLoading(true);
    try {
      let user = auth.currentUser;
      if (!user || user.email !== email) {
        await assertEmailAvailableForMemberRegistration(email);
        user = await signInAndLoad(email, password);
      } else {
        await reload(user);
      }
      if (user.emailVerified) {
        setRegistrationPending(true);
        return { success: true, verified: true };
      }
      await sendEmailVerification(user);
      setRegistrationPending(true);
      return { success: true, verified: false };
    } finally {
      setAuthLoading(false);
    }
  }

  async function checkRegistrationVerification(email, password) {
    setAuthLoading(true);
    try {
      let user = auth.currentUser;
      if (!user || user.email !== email) {
        user = await signInAndLoad(email, password);
      } else {
        await reload(user);
      }
      const verified = Boolean(user.emailVerified);
      setRegistrationPending(true);
      return { success: true, verified };
    } finally {
      setAuthLoading(false);
    }
  }

  async function signup(name, email, password, address, dateOfBirth) {
    setAuthLoading(true);
    try {
      await assertEmailAvailableForMemberRegistration(email);
      const user = await signInAndLoad(email, password);
      if (!user.emailVerified) {
        await signOut(auth);
        throw new Error("Please verify your email before completing registration.");
      }

      // Read the temporary uid document before creating the member profile.
      const tmpMember = await FirestoreFunc.filterSingle("TempUser", [{ field: "email", operator: "==", value: email }]);
      const uid = tmpMember[0].uid;
      await createUserProfile({
        name,
        email,
        password,
        address,
        dateOfBirth,
        uid,
      });
      clearRegistrationPending();
      await signOut(auth);

      // Remove the temporary uid document after registration is complete.
      await FirestoreFunc.remove("TempUser", tmpMember[0].id)

      return { success: true };
    } finally {
      setAuthLoading(false);
    }
  }

  const discardPendingRegistration = useCallback(async () => {
    if (auth.currentUser) {
      await signOut(auth);
    }
    clearRegistrationPending();
    resetSession();
  }, [clearRegistrationPending, resetSession]);

  async function login(email, password, expectedRole = "") {
    setAuthLoading(true);
    try {
      const user = await signInAndLoad(email, password);
      const context = normalizeSessionContext(
        await getUserContextOnLogin(email, email.split("@")[0] || "Member"),
      );

      if (context.role === "Member" && !user.emailVerified) {
        await signOut(auth);
        throw new Error("Please verify your email before signing in.");
      }
      if (!canUseAccountStatus(context.role, context.status)) {
        await signOut(auth);
        throw new Error("This account has been suspended or deactivated by an administrator.");
      }
      if (expectedRole && context.role !== expectedRole) {
        await signOut(auth);
        throw new Error(`Selected identity does not match this account. Please sign in as ${context.role}.`);
      }
      setSessionRole(context.role);
      setSessionProfile(context.profile);
      return context;
    } 
    finally {
      setAuthLoading(false);
    }
  }

  async function loginWithGoogle() {
    setAuthLoading(true);
    try {
      const credential = await signInWithPopup(auth, googleProvider);
      
      // Keep the Firebase uid so a new Google member can be created in Firestore.
      const uid = credential.user.uid;     

      const context = normalizeSessionContext(
        await getUserContextOnLogin(
          credential.user.email || "member@example.com",
          credential.user.displayName || "Google User",
        ),
      );
      if (!canUseAccountStatus(context.role, context.status)) {
        await signOut(auth);
        throw new Error("This account has been suspended or deactivated by an administrator.");
      }
      
      const tmpMember = await FirestoreFunc.filterSingle("member", [{ field: "email", operator: "==", value: credential.user.email }]);
      console.log(tmpMember)
      if (!tmpMember || tmpMember.length == 0)
      {
        const name = context.profile.name;
        const email = context.profile.email;
        const password = "";
        const address = "";
        const dateOfBirth = "2026-01-01";
        await createUserProfile({
          name,
          email,
          password,
          address,
          dateOfBirth,
          uid,
      });
      }


      setSessionRole(context.role);
      setSessionProfile(context.profile);
      return context;
    } finally {
      setAuthLoading(false);
    }
  }

  const logout = useCallback(async () => {
    clearRegistrationPending();
    resetSession();
    await signOut(auth);
  }, [clearRegistrationPending, resetSession]);

  // Load real data when this part opens or changes.
  useEffect(() => {
    const unsubscribe = onAuthStateChanged(auth, async (user) => {
      setCurrentUser(user);
      if (!user?.email) {
        clearRegistrationPending();
        resetSession();
        setAuthReady(true);
        return;
      }

      try {
        const context = normalizeSessionContext(await getUserContext(user.email, user.displayName || "Member"));
        const requiresVerifiedEmail = context.role === "Member";
        if (requiresVerifiedEmail && !user.emailVerified) {
          clearRegistrationPending();
          resetSession();
          await signOut(auth);
          setCurrentUser(null);
        } else if (!canUseAccountStatus(context.role, context.status)) {
          clearRegistrationPending();
          resetSession();
          await signOut(auth);
          setCurrentUser(null);
        } else {
          clearRegistrationPending();
          setSessionRole(context.role);
          setSessionProfile(context.profile);
        }
      } catch (error) {
        console.error("Unable to resolve the signed-in user context:", error);
        clearRegistrationPending();
        resetSession();
      }
      setAuthReady(true);
    });

    return unsubscribe;
  }, [clearRegistrationPending, resetSession]);

  const isAuthenticated = Boolean(currentUser && sessionProfile && !registrationPending);

  const value = useMemo(
    () => ({
      currentUser,
      authReady,
      isAuthenticated,
      sessionRole,
      sessionProfile,
      registrationPending,
      loading: authLoading,
      beginEmailVerification,
      resendRegistrationVerification,
      checkRegistrationVerification,
      discardPendingRegistration,
      signup,
      login,
      loginWithGoogle,
      logout,
    }),
    [
      currentUser,
      authReady,
      isAuthenticated,
      sessionRole,
      sessionProfile,
      registrationPending,
      authLoading,
      discardPendingRegistration,
      logout,
    ],
  );

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}
