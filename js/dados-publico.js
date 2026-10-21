// Página pública (sem login): lê a escala publicada e a lista do café; permite pegar um item livre

import { initializeApp } from 'https://www.gstatic.com/firebasejs/10.12.2/firebase-app.js';
import { getFirestore, doc, getDoc, getDocs, setDoc, collection } from 'https://www.gstatic.com/firebasejs/10.12.2/firebase-firestore.js';
import { firebaseConfig } from './firebase-config.js?v=7';

const db = getFirestore(initializeApp(firebaseConfig));

export async function lerEscalaPublica() {
    const snap = await getDoc(doc(db, 'publico', 'escala'));
    return snap.exists() ? snap.data() : null;
}

export async function lerLanche(data) {
    const snap = await getDoc(doc(db, 'lanche', data));
    if (!snap.exists()) return null;
    const esc = await getDocs(collection(db, 'lanche', data, 'escolhas'));
    return { ...snap.data(), escolhas: Object.fromEntries(esc.docs.map(e => [e.id, e.data()])) };
}

// Só funciona se o item ainda estiver livre (as regras do Firestore não deixam sobrescrever)
export const escolherItem = (data, id, nome) => setDoc(doc(db, 'lanche', data, 'escolhas', id), { nome });
