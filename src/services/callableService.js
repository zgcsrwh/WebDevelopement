import { httpsCallable } from "firebase/functions";
import { functions } from "../provider/FirebaseConfig";

export async function callBackend(functionName, payload = {}) {
  const callable = httpsCallable(functions, functionName);
  const result = await callable(payload);
  return result.data;
}
