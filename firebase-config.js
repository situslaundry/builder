import { initializeApp } from "https://www.gstatic.com/firebasejs/10.8.0/firebase-app.js";
import { getAuth } from "https://www.gstatic.com/firebasejs/10.8.0/firebase-auth.js";
import { getFirestore } from "https://www.gstatic.com/firebasejs/10.8.0/firebase-firestore.js";
import { getStorage } from "https://www.gstatic.com/firebasejs/10.8.0/firebase-storage.js";

const firebaseConfig = {
  apiKey: "AIzaSyAGDPIgTI1FtH9SPmU3Hccs9bD3Ct1cJIM",
  authDomain: "website-builder-ff904.firebaseapp.com",
  projectId: "website-builder-ff904",
  storageBucket: "website-builder-ff904.firebasestorage.app",
  messagingSenderId: "226728413932",
  appId: "1:226728413932:web:df09aaf7da27a2615f73c9",
};
export const app = initializeApp(firebaseConfig);
export const auth = getAuth(app);
export const db = getFirestore(app);
export const storage = getStorage(app);
