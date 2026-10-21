// Substituto da leitura pública para testes/ver.html: usa o que a demonstração (demo.html) gravou na sessão
const lerStore = () => JSON.parse(sessionStorage.getItem('demo-escala') || '{}');

export async function lerEscalaPublica() {
    return JSON.parse(sessionStorage.getItem('demo-publico') || 'null');
}

export async function lerLanche(data) {
    return structuredClone(lerStore().lanche?.[data] || null);
}

export async function escolherItem(data, id, nome) {
    const store = lerStore();
    const lanche = store.lanche?.[data];
    if (!lanche?.itens[id]) throw Object.assign(new Error('item inexistente'), { code: 'permission-denied' });
    if (lanche.escolhas[id]) throw Object.assign(new Error('já escolhido'), { code: 'permission-denied' });
    lanche.escolhas[id] = { nome };
    sessionStorage.setItem('demo-escala', JSON.stringify(store));
}

export async function incluirExtra(data, id, produto, nome) {
    const store = lerStore();
    const lanche = store.lanche?.[data];
    if (!lanche || lanche.escolhas[id]) throw Object.assign(new Error('não permitido'), { code: 'permission-denied' });
    lanche.escolhas[id] = { nome, produto };
    sessionStorage.setItem('demo-escala', JSON.stringify(store));
}
