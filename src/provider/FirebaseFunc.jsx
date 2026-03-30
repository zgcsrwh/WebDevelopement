import { db } from './FirebaseConfig'

// Firebase数据库
import { collection} from 'firebase/firestore'
// Firebase数据库-读取数据
import { getDocs} from 'firebase/firestore'
// Firebase数据库-添加数据(加时间戳)
import { addDoc, serverTimestamp} from 'firebase/firestore'
// Firebase数据库-删除数据
import { doc, deleteDoc} from 'firebase/firestore'
// Firebase数据库-同步数据
import { runTransaction,updateDoc} from 'firebase/firestore'
// Firebase数据库-排序+查询+筛选
import { orderBy, query, where } from 'firebase/firestore'
//
import {FB_SCHEMAS} from './DatabaseScheme'

const FirestoreFunc = {
  
  // --- 1. 写入 (Create) ---
  // data 参数应包含该集合固定的多个字段
  create: async (collectionName, data) => {
    try {
      const docRef = await addDoc(collection(db, collectionName), {
        ...data,
        createdAt: serverTimestamp() // 自动补全时间戳
      });
      
      return { success: true, id: docRef.id };
    } catch (error) {
      console.error(`Error adding to ${collectionName}:`, error);
      throw error;
    }
  },

  // --- 2. 筛选查询 (Read/Filter) ---
/**
 * 通用筛选与排序接口
 * @param {string} collectionName 集合名称
 * @param {Array} filters 筛选数组 [{field, operator, value}]
 * @param {string} sortField 排序字段，默认为创建时间
 * @param {string} sortOrder 排序方向: 'desc' (降序/最新) 或 'asc' (升序/最早)
 */
  filter: async (collectionName, filters = [], sortField = 'createdAt', sortOrder = 'desc') => {
    try {
      const colRef = collection(db, collectionName);
      let constraints = [];

      // 1. 构建筛选条件
      if (filters.length > 0) {
        constraints = filters.map(f => where(f.field, f.operator, f.value));
      }

      // 2. 添加排序条件
      // 注意：如果 filters 中包含对非 sortField 字段的范围查询（如 age > 18），
      // Firestore 可能会要求建立复合索引。
      constraints.push(orderBy(sortField, sortOrder));

      // 3. 执行查询
      const q = query(colRef, ...constraints);
      const querySnapshot = await getDocs(q);
      
      return querySnapshot.docs.map(doc => ({
        id: doc.id,
        ...doc.data()
      }));
    } catch (error) {
      console.error(`Error filtering ${collectionName}:`, error);
      // 如果报错信息包含 "The query requires an index"，点击控制台给出的链接即可自动创建索引
      throw error;
    }
  },

  // Find out a single doc from firestore
  filterSingle: async (collectionName, filters = [],) => {
    try {
      const colRef = collection(db, collectionName);
      let constraints = [];

      // 1. 构建筛选条件
      if (filters.length > 0) {
        constraints = filters.map(f => where(f.field, f.operator, f.value));
      }
      // 3. 执行查询
      const q = query(colRef, ...constraints);
      const querySnapshot = await getDocs(q);
      
      return querySnapshot.docs.map(doc => ({
        id: doc.id,
        ...doc.data()
      }));
    } catch (error) {
      console.error(`Error filtering ${collectionName}:`, error);
      // 如果报错信息包含 "The query requires an index"，点击控制台给出的链接即可自动创建索引
      throw error;
    }
  },

  // --- 3. 修改 (Update) ---
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

  // --- 4. 删除 (Delete) ---
  remove: async (collectionName, id) => {
    try {
      await deleteDoc(doc(db, collectionName, id));
      return { success: true };
    } catch (error) {
      console.error(`Error deleting from ${collectionName}:`, error);
      throw error;
    }
  }

  /***********************************************  SupplementFunc ***************************************************************** */

};

export default FirestoreFunc;