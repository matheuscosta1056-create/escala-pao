import * as R from './regras.js?v=8';
import * as F from './dados.js?v=8';

const $main = document.getElementById('conteudo');
const $nav = document.getElementById('menu');

let D = null;          // dados carregados e preparados
let anoAjustes = Number(R.hoje().slice(0, 4));
let mesHistorico = R.hoje().slice(0, 7);

// ---------- Utilidades ----------

const h = s => String(s ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const agora = () => new Date().toISOString();
const horaLocal = iso => new Date(iso).toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' });

function avatar(m, classe = '') {
    if (!m) return `<span class="avatar vazio ${classe}">?</span>`;
    const cores = ['#2f855a', '#2b6cb0', '#c05621', '#6b46c1', '#b83280', '#2c7a7b', '#975a16', '#4a5568', '#c53030', '#276749'];
    let soma = 0;
    for (const ch of String(m.id)) soma += ch.charCodeAt(0);
    // Nome composto: iniciais (MR); nome único: 3 primeiras letras (MAT, MAU) para não repetir
    const partes = m.nome.trim().split(/\s+/);
    const ini = (partes[1] ? partes[0][0] + partes[1][0] : partes[0].replace(/[^\p{L}]/gu, '').slice(0, 3)).toUpperCase();
    return `<span class="avatar ${classe}${ini.length > 2 ? ' tres' : ''}" style="background:${cores[soma % cores.length]}">${h(ini)}</span>`;
}

function aviso(msg, tipo = 'ok') {
    const el = document.getElementById('toast');
    el.textContent = msg;
    el.className = 'toast mostrar ' + tipo;
    clearTimeout(aviso.t);
    aviso.t = setTimeout(() => el.classList.remove('mostrar'), tipo === 'erro' ? 6000 : 3500);
}

function ocupado(sim) {
    document.body.classList.toggle('ocupado', sim);
}

// ---------- Dados ----------

async function recarregar() {
    const raw = await F.carregarTudo();
    const hoje = R.hoje();
    const cfg = Object.assign({}, R.MENSAGENS_PADRAO, raw.config.find(c => c.id === 'geral') || {});
    const militares = R.ordenarMilitares(raw.militares.map(m => ({ ...m, ordem: Number(m.ordem) || 0, folga_inicial: Number(m.folga_inicial) || 0 })));
    const registros = Object.fromEntries(raw.escala.filter(r => /^\d{4}-\d{2}-\d{2}$/.test(r.id)).map(r => [r.id, r]));
    const extras = Object.fromEntries(raw.feriados_extras.map(f => [f.id, f.descricao]));
    const ignorados = raw.feriados_ignorados.map(f => f.id);
    let anoIni = Number(hoje.slice(0, 4));
    for (const m of militares) anoIni = Math.min(anoIni, Number(m.data_inclusao.slice(0, 4)));
    const lanches = await F.carregarLanches(R.addDias(hoje, -7));

    D = {
        raw, cfg, militares, registros, extras, ignorados, lanches,
        qtdSexta: Number(cfg.qtd_sexta) || 0,
        afastamentos: raw.afastamentos,
        avisos: raw.avisos,
        porId: Object.fromEntries(militares.map(m => [m.id, m])),
        ativos: militares.filter(m => !m.data_desligamento || m.data_desligamento > hoje),
        feriados: R.feriados(anoIni, Number(hoje.slice(0, 4)) + 1, ignorados, extras),
    };
    D.participantes = R.participantesCafe(D.ativos, cfg.participantes_cafe);
}

const dadosRegra = () => ({ militares: D.militares, afastamentos: D.afastamentos, feriados: D.feriados, registros: D.registros });

// Grava no histórico os dias até hoje ainda não registrados (e fecha os "previsto" passados como "trouxe")
async function consolidar() {
    const hoje = R.hoje();
    const ops = [];
    for (const [d, r] of Object.entries(D.registros)) {
        if (r.status === 'previsto' && d < hoje) ops.push(['set', 'escala', d, { ...r, id: undefined, status: 'trouxe' }]);
    }
    for (const p of R.pendentesParaGravar(dadosRegra(), hoje)) {
        if (!D.registros[p.data]) ops.push(['set', 'escala', p.data, { militar_id: p.militar_id, status: p.status, fixo: false, obs: '' }]);
    }
    for (const op of ops) delete op[3].id;
    if (ops.length) {
        await F.emLote(ops);
        await recarregar();
    }
}

// Depois de mudar militares/afastamentos/feriados, refaz o dia de hoje se ainda não foi avisado nem trocado
async function invalidarHoje() {
    const hoje = R.hoje();
    const r = D.registros[hoje];
    const avisado = D.avisos.some(a => a.data === hoje && (a.tipo === 'dia' || a.tipo === 'vespera'));
    if (r && r.status === 'previsto' && !r.fixo && !avisado) await F.apagar('escala', hoje);
}

// Atualiza o resumo da página pública (só nomes e datas) quando a escala muda
async function publicar() {
    const canonico = v => JSON.stringify(v, (_, x) => (x && typeof x === 'object' && !Array.isArray(x) ? Object.fromEntries(Object.entries(x).sort()) : x));
    const novo = { titulo: D.cfg.titulo, dias: R.resumoPublico(dadosRegra(), R.hoje(), 6, D.qtdSexta), participantes: D.participantes, cabecalho: D.cfg.cabecalho_impressao || '' };
    const atual = await F.lerPublico();
    if (atual === undefined) return console.warn('Página pública: sem permissão nas regras do Firestore.');
    if (atual && canonico({ titulo: atual.titulo, dias: atual.dias, participantes: atual.participantes || [], cabecalho: atual.cabecalho || '' }) === canonico(novo)) return;
    await F.salvarPublico({ ...novo, atualizado_em: agora() });
}

async function atualizar() {
    await recarregar();
    await consolidar();
    render();
    publicar().catch(e => console.warn('Página pública não atualizada:', e.message));
}

const linkPublico = () => new URL('ver.html', location.href.split('#')[0]).href;

// ---------- Telas ----------

function botaoWhats(m, data, tipo, modelo, rotulo) {
    if (!R.telefoneValido(m.telefone)) {
        return `<button class="btn claro" data-acao="editar-militar" data-id="${h(m.id)}">⚠ Cadastrar WhatsApp</button>`;
    }
    const feito = D.avisos.filter(a => a.data === data && a.tipo === tipo).map(a => a.enviado_em).sort().pop();
    return `<a class="btn whats${feito ? ' enviado' : ''}" target="_blank" rel="noopener" href="${h(R.linkWhats(m.telefone, R.mensagem(modelo, m, data, D.qtdSexta)))}"
        data-aviso="${tipo}" data-data="${data}" data-militar="${h(m.id)}">${feito ? '✓ Avisado às ' + horaLocal(feito) + ' · reenviar' : '📲 ' + rotulo}</a>`;
}

// Próxima sexta ainda como dia de pão: atalho para virar café
function cartaoProximaSexta(futuros) {
    const sexta = futuros.find(([d]) => R.eSexta(d));
    if (!sexta || sexta[1].status === 'cafe') return '';
    const [d, x] = sexta;
    const m = D.porId[x.militar_id];
    return `<section class="card grupo cafe-card">
        <div><h3>☕ Próxima sexta — ${R.diaCurto(d)}</h3>
            <p class="muted">Está como <b>dia de pão</b>${m ? `: ${h(R.nome(m))} traz${D.qtdSexta ? ` ${D.qtdSexta} pães` : ''}` : ''}.
            Se for ter café da seção, troque aqui e a lista do lanche abre na página pública.</p></div>
        <div class="acoes"><button class="btn verde" data-acao="sexta-cafe" data-data="${d}">☕ Fazer café nesta sexta</button></div>
    </section>`;
}

// Cartão de cada sexta de café com a lista do lanche
function cartoesCafe(datas) {
    return datas.map(d => {
        const lanche = D.lanches[d];
        const itens = R.itensLanche(lanche, lanche?.escolhas);
        const escolhidos = itens.filter(i => i.nome).length;
        const faltam = R.faltamEscolher(D.participantes, itens);
        const texto = R.textoLanche(D.cfg.msg_cafe, d, itens, linkPublico());
        const lista = itens.map(i => `<div class="lanche-item ${i.nome ? 'ok' : ''}">
            <span class="lanche-produto">${h(i.produto)}${i.extra ? ' <span class="selo">extra</span>' : ''}</span>
            <span class="lanche-nome">${i.nome ? h(i.nome) : '<i>livre</i>'}</span>
            <span class="lanche-acoes">
                ${i.extra ? '' : `<button class="link" data-acao="lanche-definir" data-data="${d}" data-id="${h(i.id)}" data-produto="${h(i.produto)}" data-nome="${h(i.nome)}">${i.nome ? 'trocar' : 'pôr nome'}</button>`}
                ${i.nome && !i.extra ? `<button class="link" data-acao="lanche-limpar" data-data="${d}" data-id="${h(i.id)}">liberar</button>` : ''}
                <button class="link perigo" data-acao="lanche-remover" data-data="${d}" data-id="${h(i.id)}" data-confirm="Tirar “${h(i.produto)}” da lista desta sexta?" title="Tirar da lista">✕</button>
            </span>
        </div>`).join('');
        return `<section class="card cafe-card">
            <div class="cabecalho"><h3>☕ Café da seção — ${R.dataExtenso(d)}</h3>
                ${lanche ? `<span class="selo">${escolhidos} de ${itens.length} itens escolhidos</span>` : ''}</div>
            ${lanche ? `<div class="lanche-lista">${lista}</div>
            <form data-form="lanche-adicionar" data-data="${d}" class="extra-form">
                <input name="produto" placeholder="Outro item (ex.: pão de queijo)" maxlength="60" required>
                <button class="btn claro">+ Adicionar item</button>
            </form>
            <div class="acoes">
                <a class="btn whats" target="_blank" rel="noopener" href="https://wa.me/?text=${encodeURIComponent(texto)}">📲 Enviar lista no grupo</a>
                <button class="btn claro" data-acao="copiar" data-texto="${h(texto)}">📋 Copiar</button>
            </div>
            ${faltam.length ? `<p class="faltam"><b>Ainda não escolheram (${faltam.length}):</b> ${faltam.map(h).join(', ')}</p>` : '<p class="faltam ok">✔ Todos os participantes já escolheram.</p>'}
            <p class="dica">Na página pública, cada um toca num item livre e escolhe o nome na lista. Só você pode trocar ou liberar. Participantes extras: ⚙️ Ajustes → Sexta-feira.</p>`
            : `<p class="muted">A lista do lanche desta sexta ainda não foi criada.</p>
               <button class="btn verde" data-acao="sexta-cafe" data-data="${d}">Criar lista do lanche</button>`}
        </section>`;
    }).join('');
}

function telaHoje() {
    const hoje = R.hoje();
    if (!D.militares.length) {
        return `<section class="card vazio"><div class="emoji-grande">🥖</div><h2>Vamos começar!</h2>
            <p class="muted">Cadastre os militares e defina quem traz primeiro.</p>
            <a class="btn grande" href="#militares">Cadastrar militares</a></section>`;
    }
    const sim = R.simular(dadosRegra(), R.addDias(hoje, 120), hoje);
    const futuros = Object.entries(sim.dias).filter(([d]) => d >= hoje);
    const diaHoje = sim.dias[hoje] || null;
    const prox = futuros.find(([d]) => d > hoje);
    const proxData = prox?.[0];

    // Fila
    const proxima = {};
    for (const [d, x] of futuros) if (x.militar_id && !proxima[x.militar_id]) proxima[x.militar_id] = d;
    const fila = D.ativos.map(m => ({
        m,
        folga: sim.estado[m.id]?.folga ?? m.folga_inicial,
        proxima: proxima[m.id] || null,
        afast: R.afastamentoEm(D.afastamentos.filter(a => a.militar_id === m.id), hoje),
    })).sort((a, b) => (a.proxima || '9999').localeCompare(b.proxima || '9999') || a.m.ordem - b.m.ordem);
    const maxFolga = Math.max(1, D.ativos.length - 1, ...fila.map(f => f.folga));

    // Calendário de duas semanas (no fim de semana, começa na próxima segunda)
    const w = R.diaDaSemana(hoje) || 7;
    const seg = w >= 6 ? R.addDias(hoje, 8 - w) : R.addDias(hoje, 1 - w);
    const semanas = [0, 1].map(s => [0, 1, 2, 3, 4].map(i => R.addDias(seg, s * 7 + i)));

    // Mensagem do grupo
    const linhas = semanas[0].map(d => {
        if (D.feriados[d]) return `${R.diaCurto(d)} — feriado (${D.feriados[d]})`;
        const x = sim.dias[d];
        if (!x) return null;
        if (x.status === 'sem_pao') return `${R.diaCurto(d)} — sem pão`;
        if (x.status === 'cafe') return `${R.diaCurto(d)} — ☕ café da seção`;
        return `${R.diaCurto(d)} — ${R.nome(D.porId[x.militar_id])}${R.eSexta(d) && D.qtdSexta ? ` (${D.qtdSexta} pães)` : ''}`;
    }).filter(Boolean);
    let msgGrupo = D.cfg.msg_grupo
        .replaceAll('{periodo}', R.diaMes(semanas[0][0]) + ' a ' + R.diaMes(semanas[0][4]))
        .replaceAll('{lista}', linhas.join('\n'));
    msgGrupo = msgGrupo.includes('{link}') ? msgGrupo.replaceAll('{link}', linkPublico()) : msgGrupo + '\n\n📅 Escala completa: ' + linkPublico();

    // Hero
    let hero;
    const mHoje = diaHoje?.militar_id ? D.porId[diaHoje.militar_id] : null;
    if (diaHoje?.status === 'cafe') {
        hero = `<section class="hero cafe">
            <div class="hero-data">${R.dataExtenso(hoje)}</div>
            <div class="emoji-grande">☕</div>
            <h1>Hoje tem café da seção</h1>
            <p>Ninguém traz pão hoje. A lista do lanche está logo abaixo.</p>
        </section>`;
    } else if (!mHoje) {
        let motivo;
        if (diaHoje) motivo = diaHoje.status === 'sem_pao' ? 'Dia marcado como sem pão.' : 'Todos estão afastados.';
        else if (D.feriados[hoje]) motivo = 'Feriado: ' + h(D.feriados[hoje]);
        else if (R.eDiaUtil(hoje, D.feriados)) motivo = proxData ? 'A escala começa ' + R.dataExtenso(proxData) + '.' : 'Ninguém na escala ainda.';
        else motivo = 'Fim de semana';
        hero = `<section class="hero folga">
            <div class="hero-data">${R.dataExtenso(hoje)}</div>
            <div class="emoji-grande">${diaHoje ? '🚫' : '😴'}</div>
            <h1>Hoje não tem pão</h1><p>${motivo}</p>
            ${diaHoje?.status === 'sem_pao' ? `<button class="btn claro" data-acao="dia-automatico" data-data="${hoje}">Desfazer</button>` : ''}
        </section>`;
    } else {
        const st = diaHoje.status;
        hero = `<section class="hero st-${st}">
            <div class="hero-data">${R.dataExtenso(hoje)}</div>
            ${avatar(mHoje, 'gigante')}
            <h1>${h(R.nome(mHoje))}</h1>
            <p class="hero-sub">${{ previsto: 'traz o pão hoje', trouxe: 'trouxe o pão hoje ✔', faltou: 'não trouxe — fica para o próximo dia' }[st]}${R.eSexta(hoje) && D.qtdSexta && st === 'previsto' ? ` · <b>${D.qtdSexta} pães</b>` : ''}</p>
            ${st === 'previsto' ? botaoWhats(mHoje, hoje, 'dia', D.cfg.msg_dia, 'Avisar no WhatsApp') : ''}
            <div class="hero-acoes">
                ${[['trouxe', '✔ Trouxe'], ['faltou', '✘ Não trouxe']].map(([s, rot]) =>
                    `<button class="btn pilula ${st === s ? 'marcado' : ''}" data-acao="dia-status" data-data="${hoje}" data-status="${st === s ? 'previsto' : s}">${rot}</button>`).join('')}
                <button class="btn pilula" data-acao="abrir-dia" data-data="${hoje}" data-rotulo="Hoje" data-militar="${h(mHoje.id)}" data-fixo="${diaHoje.fixo ? 1 : 0}" data-status="${st}">🔁 Trocar</button>
            </div>
        </section>`;
    }

    const mProx = proxData ? D.porId[sim.dias[proxData].militar_id] : null;
    const amanha = mProx ? `<section class="card amanha">
        ${avatar(mProx)}
        <div class="amanha-txt"><small>${proxData === R.addDias(hoje, 1) ? 'Amanhã' : R.dataExtenso(proxData)}</small><b>${h(R.nome(mProx))}</b></div>
        ${botaoWhats(mProx, proxData, 'vespera', D.cfg.msg_vespera, 'Avisar véspera')}
    </section>` : '';

    const calendario = semanas.flat().map(d => {
        const x = sim.dias[d];
        const fer = D.feriados[d];
        const m = x ? D.porId[x.militar_id] : null;
        const passado = d < hoje;
        const cls = ['cal-dia', d === hoje && 'hoje', passado && 'passado', (fer || x?.status === 'sem_pao') && 'feriado', x?.status === 'cafe' && 'cafe'].filter(Boolean).join(' ');
        const clicavel = !passado && !fer && x;
        let corpo;
        if (fer) corpo = `<div class="cal-icone">🎉</div><div class="cal-nome">${h(fer)}</div>`;
        else if (x?.status === 'sem_pao') corpo = `<div class="cal-icone">🚫</div><div class="cal-nome">Sem pão</div>`;
        else if (x?.status === 'cafe') corpo = `<div class="cal-icone">☕</div><div class="cal-nome">Café</div>`;
        else if (m) {
            const selo = x.status === 'trouxe' ? '<span class="cal-selo ok">✔</span>'
                : x.status === 'faltou' ? '<span class="cal-selo erro">✘</span>'
                : x.fixo ? '<span class="cal-selo troca" title="Designado manualmente">🔁</span>' : '';
            const qtd = R.eSexta(d) && D.qtdSexta ? `<span class="cal-qtd">${D.qtdSexta} pães</span>` : '';
            corpo = `${avatar(m)}<div class="cal-nome">${h(m.nome)}</div>${qtd}${selo}`;
        } else corpo = '<div class="cal-nome muted">—</div>';
        const attrs = clicavel ? `data-acao="abrir-dia" data-data="${d}" data-rotulo="${R.diaCurto(d)}" data-militar="${h(x.militar_id || '')}" data-fixo="${x.fixo ? 1 : 0}" data-status="${x.status}"` : '';
        return `<div class="${cls}${clicavel ? ' clicavel' : ''}" ${attrs}><div class="cal-num">${R.diaMes(d)}</div>${corpo}</div>`;
    }).join('');

    const filaHtml = fila.map(f => {
        let quando;
        if (f.afast) quando = `${R.ICONES_AFAST[f.afast.tipo] || '📌'} ${R.TIPOS_AFAST[f.afast.tipo] || 'Afastado'} até ${R.diaMes(f.afast.fim)}`;
        else if (!f.proxima) quando = '—';
        else if (f.proxima === hoje) quando = '<b class="verde">Hoje</b>';
        else quando = R.diaCurto(f.proxima);
        return `<div class="fila-item ${f.afast ? 'afastado' : ''}">${avatar(f.m)}
            <div class="fila-info">
                <div class="fila-linha"><b>${h(R.nome(f.m))}</b><span class="fila-quando">${quando}</span></div>
                <div class="barra" title="${f.folga} folgas"><span style="width:${Math.round(Math.min(1, f.folga / maxFolga) * 100)}%"></span></div>
                <small class="muted">${f.folga} folga${f.folga === 1 ? '' : 's'}</small>
            </div></div>`;
    }).join('');

    return `${hero}${amanha}
    <section class="card"><h3>Próximos dias</h3>
        <div class="calendario">${['Seg', 'Ter', 'Qua', 'Qui', 'Sex'].map(s => `<div class="cal-cab">${s}</div>`).join('')}${calendario}</div>
        <p class="dica">Toque num dia para trocar o militar, marcar “sem pão” ou, na sexta, marcar café da seção.</p>
    </section>
    ${cartaoProximaSexta(futuros)}
    ${cartoesCafe(semanas.flat().filter(d => d >= hoje && sim.dias[d]?.status === 'cafe'))}
    <section class="card"><h3>Fila</h3><div class="fila">${filaHtml}</div></section>
    <section class="card grupo">
        <div><h3>Escala da semana no grupo</h3><p class="muted">Manda a semana inteira de uma vez no grupo da seção.</p></div>
        <div class="acoes">
            <button class="btn claro" data-acao="copiar" data-texto="${h(msgGrupo)}">📋 Copiar</button>
            <a class="btn whats" target="_blank" rel="noopener" href="https://wa.me/?text=${encodeURIComponent(msgGrupo)}">📲 Enviar no grupo</a>
        </div>
    </section>
    <section class="card grupo">
        <div><h3>Página pública e impressão</h3><p class="muted">Qualquer pessoa com o link vê a escala (só posto e nome, sem telefones).</p></div>
        <div class="acoes">
            <a class="btn verde" target="_blank" rel="noopener" href="ver.html?imprimir=1">🖨 Imprimir semana</a>
            <a class="btn claro" target="_blank" rel="noopener" href="ver.html">👀 Página pública</a>
            <button class="btn claro" data-acao="copiar" data-texto="${h(linkPublico())}">🔗 Copiar link</button>
        </div>
    </section>

    <dialog id="dlg-dia">
        <button class="dlg-fechar" data-acao="fechar">✕</button>
        <h3 id="dlg-titulo">Dia</h3>
        <form data-form="dia-trocar" class="dlg-bloco">
            <input type="hidden" name="data">
            <label>Quem vai trazer?
                <select name="militar_id" required>${D.ativos.map(m => `<option value="${h(m.id)}">${h(R.nome(m))}</option>`).join('')}</select>
            </label>
            <label class="check"><input type="checkbox" name="permutar" value="1" checked> Permutar (quem sai fica com o dia de quem entra)</label>
            <button class="btn verde">Confirmar troca</button>
        </form>
        <div class="dlg-rodape">
            <button class="btn claro" data-acao="dia-status" data-status="sem_pao" data-data="">🚫 Sem pão neste dia</button>
            <button class="btn claro" data-acao="dia-automatico" data-data="" id="dlg-auto">↩ Voltar ao automático</button>
            <button class="btn claro" data-acao="sexta-cafe" data-data="" id="dlg-cafe">☕ Café da seção nesta sexta</button>
            <button class="btn claro" data-acao="sexta-pao" data-data="" id="dlg-pao" data-confirm="Voltar a ser dia de pão? A lista do lanche desta sexta será apagada.">🥖 Voltar a ser dia de pão</button>
        </div>
    </dialog>

    <dialog id="dlg-lanche">
        <button class="dlg-fechar" data-acao="fechar">✕</button>
        <h3 id="lanche-titulo">Quem vai levar?</h3>
        <form data-form="lanche-nome" class="dlg-bloco">
            <input type="hidden" name="data"><input type="hidden" name="id"><input type="hidden" name="produto">
            <label>Participante
                <select name="nome" required>
                    <option value="">Selecione…</option>
                    ${D.participantes.map(n => `<option>${h(n)}</option>`).join('')}
                </select>
            </label>
            <p class="dica">Falta alguém? Inclua em ⚙️ Ajustes → Sexta-feira → Participantes do café.</p>
            <button class="btn verde">Confirmar</button>
        </form>
    </dialog>`;
}

function telaMilitares() {
    const hoje = R.hoje();
    const fora = D.militares.filter(m => !D.ativos.includes(m));
    const temHistorico = Object.values(D.registros).some(r => r.status !== 'previsto');
    let inicio = R.addDias(hoje, 1);
    while (!R.eDiaUtil(inicio, D.feriados)) inicio = R.addDias(inicio, 1);

    const cards = D.ativos.map(m => {
        const afs = D.afastamentos.filter(a => a.militar_id === m.id && a.fim >= hoje).sort((a, b) => a.inicio.localeCompare(b.inicio));
        const agoraAf = R.afastamentoEm(afs, hoje);
        const tel = !m.telefone ? '<span class="alerta">⚠ sem WhatsApp</span>'
            : R.telefoneValido(m.telefone) ? '📱 ' + h(m.telefone) : `<span class="alerta">⚠ número incompleto (${h(m.telefone)})</span>`;
        return `<div class="card militar ${agoraAf ? 'afastado' : ''}">
            <div class="militar-topo">${avatar(m, 'medio')}<div><b>${h(R.nome(m))}</b><small>${tel}</small></div></div>
            ${m.data_inclusao > hoje ? `<span class="selo">Entra em ${R.dataBr(m.data_inclusao)}</span>` : ''}
            ${afs.map(a => {
                const emCurso = a.inicio <= hoje;
                return `<div class="afast ${emCurso ? 'ativo' : ''}">
                    <span>${R.ICONES_AFAST[a.tipo] || '📌'} ${R.TIPOS_AFAST[a.tipo] || 'Afastado'} ${a.inicio === a.fim ? 'em ' + R.diaMes(a.inicio) : R.diaMes(a.inicio) + ' a ' + R.diaMes(a.fim)}</span>
                    ${emCurso
                        ? `<button class="link" data-acao="afast-encerrar" data-id="${h(a.id)}" data-confirm="Encerrar: ele voltou hoje?">voltou</button>`
                        : `<button class="link" data-acao="afast-excluir" data-id="${h(a.id)}" data-confirm="Cancelar este afastamento?">cancelar</button>`}
                </div>`;
            }).join('')}
            <div class="militar-acoes">
                <button class="btn claro" data-acao="abrir-afastar" data-id="${h(m.id)}">🏖 Afastar</button>
                <button class="btn claro" data-acao="editar-militar" data-id="${h(m.id)}">✏️ Editar</button>
            </div>
        </div>`;
    }).join('');

    const foraHtml = fora.length ? `<details class="card"><summary><b>Fora da escala (${fora.length})</b></summary>
        ${fora.map(m => `<div class="linha-fora">${avatar(m)} <span>${h(R.nome(m))} <small class="muted">desde ${R.dataBr(m.data_desligamento)}</small></span>
            <button class="btn claro" data-acao="militar-reativar" data-id="${h(m.id)}">Reincluir</button></div>`).join('')}
    </details>` : '';

    const filaInicial = D.ativos.length ? `<details class="card" ${temHistorico ? '' : 'open'}>
        <summary><b>🔢 Montar fila inicial</b> <span class="muted">— quem traz primeiro, segundo…</span></summary>
        ${temHistorico ? '<p class="alerta">Atenção: montar a fila de novo apaga o histórico.</p>' : ''}
        <p class="dica" style="margin:0 0 10px">💡 A data de início pode ser no passado. Ex.: se o Sgt A trouxe ontem e o Sgt B hoje,
            coloque A em 1º, B em 2º e comece <b>ontem</b>: os dois ficam registrados e vão para o fim da fila.</p>
        <form data-form="fila-inicial" data-confirm="Montar a fila e começar a escala?">
            <ol class="fila-inicial" id="fila-inicial">
                ${D.ativos.map(m => `<li draggable="true" data-id="${h(m.id)}"><span class="arrastar">☰</span> ${avatar(m)} ${h(R.nome(m))}
                    <span class="setas"><button type="button" class="link" data-mover="-1">▲</button><button type="button" class="link" data-mover="1">▼</button></span></li>`).join('')}
            </ol>
            <div class="acoes"><label class="inline">Começa em <input type="date" name="inicio" value="${inicio}"></label>
                <button class="btn verde">Montar fila</button></div>
        </form>
    </details>` : '';

    return `<div class="cabecalho"><h2>${D.ativos.length} militares na escala</h2>
        <button class="btn verde" data-acao="editar-militar" data-id="">+ Incluir militar</button></div>
    <div class="cards-militares">${cards}</div>
    ${foraHtml}${filaInicial}

    <dialog id="dlg-militar">
        <button class="dlg-fechar" data-acao="fechar">✕</button>
        <h3 id="militar-titulo">Incluir militar</h3>
        <form data-form="militar-salvar" class="dlg-bloco">
            <input type="hidden" name="id">
            <div class="duas">
                <label>Posto/Grad <input name="posto" list="postos" required>
                    <datalist id="postos">${['S Ten', '1º Sgt', '2º Sgt', '3º Sgt', 'Cb', 'Sd', 'Asp', '2º Ten', '1º Ten', 'Cap', 'Civil'].map(p => `<option value="${p}">`).join('')}</datalist>
                </label>
                <label>Nome de guerra <input name="nome" required></label>
            </div>
            <label>WhatsApp (DDD + número) <input name="telefone" inputmode="tel" placeholder="(61) 99999-9999"></label>
            <details class="avancado"><summary>Opções avançadas</summary>
                <div class="duas">
                    <label>Entra na escala em <input type="date" name="data_inclusao"></label>
                    <label>Folga inicial <input type="number" min="0" name="folga_inicial"></label>
                </div>
                <p class="dica">Militar novo entra com folga 0, no fim da fila.</p>
            </details>
            <button class="btn verde">Salvar</button>
        </form>
        <div class="dlg-rodape" id="militar-rodape">
            <button class="btn claro" data-acao="militar-desligar" data-id="" data-confirm="Retirar da escala a partir de hoje?">🚪 Retirar da escala</button>
            <button class="btn claro perigo" data-acao="militar-excluir" data-id="" data-confirm="Excluir definitivamente? (só funciona se ele ainda não tiver histórico)">🗑 Excluir</button>
        </div>
    </dialog>

    <dialog id="dlg-afastar">
        <button class="dlg-fechar" data-acao="fechar">✕</button>
        <h3>Afastar <span id="afastar-nome"></span></h3>
        <form data-form="afast-salvar" class="dlg-bloco">
            <input type="hidden" name="militar_id">
            <div class="chips">${Object.entries(R.TIPOS_AFAST).map(([k, v], i) =>
                `<label class="chip"><input type="radio" name="tipo" value="${k}" ${i ? '' : 'checked'}><span>${R.ICONES_AFAST[k]} ${v}</span></label>`).join('')}</div>
            <div class="duas">
                <label>De <input type="date" name="inicio" required value="${hoje}"></label>
                <label>Até <input type="date" name="fim" required value="${hoje}"></label>
            </div>
            <label>Observação (opcional) <input name="obs" maxlength="200"></label>
            <p class="dica">Enquanto estiver fora, não é escalado e a folga fica congelada.</p>
            <button class="btn verde">Confirmar</button>
        </form>
    </dialog>`;
}

function telaHistorico() {
    const hoje = R.hoje();
    const meses = [...new Set(Object.keys(D.registros).filter(d => d <= hoje).map(d => d.slice(0, 7)))].sort().reverse();
    if (!meses.includes(mesHistorico)) meses.unshift(mesHistorico);
    const rotMes = m => R.MESES[Number(m.slice(5))].replace(/^./, c => c.toUpperCase()) + '/' + m.slice(0, 4);
    const dias = Object.entries(D.registros).filter(([d]) => d.startsWith(mesHistorico) && d <= hoje).sort(([a], [b]) => b.localeCompare(a));

    const totais = {};
    for (const [d, r] of Object.entries(D.registros)) {
        if (!r.militar_id || d > hoje) continue;
        totais[r.militar_id] ||= { t: 0, f: 0 };
        if (r.status === 'trouxe') totais[r.militar_id].t++;
        if (r.status === 'faltou') totais[r.militar_id].f++;
    }

    const linhas = dias.map(([d, r]) => {
        const m = D.porId[r.militar_id];
        return `<tr>
            <td class="nowrap">${R.diaCurto(d)}</td>
            <td>${r.status === 'sem_pao' ? '<i>—</i>' : `<span class="quem">${avatar(m)} ${h(R.nome(m))}</span>`}
                ${r.fixo && r.status !== 'sem_pao' ? '<span class="tag">designado</span>' : ''}</td>
            <td><select data-mudar="dia-status" data-data="${d}" class="st-${r.status}">
                ${Object.entries(R.STATUS).filter(([k]) => !(k === 'previsto' && d < hoje)).map(([k, v]) => `<option value="${k}" ${k === r.status ? 'selected' : ''}>${v}</option>`).join('')}
            </select></td>
            <td><input data-mudar="obs" data-data="${d}" value="${h(r.obs)}" maxlength="200" placeholder="—"></td>
            <td><details class="menu-linha"><summary>⋯</summary><div>
                <form data-form="dia-corrigir" data-data="${d}">
                    <select name="militar_id" required><option value="">Quem trouxe de fato…</option>
                        ${D.ativos.map(a => `<option value="${h(a.id)}">${h(R.nome(a))}</option>`).join('')}</select>
                    <button class="btn claro">Corrigir</button>
                </form>
                <button class="btn claro" data-acao="dia-automatico" data-data="${d}" data-confirm="Apagar o registro e recalcular este dia automaticamente?">Recalcular automático</button>
            </div></details></td>
        </tr>`;
    }).join('');

    return `<section class="card">
        <div class="cabecalho"><h3>Histórico de ${rotMes(mesHistorico)}</h3>
            <select data-mudar="mes">${meses.map(m => `<option value="${m}" ${m === mesHistorico ? 'selected' : ''}>${rotMes(m)}</option>`).join('')}</select>
        </div>
        ${dias.length ? `<table class="tabela"><thead><tr><th>Dia</th><th>Militar</th><th>Situação</th><th>Observação</th><th></th></tr></thead><tbody>${linhas}</tbody></table>`
            : '<p class="muted">Nenhum dia registrado neste mês.</p>'}
        <p class="dica">Dias passados são marcados como “Trouxe” automaticamente. Corrija aqui se alguém não trouxe ou se houve troca não registrada; a projeção dos próximos dias se ajusta.</p>
    </section>
    <section class="card"><h3>Totais</h3>
        <table class="tabela"><thead><tr><th>Militar</th><th>Trouxe</th><th>Não trouxe</th></tr></thead><tbody>
        ${D.militares.map(m => `<tr class="${D.ativos.includes(m) ? '' : 'afastado'}"><td><span class="quem">${avatar(m)} ${h(R.nome(m))}</span></td>
            <td>${totais[m.id]?.t || 0}</td><td>${totais[m.id]?.f || ''}</td></tr>`).join('')}
        </tbody></table>
    </section>`;
}

function telaAjustes() {
    const hoje = R.hoje();
    const ano = anoAjustes;
    const dias = {};
    for (const [d, desc] of Object.entries(R.feriadosNacionais(ano))) dias[d] = { desc, tipo: D.ignorados.includes(d) ? 'ignorado' : 'nacional' };
    for (const [d, desc] of Object.entries(D.extras)) if (d.startsWith(String(ano))) dias[d] = { desc, tipo: 'extra' };
    const exemplo = { posto: '3º Sgt', nome: 'Silva' };

    const lista = Object.keys(dias).sort().map(d => {
        const f = dias[d];
        const passado = d < hoje;
        let botao = '';
        if (!passado) {
            botao = f.tipo === 'ignorado'
                ? `<button class="link" data-acao="feriado-restaurar" data-data="${d}">voltar a ser feriado</button>`
                : `<button class="link" data-acao="feriado-excluir" data-data="${d}">${f.tipo === 'extra' ? 'remover' : 'vai ter expediente'}</button>`;
        }
        return `<div class="feriado ${f.tipo} ${passado ? 'passado' : ''}">
            <div class="feriado-data"><b>${R.diaMes(d)}</b><small>${R.DIAS_CURTO[R.diaDaSemana(d)]}</small></div>
            <div class="feriado-nome">${h(f.desc)}
                ${f.tipo === 'extra' ? '<span class="selo">extra</span>' : ''}${f.tipo === 'ignorado' ? '<span class="selo cinza">com expediente</span>' : ''}</div>
            ${botao}</div>`;
    }).join('');

    return `<section class="card">
        <div class="cabecalho"><h3>🎉 Feriados de ${ano}</h3>
            <div class="acoes" style="margin:0">
                <button class="btn claro" data-acao="ano" data-ano="${ano - 1}">◀ ${ano - 1}</button>
                <button class="btn claro" data-acao="ano" data-ano="${ano + 1}">${ano + 1} ▶</button>
            </div></div>
        <p class="muted">Os feriados nacionais entram sozinhos todo ano (inclusive Carnaval, Sexta-feira Santa e Corpus Christi, que mudam de data). Nesses dias ninguém traz pão e a folga não conta.</p>
        <div class="feriados">${lista}</div>
        <form data-form="feriado-salvar" class="extra-form">
            <b>+ Outro dia sem expediente</b>
            <input type="date" name="data" required>
            <input name="descricao" placeholder="Ex.: aniversário da cidade, recesso" maxlength="100">
            <button class="btn verde">Adicionar</button>
        </form>
    </section>

    <section class="card"><h3>☕ Sexta-feira</h3>
        <p class="muted">Toda sexta é de pão, com a quantidade abaixo. Para fazer café da seção, toque na sexta no calendário (tela Hoje) e escolha “Café da seção”.</p>
        <form data-form="sexta-salvar">
            <div class="mensagens">
                <label>Pães na sexta <input type="number" name="qtd_sexta" min="0" max="99" value="${h(D.qtdSexta)}"></label>
                <label>Mensagem da lista do café (grupo) <textarea name="msg_cafe" rows="4">${h(D.cfg.msg_cafe)}</textarea></label>
                <label>Produtos do lanche (um por linha) <textarea name="produtos_lanche" rows="8">${h(D.cfg.produtos_lanche)}</textarea></label>
                <label>Participantes do café que NÃO estão na escala do pão (posto e nome, um por linha)
                    <textarea name="participantes_cafe" rows="8" placeholder="Ex.:&#10;Cap Ribeiro&#10;1º Ten Andrade&#10;Sd Araújo">${h(D.cfg.participantes_cafe)}</textarea></label>
                <p class="dica">Os ${D.ativos.length} militares da escala do pão já participam automaticamente. Total no café: <b>${D.participantes.length}</b>.</p>
                <p class="dica">Os produtos entram em cada nova sexta de café; dá para tirar ou incluir itens só naquela semana. Na mensagem do café: <code>{data}</code> <code>{lista}</code> <code>{link}</code>.</p>
            </div>
            <button class="btn verde">Salvar sexta-feira</button>
        </form>
    </section>

    <section class="card"><h3>💬 Mensagens do WhatsApp</h3>
        <form data-form="config-salvar">
            <div class="mensagens">
                <label>Lembrete do dia <textarea name="msg_dia" rows="4">${h(D.cfg.msg_dia)}</textarea>
                    <span class="previa">${h(R.mensagem(D.cfg.msg_dia, exemplo, hoje))}</span></label>
                <label>Lembrete de véspera <textarea name="msg_vespera" rows="4">${h(D.cfg.msg_vespera)}</textarea>
                    <span class="previa">${h(R.mensagem(D.cfg.msg_vespera, exemplo, R.addDias(hoje, 1)))}</span></label>
                <label>Escala da semana (grupo) <textarea name="msg_grupo" rows="4">${h(D.cfg.msg_grupo)}</textarea></label>
                <label>Nome do sistema <input name="titulo" value="${h(D.cfg.titulo)}" maxlength="60"></label>
                <label>Cabeçalho da impressão (opcional) <input name="cabecalho_impressao" value="${h(D.cfg.cabecalho_impressao)}" maxlength="80" placeholder="Ex.: 2º CGEO — Seção de Pagamento de Pessoal"></label>
            </div>
            <p class="dica">Campos automáticos: <code>{posto}</code> <code>{nome}</code> <code>{data}</code> <code>{dia_semana}</code> · no grupo: <code>{periodo}</code> <code>{lista}</code> <code>{link}</code> (link da página pública; se não usar, ele vai no final) · *texto* fica em negrito no WhatsApp.</p>
            <button class="btn verde">Salvar mensagens</button>
        </form>
    </section>

    <section class="card"><h3>💾 Cópia de segurança</h3>
        <p class="muted">Baixe um arquivo com todos os dados da escala, ou restaure a partir de um arquivo salvo.</p>
        <div class="acoes">
            <button class="btn claro" data-acao="backup-baixar">⬇ Baixar cópia</button>
            <label class="btn claro">⬆ Restaurar cópia<input type="file" accept=".json" data-mudar="backup-restaurar" hidden></label>
            <button class="btn claro perigo" data-acao="sair">🚪 Sair da conta</button>
        </div>
    </section>`;
}

function telaLogin(erro = '') {
    return `<form class="card login-card" data-form="entrar">
        <div class="emoji-grande">🥖</div>
        <h2>Escala do Pão</h2>
        <input type="email" name="email" placeholder="E-mail" autocomplete="username" required>
        <input type="password" name="senha" placeholder="Senha" autocomplete="current-password" required>
        ${erro ? `<p class="erro">${h(erro)}</p>` : ''}
        <button class="btn verde grande">Entrar</button>
        <button type="button" class="link" data-acao="recuperar-senha">Esqueci a senha</button>
    </form>`;
}

const TELAS = { hoje: telaHoje, militares: telaMilitares, historico: telaHistorico, ajustes: telaAjustes };

function render() {
    const rota = TELAS[location.hash.slice(1)] ? location.hash.slice(1) : 'hoje';
    $nav.querySelectorAll('a').forEach(a => a.classList.toggle('ativo', a.getAttribute('href') === '#' + rota));
    document.title = ({ hoje: 'Hoje', militares: 'Militares', historico: 'Histórico', ajustes: 'Ajustes' })[rota] + ' · ' + D.cfg.titulo;
    document.getElementById('marca-titulo').textContent = D.cfg.titulo;
    $main.innerHTML = TELAS[rota]();
    if (rota === 'militares') ativarFilaInicial();
}

function ativarFilaInicial() {
    const lista = document.getElementById('fila-inicial');
    if (!lista) return;
    let arrastado = null;
    lista.addEventListener('dragstart', e => { arrastado = e.target.closest('li'); arrastado.classList.add('arrastando'); });
    lista.addEventListener('dragend', () => arrastado?.classList.remove('arrastando'));
    lista.addEventListener('dragover', e => {
        e.preventDefault();
        const alvo = e.target.closest('li');
        if (!alvo || alvo === arrastado) return;
        const r = alvo.getBoundingClientRect();
        lista.insertBefore(arrastado, e.clientY > r.top + r.height / 2 ? alvo.nextSibling : alvo);
    });
    lista.addEventListener('click', e => {
        const b = e.target.closest('[data-mover]');
        if (!b) return;
        const li = b.closest('li');
        if (b.dataset.mover === '-1' && li.previousElementSibling) lista.insertBefore(li, li.previousElementSibling);
        if (b.dataset.mover === '1' && li.nextElementSibling) lista.insertBefore(li.nextElementSibling, li);
    });
}

// ---------- Ações ----------

const ACOES = {
    // Interface
    fechar: (_, el) => el.closest('dialog').close(),
    ano: ds => { anoAjustes = Number(ds.ano); render(); },
    copiar: (ds, el) => { navigator.clipboard.writeText(ds.texto); el.textContent = '✓ Copiado'; },

    'abrir-dia': ds => {
        const dlg = document.getElementById('dlg-dia');
        dlg.querySelector('#dlg-titulo').textContent = ds.rotulo;
        dlg.querySelector('[name=data]').value = ds.data;
        dlg.querySelectorAll('.dlg-rodape [data-data]').forEach(b => b.dataset.data = ds.data);
        const sel = dlg.querySelector('[name=militar_id]');
        [...sel.options].forEach(o => o.disabled = o.value === ds.militar);
        sel.value = [...sel.options].find(o => !o.disabled)?.value ?? '';
        const cafe = ds.status === 'cafe';
        dlg.querySelector('#dlg-auto').hidden = ds.fixo !== '1' || cafe;
        dlg.querySelector('#dlg-cafe').hidden = !R.eSexta(ds.data) || cafe;
        dlg.querySelector('#dlg-pao').hidden = !cafe;
        dlg.showModal();
    },
    'editar-militar': ds => {
        if (location.hash !== '#militares') {
            location.hash = '#militares';
            setTimeout(() => ACOES['editar-militar'](ds), 50);
            return;
        }
        const m = D.porId[ds.id];
        const dlg = document.getElementById('dlg-militar');
        const f = dlg.querySelector('form');
        f.reset();
        f.id.value = m?.id || '';
        f.posto.value = m?.posto || '';
        f.nome.value = m?.nome || '';
        f.telefone.value = m?.telefone || '';
        f.data_inclusao.value = m?.data_inclusao || R.hoje();
        f.folga_inicial.value = m?.folga_inicial ?? 0;
        dlg.querySelector('#militar-titulo').textContent = m ? 'Editar ' + R.nome(m) : 'Incluir militar';
        dlg.querySelector('#militar-rodape').hidden = !m;
        dlg.querySelectorAll('#militar-rodape [data-id]').forEach(b => b.dataset.id = m?.id || '');
        dlg.showModal();
    },
    'abrir-afastar': ds => {
        const dlg = document.getElementById('dlg-afastar');
        dlg.querySelector('[name=militar_id]').value = ds.id;
        dlg.querySelector('#afastar-nome').textContent = R.nome(D.porId[ds.id]);
        dlg.showModal();
    },

    // Login
    sair: async () => { await F.sair(); return null; },
    'recuperar-senha': async () => {
        const email = document.querySelector('[name=email]')?.value.trim();
        if (!email) aviso('Digite seu e-mail no campo acima e clique de novo em "Esqueci a senha".', 'erro');
        else {
            await F.recuperarSenha(email);
            aviso('Se o e-mail estiver cadastrado, chegará um link para criar nova senha.');
        }
        return null;
    },

    // Militares
    'militar-desligar': async ds => {
        const hoje = R.hoje();
        const ops = [['set', 'militares', ds.id, { ...semId(D.porId[ds.id]), data_desligamento: hoje }]];
        for (const [d, r] of Object.entries(D.registros)) {
            if (r.militar_id === ds.id && d >= hoje && r.fixo && r.status === 'previsto') ops.push(['del', 'escala', d]);
        }
        await F.emLote(ops);
        await invalidarHoje();
        return 'Militar retirado da escala a partir de hoje.';
    },
    'militar-reativar': async ds => {
        await F.salvar('militares', ds.id, { data_desligamento: null, data_inclusao: R.hoje(), folga_inicial: 0 });
        await invalidarHoje();
        return 'Militar reincluído com folga zerada.';
    },
    'militar-excluir': async ds => {
        if (Object.values(D.registros).some(r => r.militar_id === ds.id && r.status !== 'previsto')) {
            throw new Error('Este militar já tem histórico. Use "Retirar da escala" em vez de excluir.');
        }
        const ops = [['del', 'militares', ds.id]];
        for (const [d, r] of Object.entries(D.registros)) if (r.militar_id === ds.id) ops.push(['del', 'escala', d]);
        for (const a of D.afastamentos) if (a.militar_id === ds.id) ops.push(['del', 'afastamentos', a.id]);
        await F.emLote(ops);
        await invalidarHoje();
        return 'Militar excluído.';
    },

    // Afastamentos
    'afast-excluir': async ds => {
        await F.apagar('afastamentos', ds.id);
        await invalidarHoje();
        return 'Afastamento cancelado.';
    },
    'afast-encerrar': async ds => {
        const a = D.afastamentos.find(x => x.id === ds.id);
        const ontem = R.addDias(R.hoje(), -1);
        if (ontem < a.inicio) await F.apagar('afastamentos', a.id);
        else await F.salvar('afastamentos', a.id, { fim: ontem });
        await invalidarHoje();
        return 'Afastamento encerrado: o militar já conta como presente hoje.';
    },

    // Feriados
    'feriado-excluir': async ds => {
        await F.apagar('feriados_extras', ds.data);
        if (R.feriadosNacionais(Number(ds.data.slice(0, 4)))[ds.data]) await F.salvar('feriados_ignorados', ds.data, { ignorado: true });
        await invalidarHoje();
        return `Dia ${R.dataBr(ds.data)} agora tem pão normalmente.`;
    },
    'feriado-restaurar': async ds => {
        await F.apagar('feriados_ignorados', ds.data);
        await invalidarHoje();
        return `Feriado ${R.dataBr(ds.data)} voltou a valer.`;
    },

    // Dias
    'dia-status': async ds => {
        const { data, status } = ds;
        if (status === 'cafe') return ACOES['sexta-cafe'](ds);
        if (status === 'sem_pao') await F.salvar('escala', data, { militar_id: null, status: 'sem_pao', fixo: true, obs: D.registros[data]?.obs || '' });
        else await F.salvar('escala', data, { status });
        return {
            trouxe: 'Registrado: trouxe o pão. ✔',
            faltou: 'Registrado: não trouxe. Ele continua o mais folgado e será escalado no próximo dia.',
            sem_pao: 'Dia marcado como sem pão: ninguém traz e a folga de ninguém conta.',
            previsto: 'Desfeito.',
        }[status];
    },
    'dia-automatico': async ds => {
        const ops = [['del', 'escala', ds.data]];
        for (const a of D.avisos) if (a.data === ds.data) ops.push(['del', 'avisos', a.id]);
        await F.emLote(ops);
        return `Dia ${R.dataBr(ds.data)} voltou para o cálculo automático.`;
    },

    // Café de sexta
    'sexta-cafe': async ds => {
        if (!/^\d{4}-\d{2}-\d{2}$/.test(ds.data || '')) return null;
        await F.salvar('escala', ds.data, { militar_id: null, status: 'cafe', fixo: true, obs: D.registros[ds.data]?.obs || '' });
        if (!D.lanches[ds.data]) {
            const itens = Object.fromEntries(R.listaProdutos(D.cfg.produtos_lanche).map((p, i) => ['i' + String(i + 1).padStart(3, '0'), p]));
            await F.criarLanche(ds.data, itens);
        }
        return `${R.diaCurto(ds.data)} é café da seção: ninguém traz pão e a lista do lanche está aberta na página pública.`;
    },
    'sexta-pao': async ds => {
        await F.apagar('escala', ds.data);
        if (D.lanches[ds.data]) await F.apagarLanche(ds.data);
        return `${R.diaCurto(ds.data)} voltou a ser dia de pão${D.qtdSexta ? ` (${D.qtdSexta} pães)` : ''}.`;
    },
    'lanche-definir': ds => {
        const dlg = document.getElementById('dlg-lanche');
        const f = dlg.querySelector('form');
        f.data.value = ds.data;
        f.id.value = ds.id;
        f.produto.value = ds.produto;
        f.nome.value = D.participantes.includes(ds.nome) ? ds.nome : '';
        dlg.querySelector('#lanche-titulo').textContent = `Quem vai levar “${ds.produto}”?`;
        dlg.showModal();
    },
    'lanche-limpar': async ds => {
        await F.definirEscolha(ds.data, ds.id, '');
        return 'Item liberado.';
    },
    'lanche-remover': async ds => {
        await F.removerItemLanche(ds.data, ds.id);
        return 'Item tirado da lista.';
    },
};

const semId = obj => { const { id, ...resto } = obj; return resto; };

const FORMS = {
    entrar: async (v, form) => {
        try {
            await F.entrar(v.email.trim(), v.senha);
        } catch (e) {
            const msg = ['auth/invalid-credential', 'auth/wrong-password', 'auth/user-not-found', 'auth/invalid-email'].includes(e.code)
                ? 'E-mail ou senha incorretos.' : e.code === 'auth/too-many-requests' ? 'Muitas tentativas. Aguarde alguns minutos.' : 'Não foi possível entrar: ' + e.message;
            $main.innerHTML = telaLogin(msg);
            $main.querySelector('[name=email]').value = v.email;
        }
        return null;
    },

    'militar-salvar': async v => {
        const dados = {
            posto: v.posto.trim(),
            nome: v.nome.trim(),
            telefone: v.telefone.replace(/\D/g, ''),
            folga_inicial: Math.max(0, Number(v.folga_inicial) || 0),
            data_inclusao: v.data_inclusao || R.hoje(),
        };
        if (v.id) {
            await F.salvar('militares', v.id, dados);
        } else {
            const ordem = Math.max(0, ...D.militares.map(m => m.ordem)) + 1;
            await F.criar('militares', { ...dados, ordem, data_desligamento: null, criado_em: agora() });
        }
        await invalidarHoje();
        return v.id ? 'Militar atualizado.' : `${dados.posto} ${dados.nome} incluído na escala com folga ${dados.folga_inicial}.`;
    },

    'fila-inicial': async (v, form) => {
        const ids = [...form.querySelectorAll('#fila-inicial li')].map(li => li.dataset.id);
        const ops = [];
        for (const d of Object.keys(D.registros)) ops.push(['del', 'escala', d]);
        for (const a of D.avisos) ops.push(['del', 'avisos', a.id]);
        ids.forEach((id, i) => ops.push(['set', 'militares', id, { ...semId(D.porId[id]), ordem: i + 1, folga_inicial: ids.length - 1 - i, data_inclusao: v.inicio }]));
        await F.emLote(ops);
        return `Fila montada. A escala começa em ${R.dataBr(v.inicio)}.`;
    },

    'afast-salvar': async v => {
        if (!v.inicio || !v.fim || v.fim < v.inicio) throw new Error('Confira as datas: o fim não pode ser antes do início.');
        await F.criar('afastamentos', { militar_id: v.militar_id, tipo: v.tipo, inicio: v.inicio, fim: v.fim, obs: v.obs.trim() });
        await invalidarHoje();
        return 'Afastamento registrado. A escala foi recalculada.';
    },

    'feriado-salvar': async v => {
        await F.salvar('feriados_extras', v.data, { descricao: v.descricao.trim() || 'Sem expediente' });
        await F.apagar('feriados_ignorados', v.data);
        await invalidarHoje();
        return 'Dia sem expediente cadastrado.';
    },

    'config-salvar': async v => {
        const cfg = {};
        for (const k of ['titulo', 'cabecalho_impressao', 'msg_dia', 'msg_vespera', 'msg_grupo']) cfg[k] = v[k].replace(/\r\n/g, '\n').trim();
        await F.salvar('config', 'geral', cfg);
        return 'Mensagens salvas.';
    },

    'sexta-salvar': async v => {
        await F.salvar('config', 'geral', {
            qtd_sexta: Math.max(0, Math.min(99, Number(v.qtd_sexta) || 0)),
            msg_cafe: v.msg_cafe.replace(/\r\n/g, '\n').trim(),
            produtos_lanche: R.listaProdutos(v.produtos_lanche.replace(/\r\n/g, '\n')).join('\n'),
            participantes_cafe: R.listaProdutos(v.participantes_cafe.replace(/\r\n/g, '\n')).join('\n'),
        });
        return 'Configuração da sexta-feira salva.';
    },

    'dia-trocar': async v => {
        const hoje = R.hoje();
        const { data, militar_id: novo } = v;
        const sim = R.simular(dadosRegra(), R.addDias(data > hoje ? data : hoje, 120), hoje);
        const anterior = sim.dias[data]?.militar_id;
        await F.salvar('escala', data, { militar_id: novo, status: data < hoje ? 'trouxe' : 'previsto', fixo: true, obs: D.registros[data]?.obs || '' });
        let msg = `Dia ${R.dataBr(data)} designado para ${R.nome(D.porId[novo])}.`;

        // Permuta: quem estava no dia assume o próximo dia previsto do substituto
        if (v.permutar && anterior && anterior !== novo) {
            const diaDoNovo = Object.keys(sim.dias).find(d => d >= hoje && d !== data && sim.dias[d].militar_id === novo);
            if (diaDoNovo) {
                await F.salvar('escala', diaDoNovo, { militar_id: anterior, status: 'previsto', fixo: true, obs: '' });
                msg += ` Permuta: ${R.nome(D.porId[anterior])} fica com ${R.dataBr(diaDoNovo)}.`;
            }
        }
        return msg;
    },

    'dia-corrigir': async (v, form) => FORMS['dia-trocar']({ data: form.dataset.data, militar_id: v.militar_id }),

    'lanche-nome': async v => {
        await F.definirEscolha(v.data, v.id, v.nome);
        return `${v.produto}: ${v.nome}.`;
    },

    'lanche-adicionar': async (v, form) => {
        await F.adicionarItemLanche(form.dataset.data, 'i' + Date.now(), v.produto.trim());
        return `“${v.produto.trim()}” incluído na lista.`;
    },
};

const MUDANCAS = {
    mes: async el => { mesHistorico = el.value; render(); return null; },
    'dia-status': async el => ACOES['dia-status']({ data: el.dataset.data, status: el.value }),
    obs: async el => { await F.salvar('escala', el.dataset.data, { obs: el.value.trim() }); return 'Observação salva.'; },
    'backup-restaurar': async el => {
        const arq = el.files[0];
        if (!arq) return null;
        const b = JSON.parse(await arq.text());
        if (!b.escala_pao) throw new Error('Este arquivo não é uma cópia da Escala do Pão.');
        if (!confirm('Restaurar a cópia vai SUBSTITUIR todos os dados atuais. Continuar?')) return null;
        const ops = [];
        for (const c of F.COLECOES) for (const d of D.raw[c]) ops.push(['del', c, d.id]);
        for (const c of F.COLECOES) for (const d of b.dados[c] || []) ops.push(['set', c, String(d.id), semId(d)]);
        await F.emLote(ops);
        return 'Cópia restaurada.';
    },
};

// Executa uma ação com "carregando", recarrega os dados e mostra a mensagem
async function executar(fn) {
    ocupado(true);
    try {
        const msg = await fn();
        if (msg === null) return;
        document.querySelectorAll('dialog[open]').forEach(d => d.close());
        await atualizar();
        if (msg) aviso(msg);
    } catch (e) {
        console.error(e);
        aviso(e.code === 'permission-denied' ? 'Sem permissão: seu e-mail não está autorizado nas regras do Firestore.' : e.message, 'erro');
    } finally {
        ocupado(false);
    }
}

document.addEventListener('click', e => {
    // Botão do WhatsApp: registra o aviso sem atrapalhar a abertura do link
    const link = e.target.closest('[data-aviso]');
    if (link) {
        const { data, militar: militarId, aviso: tipo } = link.dataset;
        link.textContent = '✓ Avisado agora';
        link.classList.add('enviado');
        (async () => {
            // Ao avisar o militar de um dia futuro, fixa a designação para não mudar depois do aviso
            if (data > R.hoje() && !D.registros[data]) await F.salvar('escala', data, { militar_id: militarId, status: 'previsto', fixo: true, obs: '' });
            await F.criar('avisos', { data, militar_id: militarId, tipo, enviado_em: agora() });
            await recarregar();
        })().catch(console.error);
        return;
    }

    const el = e.target.closest('[data-acao]');
    if (!el) return;
    if (el.dataset.confirm && !confirm(el.dataset.confirm)) return;
    const fn = ACOES[el.dataset.acao];
    if (!fn) return;
    const r = fn({ ...el.dataset }, el);
    if (r instanceof Promise) executar(() => r);
});

document.addEventListener('submit', e => {
    const form = e.target.closest('[data-form]');
    if (!form) return;
    e.preventDefault();
    if (form.dataset.confirm && !confirm(form.dataset.confirm)) return;
    const valores = Object.fromEntries(new FormData(form));
    executar(() => FORMS[form.dataset.form](valores, form));
});

document.addEventListener('change', e => {
    const el = e.target.closest('[data-mudar]');
    if (el) executar(() => MUDANCAS[el.dataset.mudar](el));
});

// Data inicial do afastamento puxa a final junto
document.addEventListener('input', e => {
    if (e.target.name === 'inicio' && e.target.form?.dataset.form === 'afast-salvar') {
        const fim = e.target.form.fim;
        if (fim.value < e.target.value) fim.value = e.target.value;
    }
});

// Baixar cópia de segurança
ACOES['backup-baixar'] = () => {
    const conteudo = JSON.stringify({ escala_pao: 1, gerado_em: agora(), dados: D.raw }, null, 1);
    const a = document.createElement('a');
    a.href = URL.createObjectURL(new Blob([conteudo], { type: 'application/json' }));
    a.download = `escala-pao-${R.hoje()}.json`;
    a.click();
    URL.revokeObjectURL(a.href);
};

window.addEventListener('hashchange', () => D && render());

// ---------- Início ----------

if (!F.configurado) {
    $nav.hidden = true;
    document.body.classList.remove('carregando');
    $main.innerHTML = `<section class="card vazio"><div class="emoji-grande">⚙️</div><h2>Falta configurar o Firebase</h2>
        <p class="muted">Cole a configuração do app Web em <code>js/firebase-config.js</code>.</p></section>`;
} else {
    F.aoMudarLogin(async usuario => {
        if (!usuario) {
            D = null;
            $nav.hidden = true;
            document.body.classList.remove('carregando');
            $main.innerHTML = telaLogin();
            return;
        }
        $nav.hidden = false;
        document.body.classList.add('carregando');
        try {
            await atualizar();
        } catch (e) {
            console.error(e);
            $main.innerHTML = `<section class="card vazio"><div class="emoji-grande">🔒</div><h2>Sem acesso aos dados</h2>
                <p class="muted">${e.code === 'permission-denied' ? 'O e-mail ' + h(usuario.email) + ' não está autorizado nas regras do Firestore.' : h(e.message)}</p>
                <button class="btn claro" data-acao="sair">Sair</button></section>`;
        } finally {
            document.body.classList.remove('carregando');
        }
    });
}
