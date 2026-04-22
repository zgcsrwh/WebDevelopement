import {
  addDoc,
  collection,
  doc,
  documentId,
  deleteDoc,
  getDoc,
  getDocs,
  limit,
  onSnapshot,
  orderBy,
  query,
  runTransaction,
  serverTimestamp,
  setDoc,
  updateDoc,
  writeBatch,
  where,
} from "firebase/firestore";
import { db } from "../provider/FirebaseConfig";

function getConstraintFieldSegments(constraint) {
  return constraint?._field?._internalPath?.segments || [];
}

function readConstraintValue(constraint) {
  return constraint?._value;
}

function getFieldValue(item, fieldSegments = []) {
  if (!fieldSegments.length) {
    return undefined;
  }

  if (fieldSegments[0] === "__name__") {
    return item.id;
  }

  return fieldSegments.reduce((currentValue, segment) => currentValue?.[segment], item);
}

function compareValues(left, right) {
  if (typeof left === "number" && typeof right === "number") {
    return left - right;
  }

  if (typeof left === "boolean" && typeof right === "boolean") {
    return Number(left) - Number(right);
  }

  return String(left ?? "").localeCompare(String(right ?? ""));
}

function matchesWhereConstraint(item, constraint) {
  const operator = constraint?._op;
  const fieldSegments = getConstraintFieldSegments(constraint);
  const fieldValue = getFieldValue(item, fieldSegments);
  const comparisonValue = readConstraintValue(constraint);

  switch (operator) {
    case "==":
      return fieldValue === comparisonValue;
    case "!=":
      return fieldValue !== comparisonValue;
    case "<":
      return compareValues(fieldValue, comparisonValue) < 0;
    case "<=":
      return compareValues(fieldValue, comparisonValue) <= 0;
    case ">":
      return compareValues(fieldValue, comparisonValue) > 0;
    case ">=":
      return compareValues(fieldValue, comparisonValue) >= 0;
    case "array-contains":
      return Array.isArray(fieldValue) && fieldValue.includes(comparisonValue);
    case "in":
      return Array.isArray(comparisonValue) && comparisonValue.includes(fieldValue);
    case "not-in":
      return Array.isArray(comparisonValue) && !comparisonValue.includes(fieldValue);
    default:
      return true;
  }
}

export function normalizeTimestamp(value) {
  if (!value) return "";
  if (typeof value === "string") return value;
  if (value?.seconds) {
    return new Date(value.seconds * 1000).toISOString().slice(0, 16).replace("T", " ");
  }
  if (value?.toDate) {
    return value.toDate().toISOString().slice(0, 16).replace("T", " ");
  }
  return String(value);
}

export async function getCollectionDocs(collectionName, constraints = []) {
  const ref = collection(db, collectionName);
  const snapshot = constraints.length ? await getDocs(query(ref, ...constraints)) : await getDocs(ref);
  return snapshot.docs.map((item) => ({
    id: item.id,
    ...item.data(),
  }));
}

export async function getFirstByField(collectionName, field, value) {
  const items = await getCollectionDocs(collectionName, [where(field, "==", value), limit(1)]);
  return items[0] || null;
}

export async function addCollectionDoc(collectionName, payload) {
  const ref = await addDoc(collection(db, collectionName), {
    ...payload,
    created_at: payload.created_at || serverTimestamp(),
  });
  return ref.id;
}

export async function updateCollectionDoc(collectionName, docId, payload) {
  await updateDoc(doc(db, collectionName, docId), payload);
}

export async function setCollectionDoc(collectionName, docId, payload, options = { merge: true }) {
  await setDoc(doc(db, collectionName, docId), payload, options);
}

export async function deleteCollectionDoc(collectionName, docId) {
  await deleteDoc(doc(db, collectionName, docId));
}

export async function getDocById(collectionName, docId) {
  const snapshot = await getDoc(doc(db, collectionName, docId));
  if (snapshot.exists()) {
    return { id: snapshot.id, ...snapshot.data() };
  }
  return null;
}

export function getCollectionRef(collectionName) {
  return collection(db, collectionName);
}

export function getDocumentRef(collectionName, docId) {
  return doc(db, collectionName, docId);
}

export function buildCollectionQuery(collectionName, constraints = []) {
  return query(collection(db, collectionName), ...constraints);
}

export function createWriteBatch() {
  return writeBatch(db);
}

export async function runDbTransaction(executor) {
  return runTransaction(db, executor);
}

export function buildDocSnapshot(snapshot) {
  if (!snapshot?.exists()) {
    return null;
  }

  return {
    id: snapshot.id,
    ...snapshot.data(),
  };
}

export function subscribeToCollection(collectionName, constraints = [], onNext, onError) {
  const ref = constraints.length ? query(collection(db, collectionName), ...constraints) : collection(db, collectionName);
  return onSnapshot(
    ref,
    (snapshot) => {
      onNext(
        snapshot.docs.map((item) => ({
          id: item.id,
          ...item.data(),
        })),
        );
      },
      (error) => {
        onError?.(error);
      },
    );
}

export { collection, doc, documentId, limit, onSnapshot, orderBy, query, runTransaction, serverTimestamp, setDoc, where, writeBatch };
