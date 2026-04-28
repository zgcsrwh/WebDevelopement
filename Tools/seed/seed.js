import admin from 'firebase-admin';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

// 2. ES Module 中没有 __dirname，需要手动定义
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

/**
 * 关键点 1：配置环境连接到模拟器
 * 必须在 admin.initializeApp() 之前设置
 */
process.env.FIRESTORE_EMULATOR_HOST = '127.0.0.1:8080';
process.env.FIREBASE_AUTH_EMULATOR_HOST = '127.0.0.1:9099';

// 初始化：只需 Project ID，不需要 serviceAccount
admin.initializeApp({
  projectId: 'learnfire-e5720' // 必须与你启动模拟器时的项目 ID 一致
});

const db = admin.firestore();
const auth = admin.auth();

async function seed() {
  try {
  // Get the collections in firestore
  console.log('Begin Resetting the firestore...');
  console.log(`-----------------------------------------------`);
  const collections = await db.listCollections();
  const collectionNames = collections.map(col => col.id);
  
  // Clear all the original collections
  console.log(`Start cleaning the original collections`);
  for (const collectionName of collectionNames) {
    await deleteCollection(collectionName, 100);
    console.log(`Firestore Cleared: ${collectionName}`);
  }
  console.log(`-----------------------------------------------`);


  // Setting the basic collection information
  await resetAndImportAll("1_People");
  await resetAndImportAll("2_Facility");
  await resetAndImportAll("3_Request");
  await resetAndImportAll("4_Other");

  // Connecting the mapping id and generate supplementray information
  // Warning : Do not change the sequence
  await assignStaffToFacilities();
  await assignMemberToProfile();
  await populateRequestCollections("request");
  await populateRequestCollections("repair");
  await randomizeMatchingIds();
 
  // Generate supplementary information
  await createFriendsCollection();
  await syncFriendships();
  await generateNotification();
  await generateTimeSlots();
  await syncRequestsToTimeSlots();

  // Clear and generate authenticartion information
  await syncUsersToAuth();

    console.log('Data import successfully');
    process.exit(0);
  } catch (error) {
    console.error('Import fail:', error);
    process.exit(1);
  }
}


// 给场馆分配员工ID
async function assignStaffToFacilities() {
  try {
    // 1. 获取所有 role == "staff" 的员工 ID
    const staffSnapshot = await db.collection('admin_staff')
      .where('role', '==', 'staff')
      .get();

    if (staffSnapshot.empty) {
      console.log('未找到任何角色为 staff 的员工。');
      return;
    }

    const staffIds = staffSnapshot.docs.map(doc => doc.id);
    console.log(`获取到 ${staffIds.length} 名员工。`);

    // 2. 获取所有场馆 (facility)
    const facilitySnapshot = await db.collection('facility').get();

    if (facilitySnapshot.empty) {
      console.log('场馆集合为空，无需分配。');
      return;
    }

    // 3. 开始批量更新 (使用 WriteBatch 性能更高)
    const batch = db.batch();
    
    facilitySnapshot.docs.forEach((doc, index) => {
      // 使用取模运算 (%) 实现循环分配
      // 例如：如果有 3 个员工，5 个场馆，分配索引为 0, 1, 2, 0, 1
      const assignedStaffId = staffIds[index % staffIds.length];
      
      const facilityRef = db.collection('facility').doc(doc.id);
      batch.update(facilityRef, { staff_id: assignedStaffId });
      
      //console.log(`场馆 [${doc.id}] 已分配给员工 [${assignedStaffId}]`);
    });

    // 4. 提交批量操作
    await batch.commit();
    console.log('Success : update facility : staff_id');

  } catch (error) {
    console.error('Error :', err);
  }
}

// 给profile分配member_id, 要求二者数量一致(通过json手动控制)
async function assignMemberToProfile() {
  try {
    // 1. 获取所有member ID
    const memberSnapshot = await db.collection('member').get();

    if (memberSnapshot.empty) {
      console.log('未找到member信息。');
      return;
    }

    // 2. 获取所有profile ID
    const profileSnapshot = await db.collection('profile').get();

    if (profileSnapshot.empty) {
      console.log('未找到profile信息。');
      return;
    }

    if(memberSnapshot.size != profileSnapshot.size)
    {
      console.log('member和profile数量不一致');
      return;
    }

    // 3. 开始批量更新 (使用 WriteBatch 性能更高)
    const batch = db.batch();

    const memberDocs = memberSnapshot.docs;
    const profileDocs = profileSnapshot.docs;
    
    profileDocs.forEach((profileDoc, index) => {
      const memberDoc = memberDocs[index];

      const profileRef = db.collection('profile').doc(profileDoc.id);
      const memberRef = db.collection('member').doc(memberDoc.id);

      // 在 profile 中记录所属的 member_id
      batch.update(profileRef, { member_id: memberDoc.id });

      // 在 member 中记录所属的 profile_id
      batch.update(memberRef, { profile_ID: profileDoc.id });

    });

    // 4. 提交批量操作
    await batch.commit();
    console.log('Success : update profile : member_id');

  } catch (error) {
    console.error('Error :', error);
  }
}

// 给request分配member, facility, 和staff
async function populateRequestCollections(CollectionName) {
  try {
    console.log('开始同步',CollectionName, '集合字段...');

    // 1. 获取所有 member ID
    const memberSnapshot = await db.collection('member').get();
    const memberIds = memberSnapshot.docs.map(doc => doc.id);

    // 2. 获取所有 facility 数据（包含其内部的 staff_id）
    const facilitySnapshot = await db.collection('facility').get();
    const facilities = facilitySnapshot.docs.map(doc => ({
      id: doc.id,
      staff_id: doc.data().staff_id // 获取场馆预设的负责人ID
    }));

    if (memberIds.length === 0 || facilities.length === 0) {
      console.error('错误：member 或 facility 集合为空，无法分配。');
      return;
    }

    // 3. 获取所有待补全的 CollectionName
    const requestSnapshot = await db.collection(CollectionName).get();
    
    const batch = db.batch();
    let count = 0;

    requestSnapshot.docs.forEach((doc, index) => {
      // 策略：循环分配，模拟不同人申请不同场地
      const randomMemberId = memberIds[index % memberIds.length];
      const targetFacility = facilities[index % facilities.length];

      const requestRef = db.collection(CollectionName).doc(doc.id);
      
      batch.update(requestRef, {
        member_id: randomMemberId,
        facility_id: targetFacility.id,
        staff_id: targetFacility.staff_id || "" // 自动关联该场馆的负责人
      });

      count++;
    });

    // 4. 提交批量更新
    if (count > 0) {
      await batch.commit();
      console.log(`成功更新 ${count} 条申请记录！`);
    } else {
      console.log('没有发现需要更新的文档。');
    }

  } catch (error) {
    console.error('更新过程中出错:', error);
  }
}

// 向matching中填写sender_id和reciever_id
async function randomizeMatchingIds() {
  try {
    console.log('开始随机分配好友申请的发送者和接收者...');

    // 1. 获取所有 member ID
    const memberSnapshot = await db.collection('member').get();
    const memberIds = memberSnapshot.docs.map(doc => doc.id);

    if (memberIds.length < 2) {
      console.error('错误：成员数量不足 2 人，无法建立好友申请。');
      return;
    }

    // 2. 获取所有待处理的 matching 记录
    const matchingSnapshot = await db.collection('matching').get();
    
    const batch = db.batch();
    let count = 0;

    matchingSnapshot.docs.forEach((doc) => {
      // 3. 随机逻辑：从数组中随机抽取两个不同的 ID
      let senderIdx = Math.floor(Math.random() * memberIds.length);
      let recieverIdx = Math.floor(Math.random() * memberIds.length);

      // 确保发送者和接收者不是同一个人
      while (recieverIdx === senderIdx) {
        recieverIdx = Math.floor(Math.random() * memberIds.length);
      }

      const senderId = memberIds[senderIdx];
      const recieverId = memberIds[recieverIdx];

      // 4. 更新匹配记录
      const matchingRef = db.collection('matching').doc(doc.id);
      batch.update(matchingRef, {
        sender_id: senderId,
        reciever_id: recieverId
      });

      count++;
    });

    // 5. 提交批量更新
    if (count > 0) {
      await batch.commit();
      console.log(`成功为 ${count} 条匹配记录随机分配了 ID！`);
    }

  } catch (error) {
    console.error('随机分配过程中出错:', error);
  }
}

// 为每个member简历一个friends关联表
async function createFriendsCollection() {
  try {
    console.log('开始为所有成员初始化好友表...');

    // 1. 获取所有 member
    const memberSnapshot = await db.collection('member').get();

    if (memberSnapshot.empty) {
      console.log('未发现成员数据。');
      return;
    }

    const batch = db.batch();
    let count = 0;

    memberSnapshot.docs.forEach((doc) => {
      const memberId = doc.id;
      
      // 2. 在 friends 集合中创建一个新文档
      // 建议：使用与 member 相同的 ID 作为 friends 文档的 ID，方便后续查询
      const friendRef = db.collection('friends').doc(memberId);
      
      batch.set(friendRef, {
        member_id: memberId,
        friends_ids: [] // 初始化为空数组 (Array[String])
      });

      count++;

    });

    // 3. 提交所有更改
    await batch.commit();
    console.log(`成功！已为 ${count} 个成员创建了好友关联表。`);

  } catch (error) {
    console.error('初始化失败:', error);
  }
}
async function syncFriendships() {
  console.log('正在监听 matching 集合的状态变更...');

  try {
    // 1. 获取所有状态为 'accepted' 的匹配记录
    const matchingSnapshot = await db.collection('matching')
      .where('status', '==', 'accepted')
      .get();

    if (matchingSnapshot.empty) {
      console.log('没有发现已接受(accepted)的好友请求。');
      return;
    }

    const batch = db.batch();
    let updateCount = 0;

    for (const doc of matchingSnapshot.docs) {
      const data = doc.data();
      const senderId = data.sender_id;
      const recieverId = data.reciever_id;

      if (!senderId || !recieverId) continue;

      // 2. 获取双向的 friends 文档引用
      // 假设 friends 集合的文档 ID 与 member_id 一致
      const senderFriendRef = db.collection('friends').doc(senderId);
      const recieverFriendRef = db.collection('friends').doc(recieverId);

      // 3. 使用 arrayUnion 原子操作添加好友 ID
      // 这样可以避免重复添加，且不需要先读取数组内容
      batch.update(senderFriendRef, {
        friends_ids: admin.firestore.FieldValue.arrayUnion(recieverId)
      });

      batch.update(recieverFriendRef, {
        friends_ids: admin.firestore.FieldValue.arrayUnion(senderId)
      });

      updateCount++;
    }

    // 4. 提交批量更新
    await batch.commit();
    console.log(`同步完成！已处理 ${updateCount} 对双向好友关系。`);

  } catch (error) {
    console.error('同步好友关系时出错:', error);
  }
}

async function generateNotification() {
  try {
    console.log('开始根据当前状态生成个性化通知...');

    const batch = db.batch();
    let notificationCount = 0;

    // 1. 定义 Request 状态对应的消息模板
    const requestMessages = {
      "pending": "Your facility request has been uploaded and is waiting to be checked.",
      "accepted": "Your facility request has been accepted.",
      "rejected": "Sorry, your facility request has been rejected. Please check the staff response for details.",
      "alternative_suggested": "An alternative time has been suggested for your booking. Please review it.",
      "upcoming": "Get ready! Your booking is confirmed and upcoming soon.",
      "completed": "Your session has ended. We hope you enjoyed the facility!",
      "cancelled": "Your facility request has been successfully cancelled."
    };

    // 2. 定义 Repair 状态对应的消息模板
    const repairMessages = {
      "pending": "Your repair report is received. Our maintenance team will look into it shortly.",
      "resolved": "Great news! The issue you reported has been resolved. Thanks for your patience."
    };

    
    // 3. 处理 Request 集合
    const requestSnapshot = await db.collection('request').get();
    requestSnapshot.docs.forEach(doc => {
      const data = doc.data();
      if (data.member_id && requestMessages[data.status]) {
        const notifyRef = db.collection('notification').doc();
        batch.set(notifyRef, {
          member_id: data.member_id,
          message: requestMessages[data.status],
          status_context: data.status,
          type: "facility_request",
          created_at: new Date()
        });
        notificationCount++;
      }
    });
    
    // 4. 处理 Repair 集合
    const repairSnapshot = await db.collection('repair').get();
    repairSnapshot.docs.forEach(doc => {
      const data = doc.data();
      if (data.member_id && repairMessages[data.status]) {
        const notifyRef = db.collection('notification').doc();
        batch.set(notifyRef, {
          member_id: data.member_id,
          message: repairMessages[data.status],
          status_context: data.status,
          type: "repair_report",
          created_at: new Date()
        });
        notificationCount++;
      }
    });
    
    // 5. 提交更新
    if (notificationCount > 0) {
      await batch.commit();
      console.log(`成功！已根据当前状态生成 ${notificationCount} 条通知。`);
    }

  } catch (error) {
    console.error('生成通知失败:', error);
  }
}

async function syncUsersToAuth() {
  console.log('开始同步 Firestore 用户到 Firebase Authentication...');

  try {
    // 1. 定义要读取的集合
    const collections = ['member', 'admin_staff'];
    const usersToImport = [];

    for (const colName of collections) {
      const snapshot = await db.collection(colName).get();

      snapshot.docs.forEach(doc => {
        const data = doc.data();
        if (data.email) {
          usersToImport.push({
            uid: doc.id, // 使用 Firestore 的文档 ID 作为 Auth UID，保持一致性
            email: data.email,
            emailVerified: true, // 标记为已验证
            password: '123456',  // 统一初始密码
            displayName: data.name
          });
        }
      });
    }

    usersToImport.push({
      uid: "TEST0001", // 使用 Firestore 的文档 ID 作为 Auth UID，保持一致性
      email: "nonverify@test.com",
      emailVerified: false, // 标记为已验证
      password: '123456',  // 统一初始密码
      displayName: "NonVerify"
    });

    if (usersToImport.length === 0) {
      console.log('没有找到有效的邮箱信息。');
      return;
    }

    console.log("success");
    for (const user of usersToImport) {
      try {
        await auth.createUser(user);
        console.log(`成功创建用户: ${user.email}`);
      } catch (err) {
        if (err.code === 'auth/email-already-exists') {
          console.log(`跳过已存在的邮箱: ${user.email}`);
        } else {
          console.error(`创建 ${user.email} 失败:`, err.message);
        }
      }
    }
    
    console.log('--- 同步完成 ---');
  } catch (error) {
    console.error('同步过程中出现致命错误:', error);
  }
}

async function generateTimeSlots() {
  try {
    console.log('开始生成未来 7 天的时间段...');

    const facilitySnapshot = await db.collection('facility').get();
    if (facilitySnapshot.empty) return;

    // 1. 初始化第一个 batch
    let batch = db.batch(); 
    let slotCount = 0;

    const dates = [];
    for (let i = 0; i < 7; i++) {
      const d = new Date();
      d.setDate(d.getDate() + i);
      dates.push(d.toISOString().split('T')[0]);
    }

    for (const facilityDoc of facilitySnapshot.docs) {
      const facility = facilityDoc.data();
      const facilityId = facilityDoc.id;
      
      const openHour = parseInt(facility.start_time);
      const closeHour = parseInt(facility.end_time);
      for (const date of dates) {
        for (let hour = openHour; hour < closeHour; hour++) {
          const slotRef = db.collection('time_slot').doc();
          
          batch.set(slotRef, {
            facility_id: facilityId,
            date: date,
            start_time: hour.toString(),
            end_time: (hour + 1).toString(),
            status: "open",
            request_id: ""
          });

          slotCount++;

          if (slotCount % 500 === 0) {
            await batch.commit();
            console.log(`Commit time slot ${slotCount} ...`);
            batch = db.batch(); //
          }
        }
      }
    }

    if (slotCount % 500 !== 0) {
      await batch.commit();
    }
    
    console.log(`Generating time slot : ${slotCount} 。`);

  } catch (error) {
    console.error('Error:', error);
  }
}


async function syncRequestsToTimeSlots() {
  try {
    console.log('开始同步申请记录到时间槽 (支持跨时段匹配)...');

    const requestSnapshot = await db.collection('request').get();
    if (requestSnapshot.empty) return;

    let batch = db.batch();
    let updateCount = 0;

    for (const requestDoc of requestSnapshot.docs) {
      const requestData = requestDoc.data();
      if (!requestData) continue;

      const { facility_id, date, start_time, end_time } = requestData;
      
      // 将申请时间转为数字进行比较
      const reqStart = parseInt(start_time);
      const reqEnd = parseInt(end_time);

      // 1. 获取该场馆在该日期的所有时间槽
      // 获取 Request 的日期（假设存的是原生 Timestamp）
      const reqDate = requestData.date; 

      // 查询时
      const slotsSnapshot = await db.collection('time_slot')
        .where('facility_id', '==', facility_id)
        .where('date', '==', reqDate) // 匹配一整天
        .get();

      if (!slotsSnapshot.empty) {
        for (const slotDoc of slotsSnapshot.docs) {
          const slotData = slotDoc.data();
          const slotStart = parseInt(slotData.start_time);
          const slotEnd = parseInt(slotData.end_time);

          // 2. 核心逻辑：判断包含关系
          // 条件：TimeSlot 在 Request 的时间范围内
          if (slotStart >= reqStart && slotEnd <= reqEnd) {
            const slotRef = db.collection('time_slot').doc(slotDoc.id);
            
            batch.update(slotRef, {
              status: "locked",
              request_id: requestDoc.id,
            });

            updateCount++;

            // 每 500 次操作提交一次并重置 batch
            if (updateCount % 500 === 0) {
              await batch.commit();
              batch = db.batch();
            }
          }
        }
      }
    }

    // 3. 提交剩余更新
    if (updateCount % 500 !== 0) {
      await batch.commit();
    }

  } catch (error) {
    console.error('❌ 同步失败:', error);
  }
}

/**
 * 递归删除集合中的所有文档 (Firestore 限制一次删除最多 500 条)
 */

async function resetAndImportAll(Subfolder) {
  console.log('Start Setting Firestore...');

  const dataDir = path.join(__dirname, 'BasicData/',Subfolder);
  
  try {
    // 1. 读取 data 文件夹下所有文件
    const files = fs.readdirSync(dataDir).filter(file => file.endsWith('.json'));
    
    if (files.length === 0) {
      console.log('No data file');
      return;
    }

    for (const file of files) {

      // 2. 以文件名（去除 .json）作为集合名称
      const collectionName = path.parse(file).name;
      const filePath = path.join(dataDir, file);
      
      // 3. 读取并解析 JSON 内容
      const rawData = fs.readFileSync(filePath, 'utf8');
      const items = JSON.parse(rawData);

      // 5. 批量写入新数据
      const batch = db.batch();
      items.forEach((item) => {

        // 如果 JSON 中没提供 id，则自动生成
        const docId = item.id || db.collection(collectionName).doc().id;
        const docRef = db.collection(collectionName).doc(docId);
        
        const processedData = {};
  
        // 遍历所有 key，自动发现需要转换的类型
        Object.keys(item).forEach(key => {
        const val = item[key];
        if (val && typeof val === 'object' && val._type === 'timestamp') {
          processedData[key] = new Date(val.value);
        } else {
          processedData[key] = val;
        }
        });

        batch.set(docRef, {
          ...processedData
        });
      });

      await batch.commit();
    }
    console.log(`Finished Setting Firestore`);
  } catch (err) {
    console.error('Error :', err);
  } 
}


async function deleteCollection(collectionPath, batchSize) {
  const collectionRef = db.collection(collectionPath);
  const query = collectionRef.orderBy('__name__').limit(batchSize);

  return new Promise((resolve, reject) => {
    deleteQueryBatch(query, resolve).catch(reject);
  });
}

async function deleteQueryBatch(query, resolve) {
  const snapshot = await query.get();

  const batchSize = snapshot.size;
  if (batchSize === 0) {
    resolve();
    return;
  }

  const batch = db.batch();
  snapshot.docs.forEach((doc) => {
    batch.delete(doc.ref);
  });
  await batch.commit();

  process.nextTick(() => {
    deleteQueryBatch(query, resolve);
  });
}

seed();