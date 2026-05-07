// This file has old small Firestore helper functions.
import { db } from './FirebaseConfig'

// Firebase collection helpers.
import { collection } from 'firebase/firestore'
// Read many documents.
import { getDocs } from 'firebase/firestore'
// Add a new document.
import { addDoc, serverTimestamp } from 'firebase/firestore'
// Delete a document.
import { doc, deleteDoc } from 'firebase/firestore'
// Update a document.
import { runTransaction, updateDoc } from 'firebase/firestore'
// Build simple queries.
import { orderBy, query, where } from 'firebase/firestore'
import { FB_SCHEMAS } from './DatabaseScheme'

const FirestoreFunc = {

  // Create one document in a collection.
  create: async (collectionName, data) => {
    try {
      const docRef = await addDoc(collection(db, collectionName), {
        ...data,
        createdAt: serverTimestamp()
      });

      return { success: true, id: docRef.id };
    } catch (error) {
      console.error(`Error adding to ${collectionName}:`, error);
      throw error;
    }
  },

  // Read documents with optional filters and sorting.
  filter: async (collectionName, filters = [], sortField = 'createdAt', sortOrder = 'desc') => {
    try {
      const colRef = collection(db, collectionName);
      let constraints = [];

      // Add where rules from the page.
      if (filters.length > 0) {
        constraints = filters.map(f => where(f.field, f.operator, f.value));
      }

      // Sort the result list.
      constraints.push(orderBy(sortField, sortOrder));

      const q = query(colRef, ...constraints);
      const querySnapshot = await getDocs(q);

      return querySnapshot.docs.map(doc => ({
        id: doc.id,
        ...doc.data()
      }));
    } catch (error) {
      console.error(`Error filtering ${collectionName}:`, error);
      throw error;
    }
  },

  // Find documents with filters but without sorting.
  filterSingle: async (collectionName, filters = []) => {
    try {
      const colRef = collection(db, collectionName);
      let constraints = [];

      // Add where rules from the page.
      if (filters.length > 0) {
        constraints = filters.map(f => where(f.field, f.operator, f.value));
      }

      const q = query(colRef, ...constraints);
      const querySnapshot = await getDocs(q);

      return querySnapshot.docs.map(doc => ({
        id: doc.id,
        ...doc.data()
      }));
    } catch (error) {
      console.error(`Error filtering ${collectionName}:`, error);
      throw error;
    }
  },

  // Read one document by id.
  queryDocById: async (collectionName, docId) => {
    try {
      const docRef = doc(db, collectionName, docId);
      const docSnap = await getDoc(docRef);

      if (docSnap.exists()) {
        return { id: docSnap.id, ...docSnap.data() };
      } else {
        console.log("No such document!");
        return null;
      }
    } catch (error) {
      console.error(`Error getting document ${docId}:`, error);
      throw error;
    }
  },

  // Update one document by id.
  update: async (collectionName, id, updateData) => {
    try {
      const docRef = doc(db, collectionName, id);
      await updateDoc(docRef, {
        ...updateData,
        updatedAt: serverTimestamp()
      });
      return { success: true };
    } catch (error) {
      console.error(`Error updating ${collectionName}:`, error);
      throw error;
    }
  },

  // Remove one document by id.
  remove: async (collectionName, id) => {
    try {
      await deleteDoc(doc(db, collectionName, id));
      return { success: true };
    } catch (error) {
      console.error(`Error deleting from ${collectionName}:`, error);
      throw error;
    }
  }

};

export default FirestoreFunc;
