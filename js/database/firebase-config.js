import { initializeApp } from "https://www.gstatic.com/firebasejs/10.8.0/firebase-app.js";
import { getFirestore, doc, setDoc, getDoc, updateDoc, deleteDoc, collection, getDocs } from "https://www.gstatic.com/firebasejs/10.8.0/firebase-firestore.js";

const firebaseConfig = {
  apiKey: "AIzaSyB_nhE7dhy1gYPJxRuScPZ9khXnPT5te_E",
  authDomain: "student-tracking-app-f4570.firebaseapp.com",
  projectId: "student-tracking-app-f4570",
  storageBucket: "student-tracking-app-f4570.firebasestorage.app",
  messagingSenderId: "878719441575",
  appId: "1:878719441575:web:c37c72c27423e250909982"
};

let db = null;
const isConfigured = firebaseConfig.apiKey && firebaseConfig.apiKey !== "YOUR_API_KEY";

if (isConfigured) {
  try {
    const app = initializeApp(firebaseConfig);
    db = getFirestore(app);
  } catch (e) {
    console.error("Firebase initialization failed:", e);
  }
} else {
  console.warn("Firebase config is using placeholders. Sync functions will run in offline mode.");
}

export { db, doc, setDoc, getDoc, updateDoc, deleteDoc, collection, getDocs };
