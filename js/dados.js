// Acesso ao Firebase (login + Firestore)

import { initializeApp } from 'https://www.gstatic.com/firebasejs/10.12.2/firebase-app.js';
import {
    getAuth, onAuthStateChanged, signInWithEmailAndPassword, signOut, sendPasswordResetEmail,
} from 'https://www.gstatic.com/firebasejs/10.12.2/firebase-auth.js';
import {
    getFirestore, collection, getDocs, doc, setDoc, deleteDoc, addDoc, writeBatch,
} from 'https://www.gstatic.com/firebasejs/10.12.2/firebase-firestore.js';
import { firebaseConfig } from './firebase-config.js?v=2';

export const configurado = firebaseConfig.apiKey && firebaseConfig.apiKey !== 'COLE_AQUI';

const app = configurado ? initializeApp(firebaseConfig) : null;
const auth = app ? getAuth(app) : null;
const db = app ? getFirestore(app) : null;

export const COLECOES = ['militares', 'afastamentos', 'escala', 'avisos', 'feriados_extras', 'feriados_ignorados', 'config'];

// ---------- Login ----------

export const aoMudarLogin = fn => onAuthStateChanged(auth, fn);
export const entrar = (email, senha) => signInWithEmailAndPassword(auth, email, senha);
export const sair = () => signOut(auth);
export const recuperarSenha = email => sendPasswordResetEmail(auth, email);

// ---------- Leitura ----------

export async function carregarTudo() {
    const res = {};
    await Promise.all(COLECOES.map(async c => {
        const snap = await getDocs(collection(db, c));
        res[c] = snap.docs.map(d => ({ id: d.id, ...d.data() }));
    }));
    return res;
}

// ---------- Escrita ----------

export const salvar = (col, id, dados, mesclar = true) => setDoc(doc(db, col, id), dados, { merge: mesclar });
export const criar = (col, dados) => addDoc(collection(db, col), dados);
export const apagar = (col, id) => deleteDoc(doc(db, col, id));

// Várias operações de uma vez: [['set', col, id, dados] | ['del', col, id]] (em lotes de 400)
export async function emLote(ops) {
    for (let i = 0; i < ops.length; i += 400) {
        const lote = writeBatch(db);
        for (const [tipo, col, id, dados] of ops.slice(i, i + 400)) {
            const ref = id ? doc(db, col, id) : doc(collection(db, col));
            if (tipo === 'del') lote.delete(ref);
            else lote.set(ref, dados);
        }
        await lote.commit();
    }
}
