# Build the testing database

This tool provides a method that authorized developer could manully generate a fixed database(apart from time and generated id). 

The firebase config is stored in serviceAccountKey.json. Warning : the whole database will be opened to anyone who access the Key, do not spread or leak the Key file and do not store any critical information to the Firestore. 

## How to use the tool
(1) Open the shell in FirestoreDataManager folder path, run 'npm install'

(2) To reset the whole database as well as the authentication records, run 'node resetProjectDatabase'.

(3) If you want to remain some information, please change the code in resetProjectDatabase.js or write a new public function. The sub functions will be explained in the following. 

## Explanation of the Tool
### 1. BaseData files
The BasicData folder stores the collection that requires pre-setting information, the collections are shown below. 

    1_People : {member, admin_staff}

    2_Facility : {facility}

    3_Request : {matching, repair, request}

    4_Other : {profile}

And some collections are going to be generated during the process, which are {friends, notification, time_slot}.

It is allowed to add, delete or change any information you want, but do not change the segment name or structure. 

Another important thing is that the number of member should be exactly same as the number of profile. 

### 2. Function file
All the functions are writen in resetDatabase.js, and the main function is 'resetProjectDatabase'.

The reset process mainly divided to four parts.

(1) Clear the original dataset

    All the original information will be deleted, which is realized by calling 'deleteCollection'. 

(2) Set the basic data

    By calling 'resetAndImportAll("TargetFolder")', the TargetFolder inside the BasicData will be scaned and copied to Firestore. 

(3) Mapping the relative collections

    Some information in the BasicData like XXX_id remains empty, these infomations are going to be filled in this process. 

    a. For each doc in "facility" collection, pick a staff from "admin_staff" collection and fill in the 'staff_id' segment: 

        Function ：assignStaffToFacilities();

    b. Link a doc in "member" to a doc in "profile"

        Function ：assignMemberToProfile();

    c. For each doc in "request" and "repair" collection, pick a staff from "admin_staff" collection and fill in it's 'staff_id' segment:    

        Function ：populateRequestCollections("request");

        Function ：populateRequestCollections("repair");

    d. Randomly pick some docs in the "member" collection to fill in "matching" collection's 'sender_id' and 'reciever_id' segments.    

        Function ：randomizeMatchingIds();

        
(4) Generate information. 

    a. Generate "friends" collection, each 'member' doc has a corresponding 'friends' doc. Then scan the "matching" collction to find out those 'status === "accepted"' docs, and setting the member ids into "friends" collection. 

        Function ：createFriendsCollection();

        Function ：syncFriendships();

    b. Generate "notification" collection. 

        The notification information is designed to be standard notes. By scanning the "request" and "repair" collections, and then generate notification autonomously according to the status. Warning : It does not support historical information generation temporally.  

        Function generateNotification();

    c. Generate "time_slot" collection. For each doc in "facility" collection, generate time slots for 7 future days based on the "start_time" and "end_time", with a duration od 1 hour. Then scanning the "request" collection to find out if some time_slot has been booked and change the status. 

        Function ：generateTimeSlots();

(5) Authentication. 

    The clear process can be realized but banned because it is unable to direactly follow by creation process. tHE creation process scanns the "member" and "admin_staff" collections to generate authentication information. In addition, all the password is set as "123456" and the email_verification is set as true.. 



