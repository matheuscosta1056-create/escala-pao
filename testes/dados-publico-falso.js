// Substituto da leitura pública para testes/ver.html: lê o resumo gravado pela demonstração (demo.html)
export async function lerEscalaPublica() {
    return JSON.parse(sessionStorage.getItem('demo-publico') || 'null');
}
