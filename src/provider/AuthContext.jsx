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
  getUserContextFromEmail,
  loginWithResolvedContext,
  registerProfile,
} from "../services/authService";

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
  const credential = await signInWithEmailAndPassword(auth, email, password);
  await reload(credential.user);
  return credential.user;
}

export function AuthProvider({ children }) {
  const [currentUser, setCurrentUser] = useState(null);
  const [authReady, setAuthReady] = useState(false);
  const [sessionRole, setSessionRole] = useState("Member");
  const [sessionProfile, setSessionProfile] = useState(null);
  const [authLoading, setAuthLoading] = useState(false);

  const resetSession = useCallback(() => {
    setSessionProfile(null);
    setSessionRole("Member");
  }, []);

  async function beginEmailVerification(email, password) {
    setAuthLoading(true);
    try {
      const credential = await createUserWithEmailAndPassword(auth, email, password);
      await sendEmailVerification(credential.user);
      await signOut(auth);
      return { success: true };
    } finally {
      setAuthLoading(false);
    }
  }

  async function resendRegistrationVerification(email, password) {
    setAuthLoading(true);
    try {
      const user = await signInAndLoad(email, password);
      if (user.emailVerified) {
        await signOut(auth);
        return { success: true, verified: true };
      }
      await sendEmailVerification(user);
      await signOut(auth);
      return { success: true, verified: false };
    } finally {
      setAuthLoading(false);
    }
  }

  async function confirmVerifiedEmail(email, password) {
    setAuthLoading(true);
    try {
      const user = await signInAndLoad(email, password);
      const verified = Boolean(user.emailVerified);
      await signOut(auth);
      if (!verified) {
        throw new Error("Please verify your email before continuing the registration form.");
      }
      return { success: true, verified: true };
    } finally {
      setAuthLoading(false);
    }
  }

  async function checkRegistrationVerification(email, password) {
    setAuthLoading(true);
    try {
      const user = await signInAndLoad(email, password);
      const verified = Boolean(user.emailVerified);
      await signOut(auth);
      return { success: true, verified };
    } finally {
      setAuthLoading(false);
    }
  }

  async function signup(name, email, password, address, dateOfBirth) {
    setAuthLoading(true);
    try {
      const user = await signInAndLoad(email, password);
      if (!user.emailVerified) {
        await signOut(auth);
        throw new Error("Please verify your email before completing registration.");
      }
      await registerProfile({
        uid: user.uid,
        name,
        email,
        address,
        dateOfBirth,
      });
      await signOut(auth);
      return { success: true };
    } finally {
      setAuthLoading(false);
    }
  }

  async function login(email, password, expectedRole = "") {
    setAuthLoading(true);
    try {
      const user = await signInAndLoad(email, password);
      const context = await loginWithResolvedContext(email);
      if ((context.role === "Member" || !context.isProfileComplete) && !user.emailVerified) {
        await signOut(auth);
        throw new Error("Please verify your email before signing in.");
      }
      if (!context.isProfileComplete) {
        await signOut(auth);
        throw new Error("Please complete your registration details before signing in.");
      }
      if (String(context.status || "").toLowerCase() !== "active") {
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
    } finally {
      setAuthLoading(false);
    }
  }

  async function loginWithGoogle() {
    setAuthLoading(true);
    try {
      const credential = await signInWithPopup(auth, googleProvider);
      const context = await getUserContextFromEmail(
        credential.user.email || "member@example.com",
        credential.user.displayName || "Google User",
      );
      if (!context.isProfileComplete) {
        await signOut(auth);
        throw new Error("Please complete your registration details before signing in.");
      }
      if (String(context.status || "").toLowerCase() !== "active") {
        await signOut(auth);
        throw new Error("This account has been suspended or deactivated by an administrator.");
      }
      setSessionRole(context.role);
      setSessionProfile(context.profile);
      return context;
    } finally {
      setAuthLoading(false);
    }
  }

  const logout = useCallback(async () => {
    resetSession();
    await signOut(auth);
  }, [resetSession]);

  useEffect(() => {
    const unsubscribe = onAuthStateChanged(auth, async (user) => {
      setCurrentUser(user);
      if (!user?.email) {
        resetSession();
        setAuthReady(true);
        return;
      }

      try {
        const context = await getUserContextFromEmail(user.email, user.displayName || "Member");
        const requiresVerifiedEmail = context.role === "Member" || !context.isProfileComplete;
        if ((requiresVerifiedEmail && !user.emailVerified) || !context.isProfileComplete) {
          resetSession();
          await signOut(auth);
          setCurrentUser(null);
        } else if (String(context.status || "").toLowerCase() !== "active") {
          resetSession();
          await signOut(auth);
          setCurrentUser(null);
        } else {
          setSessionRole(context.role);
          setSessionProfile(context.profile);
        }
      } catch (error) {
        console.error("Unable to resolve the signed-in user context:", error);
        resetSession();
      }
      setAuthReady(true);
    });

    return unsubscribe;
  }, [resetSession]);

  const value = useMemo(
    () => ({
      currentUser,
      authReady,
      sessionRole,
      sessionProfile,
      loading: authLoading,
      beginEmailVerification,
      resendRegistrationVerification,
      confirmVerifiedEmail,
      checkRegistrationVerification,
      signup,
      login,
      loginWithGoogle,
      logout,
    }),
    [currentUser, authReady, sessionRole, sessionProfile, authLoading, logout],
  );

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}
