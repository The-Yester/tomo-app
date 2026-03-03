import { initializeApp } from "firebase/app";
import { initializeAuth, getReactNativePersistence } from "firebase/auth";
import { getFirestore } from "firebase/firestore";
import { getStorage } from "firebase/storage";
import ReactNativeAsyncStorage from '@react-native-async-storage/async-storage';
// import { getAnalytics } from "firebase/analytics"; 

// Your web app's Firebase configuration
const firebaseConfig = {
    apiKey: "AIzaSyB2yrBh33cfEi46T1nJ4Rul4nh9eQvLiCM",
    authDomain: "tomo-5400f.firebaseapp.com",
    projectId: "tomo-5400f",
    storageBucket: "tomo-5400f.firebasestorage.app",
    messagingSenderId: "807982445653",
    appId: "1:807982445653:web:688e61a15de620fa00d0dc",
    measurementId: "G-15P8630E2B"
};

// Initialize Firebase
const app = initializeApp(firebaseConfig);
// const analytics = getAnalytics(app); 

export const auth = initializeAuth(app, {
    persistence: getReactNativePersistence(ReactNativeAsyncStorage)
});
export const db = getFirestore(app);
export const storage = getStorage(app);

export default app;
