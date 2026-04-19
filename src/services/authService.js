import { doc, serverTimestamp, setDoc } from "firebase/firestore";
import { db } from "../provider/FirebaseConfig";
import { getActorByEmail, setFriendIds } from "./centreService";
import { callBackend } from "./callableService";

export async function registerProfile({ uid, name, email, address, dateOfBirth }) {
  await setDoc(
    doc(db, "member", uid),
    {
      name,
      email,
      address,
      date_of_birth: dateOfBirth || "",
      created_at: serverTimestamp(),
      cancel_times: 0,
      no_show_times: 0,
      profile_ID: "",
      status: "active",
    },
    { merge: true },
  );

  await setFriendIds(uid, []);

  return { success: true };
}

export async function getUserContextFromEmail(email, displayName = "Member") {
  const actor = await getActorByEmail(email).catch(() => null);
  const fallbackProfile = {
    id: "",
    name: displayName,
    email,
    role: "Member",
    status: "active",
  };

  const profile = actor || fallbackProfile;
  const role = actor?.role || "Member";
  const isProfileComplete = Boolean(actor);

  return {
    role,
    status: profile.status || "active",
    profile,
    isProfileComplete,
  };
}

export async function loginWithResolvedContext(email) {
  try {
    return await callBackend("getUserContext", {});
  } catch (error) {
    console.warn("Callable getUserContext failed, falling back to Firestore lookup:", error);
    return getUserContextFromEmail(email, email.split("@")[0]);
  }
}
