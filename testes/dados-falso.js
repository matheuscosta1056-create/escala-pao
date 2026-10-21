// Substituto do Firebase para testar as telas sem internet (usado por testes/demo.html).
// Guarda tudo na sessão do navegador. Senha da demonstração: demo

export const configurado = true;
export const COLECOES = ['militares', 'afastamentos', 'escala', 'avisos', 'feriados_extras', 'feriados_ignorados', 'config'];

function semente() {
    const nomes = ['Silva', 'Souza', 'Costa', 'Lima', 'Pereira', 'Almeida', 'Rocha', 'Gomes', 'Ribeiro', 'Martins', 'Carvalho', 'Araújo', 'Melo', 'Barbosa', 'Teixeira'];
    const s = Object.fromEntries(COLECOES.map(c => [c, {}]));
    nomes.forEach((n, i) => {
        s.militares['m' + (i + 1)] = {
            posto: i < 5 ? '2º Sgt' : '3º Sgt', nome: n, telefone: i === 3 ? '' : '619999900' + String(i).padStart(2, '0'),
            ordem: i + 1, folga_inicial: 14 - i, data_inclusao: '2026-10-13', data_desligamento: null, criado_em: '2026-10-13T10:00:0' + (i % 10) + 'Z',
        };
    });
    s.afastamentos.a1 = { militar_id: 'm4', tipo: 'ferias', inicio: '2026-10-21', fim: '2026-10-31', obs: '' };
    return s;
}

const store = JSON.parse(sessionStorage.getItem('demo-escala') || 'null') || semente();
const persistir = () => sessionStorage.setItem('demo-escala', JSON.stringify(store));
const novoId = () => 'x' + Math.random().toString(36).slice(2, 10);

// O Firestore recusa campos undefined — reproduz o erro para pegar falhas nas telas
function validar(dados) {
    for (const [k, v] of Object.entries(dados)) if (v === undefined) throw new Error(`Campo "${k}" indefinido (o Firestore recusaria)`);
    return dados;
}

let usuario = JSON.parse(sessionStorage.getItem('demo-usuario') || 'null');
const ouvintes = [];
const avisar = () => ouvintes.forEach(fn => fn(usuario));

export const aoMudarLogin = fn => { ouvintes.push(fn); setTimeout(() => fn(usuario)); };
export async function entrar(email, senha) {
    if (senha !== 'demo') throw Object.assign(new Error('senha'), { code: 'auth/invalid-credential' });
    usuario = { email };
    sessionStorage.setItem('demo-usuario', JSON.stringify(usuario));
    avisar();
}
export async function sair() {
    usuario = null;
    sessionStorage.removeItem('demo-usuario');
    avisar();
}
export async function recuperarSenha() {}

export async function carregarTudo() {
    await new Promise(r => setTimeout(r, 80));
    return structuredClone(Object.fromEntries(COLECOES.map(c => [c, Object.entries(store[c]).map(([id, d]) => ({ id, ...d }))])));
}
export async function salvar(col, id, dados, mesclar = true) {
    validar(dados);
    store[col][id] = mesclar ? { ...(store[col][id] || {}), ...dados } : { ...dados };
    persistir();
}
export async function criar(col, dados) {
    validar(dados);
    const id = novoId();
    store[col][id] = { ...dados };
    persistir();
    return { id };
}
export async function apagar(col, id) {
    delete store[col][id];
    persistir();
}
let publico = JSON.parse(sessionStorage.getItem('demo-publico') || 'null');
export async function lerPublico() { return publico; }
export async function salvarPublico(dados) {
    publico = structuredClone(dados);
    sessionStorage.setItem('demo-publico', JSON.stringify(publico));
}

export async function emLote(ops) {
    for (const [tipo, col, id, dados] of ops) {
        if (tipo === 'del') delete store[col][id];
        else store[col][id || novoId()] = { ...validar(dados) };
    }
    persistir();
}
