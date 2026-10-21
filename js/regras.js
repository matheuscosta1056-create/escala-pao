// Regras da escala do pão (sem dependência do Firebase — testável com Node)
//
// Folga = nº de dias de pão (seg–sex, fora feriados e dias "sem pão") desde a última vez que o militar trouxe.
// A cada dia de pão, traz quem estiver disponível com a MAIOR folga. Quem traz zera; os demais somam 1.
// Afastado (férias, folga, missão...) não é escalado e tem a folga CONGELADA enquanto estiver fora.
// Militar novo entra com a folga inicial informada (padrão 0 = fim da fila), como se tivesse trazido na véspera.
// "Não trouxe" não zera a folga: ele continua o mais folgado e é escalado no próximo dia.
// Quem tem dia designado (troca/permuta) não é escalado automaticamente antes desse dia.
// Desempate: quem trouxe há mais tempo → ordem da lista → cadastro mais antigo.
//
// Dias passados e o dia de hoje ficam gravados na coleção "escala" (histórico fixo).
// Os dias futuros são projetados na hora, exceto os designados manualmente (trocas).

export const DIAS_SEMANA = ['domingo', 'segunda-feira', 'terça-feira', 'quarta-feira', 'quinta-feira', 'sexta-feira', 'sábado'];
export const DIAS_CURTO = ['Dom', 'Seg', 'Ter', 'Qua', 'Qui', 'Sex', 'Sáb'];
export const MESES = ['', 'janeiro', 'fevereiro', 'março', 'abril', 'maio', 'junho', 'julho', 'agosto', 'setembro', 'outubro', 'novembro', 'dezembro'];
export const TIPOS_AFAST = {
    ferias: 'Férias',
    folga: 'Folga / dispensa',
    missao: 'Missão / serviço',
    curso: 'Curso',
    saude: 'Baixa médica',
    outro: 'Outro',
};
export const ICONES_AFAST = { ferias: '🏖', folga: '😴', missao: '🎖', curso: '📚', saude: '🏥', outro: '📌' };
export const STATUS = {
    previsto: 'Previsto',
    trouxe: 'Trouxe',
    faltou: 'Não trouxe',
    sem_pao: 'Sem pão no dia',
};

// ---------- Datas (sempre texto AAAA-MM-DD, fuso de Brasília) ----------

export function hoje() {
    return new Intl.DateTimeFormat('en-CA', { timeZone: 'America/Sao_Paulo', year: 'numeric', month: '2-digit', day: '2-digit' }).format(new Date());
}

function utc(d) {
    const [y, m, dd] = d.split('-').map(Number);
    return new Date(Date.UTC(y, m - 1, dd));
}

export function addDias(d, n) {
    const t = utc(d);
    t.setUTCDate(t.getUTCDate() + n);
    return t.toISOString().slice(0, 10);
}

export const diaDaSemana = d => utc(d).getUTCDay();
export const dataBr = d => d.slice(8, 10) + '/' + d.slice(5, 7) + '/' + d.slice(0, 4);
export const diaMes = d => d.slice(8, 10) + '/' + d.slice(5, 7);
export const nomeDiaSemana = d => DIAS_SEMANA[diaDaSemana(d)];
export const diaCurto = d => DIAS_CURTO[diaDaSemana(d)] + ' ' + diaMes(d);
export const dataExtenso = d => nomeDiaSemana(d) + ', ' + Number(d.slice(8, 10)) + ' de ' + MESES[Number(d.slice(5, 7))];
export const nome = m => (m ? `${m.posto} ${m.nome}`.trim() : '—');

// ---------- Feriados ----------

// Páscoa (algoritmo de Meeus/Jones/Butcher)
export function pascoa(ano) {
    const a = ano % 19, b = Math.floor(ano / 100), c = ano % 100;
    const d = Math.floor(b / 4), e = b % 4, f = Math.floor((b + 8) / 25);
    const g = Math.floor((b - f + 1) / 3);
    const h = (19 * a + b - d - g + 15) % 30;
    const i = Math.floor(c / 4), k = c % 4;
    const l = (32 + 2 * e + 2 * i - h - k) % 7;
    const m = Math.floor((a + 11 * h + 22 * l) / 451);
    const mes = Math.floor((h + l - 7 * m + 114) / 31);
    const dia = ((h + l - 7 * m + 114) % 31) + 1;
    return `${ano}-${String(mes).padStart(2, '0')}-${String(dia).padStart(2, '0')}`;
}

export function feriadosNacionais(ano) {
    const p = pascoa(ano);
    const lista = {
        [`${ano}-01-01`]: 'Confraternização Universal',
        [addDias(p, -48)]: 'Carnaval',
        [addDias(p, -47)]: 'Carnaval',
        [addDias(p, -2)]: 'Sexta-feira Santa',
        [`${ano}-04-21`]: 'Tiradentes',
        [`${ano}-05-01`]: 'Dia do Trabalho',
        [addDias(p, 60)]: 'Corpus Christi',
        [`${ano}-09-07`]: 'Independência do Brasil',
        [`${ano}-10-12`]: 'Nossa Senhora Aparecida',
        [`${ano}-11-02`]: 'Finados',
        [`${ano}-11-15`]: 'Proclamação da República',
        [`${ano}-11-20`]: 'Dia da Consciência Negra',
        [`${ano}-12-25`]: 'Natal',
    };
    return Object.fromEntries(Object.entries(lista).sort());
}

// Nacionais (automáticos) − os marcados como "tem expediente" + dias extras cadastrados
export function feriados(anoIni, anoFim, ignorados = [], extras = {}) {
    const lista = {};
    for (let a = anoIni; a <= anoFim; a++) Object.assign(lista, feriadosNacionais(a));
    for (const d of ignorados) delete lista[d];
    Object.assign(lista, extras);
    return Object.fromEntries(Object.entries(lista).sort());
}

export function eDiaUtil(d, fer) {
    const w = diaDaSemana(d);
    return w >= 1 && w <= 5 && !(d in fer);
}

export function afastamentoEm(lista, d) {
    return (lista || []).find(a => a.inicio <= d && d <= a.fim) || null;
}

// ---------- Escala ----------

export function ordenarMilitares(lista) {
    return [...lista].sort((a, b) => (a.ordem - b.ordem) || String(a.criado_em || '').localeCompare(String(b.criado_em || '')) || String(a.id).localeCompare(String(b.id)));
}

// < 0 se "a" deve trazer antes de "b"
function comparar(sa, ma, sb, mb) {
    return (sb.folga - sa.folga)
        || (sa.ultimo || '').localeCompare(sb.ultimo || '')
        || (ma.ordem - mb.ordem)
        || String(ma.criado_em || '').localeCompare(String(mb.criado_em || ''))
        || String(ma.id).localeCompare(String(mb.id));
}

/**
 * dados = {
 *   militares: [{id, posto, nome, telefone, ordem, folga_inicial, data_inclusao, data_desligamento, criado_em}],
 *   afastamentos: [{id, militar_id, tipo, inicio, fim, obs}],
 *   feriados: {data: descricao},
 *   registros: {data: {militar_id, status, fixo, obs}}
 * }
 * Retorna { dias: {data: {militar_id, status, fixo, origem, folga, obs}}, estado: {id: {folga, ultimo}} ao fim do dia "foto" }
 */
export function simular(dados, ate, foto = hoje()) {
    const mil = ordenarMilitares(dados.militares);
    const porId = Object.fromEntries(mil.map(m => [m.id, m]));
    const afast = {};
    for (const a of dados.afastamentos) (afast[a.militar_id] ||= []).push(a);
    const regDatas = Object.keys(dados.registros).sort();
    const res = { dias: {}, estado: {} };
    if (!mil.length) return res;

    let inicio = mil.map(m => m.data_inclusao).sort()[0];
    if (regDatas.length && regDatas[0] < inicio) inicio = regDatas[0];

    const designadoAte = {};
    for (const d of regDatas) {
        const r = dados.registros[d];
        if (r.fixo && r.militar_id && r.status !== 'sem_pao') designadoAte[r.militar_id] = d;
    }

    let est = {}; // id → {folga, ultimo}; a ordem das chaves segue a lista ordenada
    let fotoFeita = false;

    for (let d = inicio; d <= ate; d = addDias(d, 1)) {
        if (!fotoFeita && d > foto) {
            res.estado = structuredClone(est);
            fotoFeita = true;
        }

        for (const m of mil) {
            const presente = m.data_inclusao <= d && (!m.data_desligamento || d < m.data_desligamento);
            if (presente && !est[m.id]) est[m.id] = { folga: Number(m.folga_inicial) || 0, ultimo: addDias(d, -1) };
            else if (!presente && est[m.id]) delete est[m.id];
        }

        if (!eDiaUtil(d, dados.feriados)) continue;
        const reg = dados.registros[d];
        if (reg && reg.status === 'sem_pao') {
            res.dias[d] = { militar_id: null, status: 'sem_pao', fixo: true, origem: 'registro', folga: null, obs: reg.obs || '' };
            continue;
        }

        const afastados = new Set(Object.keys(est).filter(id => afastamentoEm(afast[id], d)));

        let esc = null, origem;
        if (reg && reg.militar_id) {
            esc = reg.militar_id;
            origem = 'registro';
        } else {
            for (const id of Object.keys(est)) {
                if (afastados.has(id) || (designadoAte[id] || '') > d) continue;
                if (esc === null || comparar(est[id], porId[id], est[esc], porId[esc]) < 0) esc = id;
            }
            origem = 'projecao';
        }
        const status = reg?.status || 'previsto';

        res.dias[d] = {
            militar_id: esc,
            status,
            fixo: !!reg?.fixo,
            origem,
            folga: esc !== null && est[esc] ? est[esc].folga : null,
            obs: reg?.obs || '',
        };

        for (const id of Object.keys(est)) {
            if (id === esc) {
                if (status !== 'faltou') est[id] = { folga: 0, ultimo: d };
            } else if (!afastados.has(id)) {
                est[id].folga++;
            }
        }
    }

    if (!fotoFeita) res.estado = est;
    return res;
}

// Dias até hoje que precisam ser gravados no histórico: [{data, militar_id, status}]
export function pendentesParaGravar(dados, dia = hoje()) {
    const sim = simular(dados, dia, dia);
    const lista = [];
    for (const [d, info] of Object.entries(sim.dias)) {
        if (info.origem === 'projecao' && info.militar_id !== null) {
            lista.push({ data: d, militar_id: info.militar_id, status: d < dia ? 'trouxe' : 'previsto' });
        }
    }
    return lista;
}

// ---------- WhatsApp ----------

export function telefoneWhats(tel) {
    let n = String(tel || '').replace(/\D/g, '');
    if (n.length === 10 || n.length === 11) n = '55' + n;
    return n;
}

export const telefoneValido = tel => /^55\d{10,11}$/.test(telefoneWhats(tel));

export function linkWhats(tel, msg) {
    return 'https://wa.me/' + telefoneWhats(tel) + '?text=' + encodeURIComponent(msg);
}

export function mensagem(modelo, militar, d) {
    return modelo
        .replaceAll('{posto}', militar?.posto || '')
        .replaceAll('{nome}', militar?.nome || '')
        .replaceAll('{data}', dataBr(d))
        .replaceAll('{dia_semana}', nomeDiaSemana(d));
}

export const MENSAGENS_PADRAO = {
    titulo: 'Escala do Pão',
    msg_dia: 'Bom dia, {posto} {nome}! 🥖\nLembrete: hoje ({dia_semana}, {data}) é o seu dia de trazer o pão.\nObrigado!',
    msg_vespera: 'Boa tarde, {posto} {nome}! 🥖\nLembrete: amanhã ({dia_semana}, {data}) é o seu dia de trazer o pão.',
    msg_grupo: '🥖 *Escala do Pão* — {periodo}\n\n{lista}',
};
