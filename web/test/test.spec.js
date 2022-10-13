/**
 * Copyright 2022 Google LLC
 *
 * Licensed under the Apache License, Version 2.0 (the "License");
 * you may not use this file except in compliance with the License.
 * You may obtain a copy of the License at
 *
 *   http://www.apache.org/licenses/LICENSE-2.0
 *
 * Unless required by applicable law or agreed to in writing, software
 * distributed under the License is distributed on an "AS IS" BASIS,
 * WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
 * See the License for the specific language governing permissions and
 * limitations under the License.
 */
const { readFileSync } = require('fs');
const { join } = require('path');

const testing = require('@firebase/rules-unit-testing');
const { initializeTestEnvironment, RulesTestEnvironment, assertFails, assertSucceeds } = testing;

const { doc, getDoc, setDoc, deleteDoc, setLogLevel } = require('firebase/firestore');
const { ref, deleteObject, uploadBytes } = require('firebase/storage');

/** @type testing.RulesTestEnvironment */
let testEnv;

before(async () => {
  // Silence expected rules rejections from Firestore SDK. Unexpected rejections
  // will still bubble up and will be thrown as an error (failing the tests).
  setLogLevel('error');

  testEnv = await initializeTestEnvironment({
    firestore: { rules: readFileSync(join(__dirname, '../firestore.rules'), 'utf8') },
    storage: { rules: readFileSync(join(__dirname, '../storage.rules'), 'utf8') },
  });

});

after(async () => {
  // Delete all the FirebaseApp instances created during testing.
  // Note: this does not affect or clear any data.
  await testEnv.cleanup();
});

beforeEach(async () => {
  await testEnv.clearFirestore();
  // await testEnv.clearStorage();
});


describe("Our demo friendly chat app", () => {
  it('should not let unauthenticated users see the chat rooms', async function () {
    const unauthedDb = testEnv.unauthenticatedContext().firestore();
    await assertFails(getDoc(doc(unauthedDb, 'chatrooms/musicclub')));
  });

  it("should allow ONLY signed in users to create new chat rooms with required `owner` field", async () => {
    const aliceDb = testEnv.authenticatedContext('alice').firestore();
    await assertSucceeds(setDoc(doc(aliceDb, 'chatrooms/musicclub'), {
      owner: "alice",
      name: "Music Club",
    }));

    // Signed in user without the required fields
    await assertFails(setDoc(doc(aliceDb, 'chatrooms/drama'), {
      name: "Drama",
    }));
  });

  it('should allow global admins to remove members from a chat room', async function () {
    // Setup: Create one test chat room with a member (bypassing Security Rules).
    await testEnv.withSecurityRulesDisabled(async (context) => {
      await setDoc(doc(context.firestore(), 'chatrooms/testroom'), { owner: 'alice', name: 'testroom' });
    });
    await testEnv.withSecurityRulesDisabled(async (context) => {
      await setDoc(doc(context.firestore(), 'chatrooms/testroom/members/alice'), { uid: 'alice', email: 'alice@gmail.com' });
      // await setDoc(doc(context.firestore(), 'chatrooms/testroom/admins/user_loc_admin'), { uid: 'user_loc_admin', email: 'locAdmin@gmail.com' });
    });
    const globAdminDb = testEnv.authenticatedContext('globAdmin', { globAdmin: true }).firestore();
    await assertSucceeds(deleteDoc(doc(globAdminDb, 'chatrooms/testroom/members/alice')));
  });

  it('should allow members to upload storage objects under the chat room directory', async function () {
    // Setup: Create one test chat room with a member (bypassing Security Rules).
    await testEnv.withSecurityRulesDisabled(async (context) => {
      await setDoc(doc(context.firestore(), 'chatrooms/testroom'), { owner: 'alice', name: 'testroom' });
    });
    await testEnv.withSecurityRulesDisabled(async (context) => {
      await setDoc(doc(context.firestore(), 'chatrooms/testroom/members/alice'), { uid: 'alice', email: 'alice@gmail.com' });
    });
    const aliceStorage = testEnv.authenticatedContext('alice').storage();
    const guitarRef = ref(aliceStorage, 'chatrooms/testroom/guitar.jpg');
    const bytes = new Uint8Array([0x48, 0x65, 0x6c, 0x6c, 0x6f, 0x2c, 0x20, 0x77, 0x6f, 0x72, 0x6c, 0x64, 0x21]);
    await assertSucceeds(uploadBytes(guitarRef, bytes, { contentType: 'application/octet-stream' }));
  });

  it('should not allow non-members to write storage objects under the chat room directory', async function () {
    // Setup: Create one test chat room with a member (bypassing Security Rules).
    await testEnv.withSecurityRulesDisabled(async (context) => {
      await setDoc(doc(context.firestore(), 'chatrooms/testroom'), { owner: 'alice', name: 'testroom' });
    });
    const aliceStorage = testEnv.authenticatedContext('alice').storage();
    const guitarRef = ref(aliceStorage, 'chatrooms/testroom/guitar.jpg');
    await assertFails(deleteObject(guitarRef));
  });
});

describe("Extra credit tests", () => {

  it('should ONLY allow users to create a room they own', async function () {
    const aliceDb = testEnv.authenticatedContext('alice').firestore();
    await assertSucceeds(setDoc(doc(aliceDb, 'chatrooms/musicclub'), {
      owner: "alice",
      name: "Music Club",
    }));

  });

  it('should not allow room creation by a non-owner', async function () {
    const aliceDb = testEnv.authenticatedContext('alice').firestore();
    await assertFails(setDoc(doc(aliceDb, 'chatrooms/musicclub'), {
      owner: "bob",
      name: "Music Club",
    }));
  });

  it('should not allow an update that changes the room owner', async function () {
    const aliceDb = testEnv.authenticatedContext('alice').firestore();
    await assertFails(setDoc(doc(aliceDb, 'chatrooms/musicclub'), {
      owner: "bob",
      name: "Music Club",
    }));
  });
});