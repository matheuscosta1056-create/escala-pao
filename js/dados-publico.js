// Leitura da escala publicada (página pública, sem login)

import { initializeApp } from 'https://www.gstatic.com/firebasejs/10.12.2/firebase-app.js';
import { getFirestore, doc, getDoc } from 'https://www.gstatic.com/firebasejs/10.12.2/firebase-firestore.js';
import { firebaseConfig } from './firebase-config.js?v=3';

export async function lerEscalaPublica() {
    const db = getFirestore(initializeApp(firebaseConfig));
    const snap = await getDoc(doc(db, 'publico', 'escala'));
    return snap.exists() ? snap.data() : null;
}
