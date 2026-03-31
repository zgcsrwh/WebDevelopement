# Guidance of using Firebase based function

provider文件夹下存放调用数据库的一系列功能函数。

其他文件夹下的代码则负责调用，界面互动和简单逻辑处理。

## 0. Definition
核心参数有三个：collection, doc和field，层级依次下降。

**a. collection(集合)**

    定义： 它是文档的容器。集合中只能包含文档，不能直接包含数据字段或其他集合。

    类比： 想象一个名为“Users”的文件夹，里面专门存放所有用户的信息。

    特点： 集合是隐式创建的，只要你向其中添加第一个文档，它就存在了。

**b. doc(文档)**

    定义： 它是 Firebase 中存储数据的最小单位。一个文档本质上是一个 JSON 对象（键值对的集合）。

    类比： 类似于一个用例，这个用例中可以包含很多参数，但是这个用例只属于某一个集合。

    特点： 每个文档都有一个唯一的 ID（当前系统采用自动生成策略）。这个ID类似于键值，但是并不保存在文档下的数据中。

**c. field(字段)**

    定义： 它是存储在文档中的具体数据项，由 Key（键） 和 Value（值） 组成。

    类比： 想象个人信息表上的每一行内容，比如“姓名：张三”、“年龄：25”。

    支持的数据类型： 字符串 (String)、数字 (Number)、布尔值 (Boolean)、数组 (Array)、对象 (Map)、地理点 (GeoPoint) 等。

## 1. FirebaseFunc

FirebaseFunc是一个工具类，其下封装最基本的读/写/修改/删除功能。

### 1.1 创建新文档create

#### **(1) create (collectionName, data)**
    功能描述：在名为collectionName的集合中创建一个新的doc，doc中填入输入data. 

    a. Input:
        collectionName : 集合名称，例如"member", "profile", etc.
        data : 全部需要存储的数据，建议调用DatabaseScheme获取数据结构体，再对结构体内部数据赋值，避免遗漏数据。
    
    b. Return:
        { success: true, id: docRef.id }
        第一个参数始终为true, 第二个参数为创建文档得到的唯一ID。
        
    c. Error:
        若执行有异常create会直接抛异常

    示例：创建profile
        async function createProfile(member_id)
        {
            // Get info structure and set data
            const profileData = FB_SCHEMAS.DB_PROFILE;
            profileData.member_id = member_id;

            // Create new doc by FirestoreFunc
            const {success, id} = await FirestoreFunc.create("profile", profileData);

            // Return value
            return {success, id} ;
        }

#### **(2) filter (collectionName, filters = [], sortField = 'createdAt', sortOrder = 'desc')**
    功能描述：在名为collectionName的集合中筛选出符合filters条件的docs

    a. Input:
        collectionName : 集合名称，例如"member", "profile", etc.
        filters : 筛选条件，可以为空，使用方法见示例。
        sortField ： 排序选择字段，默认为'createdAt'时间
        sortOrder ： 升序('asc')或降序('desc')，默认为降序
    
    b. Return:
        [
            {id1, docData1},
            {id2, docData2},
            ...
            {idn, docDataN},
        ]
        返回的是一个数组，里面包含所有collectionName中符合filters条件的文档，并附带id信息。

    c. Error:
        若执行有异常create会直接抛异常

    示例：筛选request


#### **(3) filterSingle (collectionName, filters = [])**
    功能描述：在名为collectionName的集合中筛选出符合filters条件的一个doc. 功能方法与filter类似。

    a. Input:
        collectionName : 集合名称，例如"member", "profile", etc.
        filters : 筛选条件，可以为空，使用方法见示例。
    
    b. Return:
        [
            {id1, docData1},
        ]
        返回的是仍然是一个数组，但是只有一个元素。里面包含所有collectionName中符合filters条件的文档，并附带id信息。

    c. Error:
        若执行有异常create会直接抛异常

    示例：基于邮箱查找用户
        const memberSnap = await FirestoreFunc.filterSingle("member", [{ field: "email", operator: "==", value: email }]);
        userSnap = memberSnap[0];

#### **(4) queryDocById (collectionName, docId)**
    功能描述：在名为collectionName的集合中筛选ID = docId的文档。

    a. Input:
        collectionName : 集合名称，例如"member", "profile", etc.
        docId : 文档ID。
    
    b. Return:
        { id: docSnap.id, ...docSnap.data() }
        文档ID + 文档中的所有字段数据

    c. Error:
        若执行有异常create会直接抛异常

    示例：基于用户信息中的profile_id去"profile"集合中找到对应的档案信息。


#### **(5) update (collectionName, id, updateData)**
    功能描述：在名为collectionName的集合中找到ID = id的doc，并更新数据updateData。

    a. Input:
        collectionName : 集合名称，例如"member", "profile", etc.
        id : 文档索引键值。
        updateData ：包含N对键值{Key1： Value1，...., KeyN：ValueN}
    
    b. Return:
        { success: true }
        返回成功

    c. Error:
        若执行有异常create会直接抛异常

    示例：修改"member"的status和profile数据，见AuthContext中的login功能
        FirestoreFunc.update("member", userSnap.id, { status: "active" , profile_ID: id });     

#### **(6) remove (collectionName, id)**
    功能描述：在名为collectionName的集合中找到ID = id的doc，并删除该doc
    
    a. Input:
        collectionName : 集合名称，例如"member", "profile", etc.
        id : 文档索引键值。

    b. Return:
        { success: true }
        返回成功

    c. Error:
        若执行有异常create会直接抛异常

    示例：暂无，根据分析只有过期time_slot涉及到删除，尚未实现。

## 2. DatabaseScheme
    这个模块是用来转换数据库设计文档和实际编码的中间文件，减少使用上的负担。也可以考虑跳过这个结构体。

    使用固定结构体的优势体现在:
    
    (1) 执行如创建类型的功能时，不需要手动输入每一个字段，可以直接调用结构体修改;

    (2) 如果某个集合字段的设计发生变更，在更改上的工作量会更小。

    具体使用案例可以参考目前已上传的AuthContext文件中的createProfile功能，