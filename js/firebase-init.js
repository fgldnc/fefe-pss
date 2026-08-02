// Inicialização do Firebase — extraído do bloco inline do index.html para
// permitir remover 'unsafe-inline' do script-src da CSP.
// Este módulo está no <head>, antes de js/app.js (fim do body): módulos são
// deferidos e executam na ordem do documento, então window._FB já existe
// quando app.js/auth.js rodam (waitForFirebase em js/auth.js tolera 5 s).
import { initializeApp } from "https://www.gstatic.com/firebasejs/10.7.0/firebase-app.js";
import { getAuth, GoogleAuthProvider, signInWithPopup, onAuthStateChanged, signOut }
  from "https://www.gstatic.com/firebasejs/10.7.0/firebase-auth.js";
import { getFirestore, collection, doc, getDocs, setDoc, addDoc,
  deleteDoc, updateDoc, query, where, writeBatch }
  from "https://www.gstatic.com/firebasejs/10.7.0/firebase-firestore.js";

// ── Configure Firebase ──────────────────────────────────────
const firebaseConfig = {
  apiKey: "AIzaSyCZ_xc7UJsIsHI_M8GvxggtcYu2cBunqFo",

  authDomain: "fefe-df577.firebaseapp.com",

  projectId: "fefe-df577",

  storageBucket: "fefe-df577.firebasestorage.app",

  messagingSenderId: "988495815243",

  appId: "1:988495815243:web:0309d3a01b5d6033e4e3ce"

};

const app  = initializeApp(firebaseConfig);
const auth = getAuth(app);
const db   = getFirestore(app);

window._FB = { auth, db, GoogleAuthProvider, signInWithPopup, onAuthStateChanged, signOut,
  collection, doc, getDocs, setDoc, addDoc, deleteDoc, updateDoc, query, where, writeBatch };
