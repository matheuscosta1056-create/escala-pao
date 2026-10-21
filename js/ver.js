// Página pública: quem traz o pão hoje, escala da semana, lista do café de sexta e impressão

import * as R from './regras.js?v=9';
import { lerEscalaPublica, lerLanche, escolherItem, incluirExtra } from './dados-publico.js?v=9';

const $main = document.getElementById('conteudo');
const $impressao = document.getElementById('impressao');
const hoje = R.hoje();

let pub = null;
let semanas = [];   // [[dia, dia, ...], ...] agrupado por segunda-feira
let atual = 0;
let lanches = {};   // data → {itens, escolhas}
let escolhendo = null; // "data|id" do item com o campo de nome aberto

const h = s => String(s ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const segundaDe = d => R.addDias(d, 1 - (R.diaDaSemana(d) || 7));

function lembrarNome(nome) {
    try { if (nome) localStorage.setItem('pao-meu-nome', nome); return localStorage.getItem('pao-meu-nome') || ''; } catch { return ''; }
}

function aviso(msg, tipo = 'ok') {
    const el = document.getElementById('toast');
    el.textContent = msg;
    el.className = 'toast mostrar ' + tipo;
    clearTimeout(aviso.t);
    aviso.t = setTimeout(() => el.classList.remove('mostrar'), 4000);
}

// Bolinha com as 3 primeiras letras do nome de guerra (última palavra)
function avatar(nome, classe = '') {
    const guerra = nome.trim().split(/\s+/).pop().replace(/[^\p{L}]/gu, '');
    let soma = 0;
    for (const ch of guerra) soma += ch.charCodeAt(0);
    const cores = ['#2f855a', '#2b6cb0', '#c05621', '#6b46c1', '#b83280', '#2c7a7b', '#975a16', '#4a5568', '#c53030', '#276749'];
    return `<span class="avatar tres ${classe}" style="background:${cores[soma % cores.length]}">${h(guerra.slice(0, 3).toUpperCase())}</span>`;
}

function periodo(semana, extenso = false) {
    const ini = semana[0].data, fim = semana[semana.length - 1].data;
    if (!extenso) return `${R.diaMes(ini)} a ${R.diaMes(fim)}`;
    const mes = d => R.MESES[Number(d.slice(5, 7))];
    return ini.slice(5, 7) === fim.slice(5, 7)
        ? `${Number(ini.slice(8))} a ${Number(fim.slice(8))} de ${mes(fim)} de ${fim.slice(0, 4)}`
        : `${Number(ini.slice(8))} de ${mes(ini)} a ${Number(fim.slice(8))} de ${mes(fim)} de ${fim.slice(0, 4)}`;
}

function descricao(d) {
    if (d.feriado) return { texto: d.feriado, icone: '🎉', classe: 'feriado' };
    if (d.cafe) return { texto: 'Café da seção', icone: '☕', classe: 'cafe' };
    if (d.sem_pao) return { texto: 'Sem pão', icone: '🚫', classe: 'feriado' };
    if (!d.militar) return { texto: '—', icone: '', classe: 'vazio' };
    return { texto: d.militar, icone: '', classe: '' };
}

const participantes = () => pub.participantes || [];

// Só nomes cadastrados (militares da escala + participantes do café), já com o último usado neste aparelho
function selectNome() {
    const meu = lembrarNome();
    return `<select name="nome" required>
        <option value="">Quem é você?</option>
        ${participantes().map(n => `<option ${n === meu ? 'selected' : ''}>${h(n)}</option>`).join('')}
    </select>`;
}

function cartaoLanche(dia) {
    const lanche = lanches[dia.data];
    if (!lanche) return '';
    const itens = R.itensLanche(lanche, lanche.escolhas);
    const livres = itens.filter(i => !i.nome).length;
    const linhas = itens.map(i => {
        const chave = dia.data + '|' + i.id;
        let direita;
        if (i.nome) direita = `<span class="lanche-nome">✔ ${h(i.nome)}</span>`;
        else if (escolhendo === chave) {
            direita = `<form class="lanche-escolher" data-data="${dia.data}" data-id="${h(i.id)}">
                ${selectNome()}
                <button class="btn verde">Confirmar</button>
            </form>`;
        } else direita = participantes().length
            ? `<button class="btn claro" data-escolher="${chave}">Eu levo</button>`
            : '<span class="lanche-nome"><i>livre</i></span>';
        return `<div class="lanche-item ${i.nome ? 'ok' : ''}">
            <span class="lanche-produto">${h(i.produto)}${i.extra ? ' <span class="selo">extra</span>' : ''}</span>${direita}</div>`;
    }).join('');

    // Item que não está na lista
    let outro = '';
    if (participantes().length) {
        outro = escolhendo === dia.data + '|novo'
            ? `<form class="lanche-extra" data-data="${dia.data}">
                <input name="produto" placeholder="O que você vai levar?" minlength="2" maxlength="60" required>
                ${selectNome()}
                <button class="btn verde">Confirmar</button>
                <button type="button" class="btn claro" data-escolher="">Cancelar</button>
            </form>`
            : `<button class="btn claro lanche-outro" data-escolher="${dia.data}|novo">+ Vou levar outra coisa</button>`;
    }

    return `<section class="card cafe-card">
        <div class="cabecalho"><h3>☕ Café da seção — ${R.dataExtenso(dia.data)}</h3>
            <span class="selo">${livres ? `${livres} ${livres === 1 ? 'item livre' : 'itens livres'}` : 'lista completa ✔'}</span></div>
        <p class="muted">${participantes().length
            ? 'Escolha o que você vai levar: toque em “Eu levo” num item livre e selecione seu nome. Vai levar algo que não está na lista? Use “Vou levar outra coisa”. Se seu nome não aparecer, fale com o responsável pela escala.'
            : 'A lista de participantes ainda não foi publicada. Fale com o responsável pela escala.'}</p>
        <div class="lanche-lista">${linhas}</div>
        ${outro}
    </section>`;
}

function render() {
    const semana = semanas[atual];
    const dHoje = pub.dias.find(d => d.data === hoje);
    const proximo = pub.dias.find(d => d.data > hoje && d.militar);

    let destaque;
    if (dHoje?.cafe) {
        destaque = `<section class="hero cafe">
            <div class="hero-data">${R.dataExtenso(hoje)}</div>
            <div class="emoji-grande">☕</div>
            <h1>Hoje tem café da seção</h1>
        </section>`;
    } else if (dHoje?.militar) {
        destaque = `<section class="hero ${dHoje.status === 'trouxe' ? 'st-trouxe' : ''}">
            <div class="hero-data">${R.dataExtenso(hoje)}</div>
            <p class="hero-sub" style="margin:0 0 10px">Hoje quem traz o pão é</p>
            ${avatar(dHoje.militar, 'gigante')}
            <h1>${h(dHoje.militar)}</h1>
            ${dHoje.qtd ? `<p class="hero-sub"><b>${dHoje.qtd} pães</b></p>` : ''}
            ${dHoje.status === 'trouxe' ? '<p class="hero-sub">✔ já trouxe</p>' : ''}
        </section>`;
    } else {
        const motivo = dHoje?.feriado ? 'Feriado: ' + h(dHoje.feriado) : dHoje?.sem_pao ? 'Hoje é dia sem pão.' : dHoje ? '' : 'Fim de semana';
        destaque = `<section class="hero folga">
            <div class="hero-data">${R.dataExtenso(hoje)}</div>
            <h1>Hoje não tem pão</h1>
            ${motivo ? `<p>${motivo}</p>` : ''}
            ${proximo ? `<p class="hero-sub">Próximo: <b>${h(proximo.militar)}</b> — ${R.dataExtenso(proximo.data)}</p>` : ''}
        </section>`;
    }

    const linhas = semana.map(d => {
        const x = descricao(d);
        return `<div class="pub-dia ${x.classe} ${d.data === hoje ? 'hoje' : ''} ${d.data < hoje ? 'passado' : ''}">
            <div class="pub-data"><b>${R.DIAS_CURTO[R.diaDaSemana(d.data)]}</b><small>${R.diaMes(d.data)}</small></div>
            ${x.icone ? `<span class="pub-icone">${x.icone}</span>` : d.militar ? avatar(d.militar) : '<span class="pub-icone"></span>'}
            <div class="pub-nome">${h(x.texto)}${d.qtd ? ` <span class="cal-qtd">${d.qtd} pães</span>` : ''}${d.data === hoje ? ' <span class="selo">hoje</span>' : ''}</div>
            ${d.status === 'trouxe' ? '<span class="pub-ok">✔</span>' : ''}
        </div>`;
    }).join('');

    // Lista do café: a próxima sexta de café (a partir de hoje)
    const proximoCafe = pub.dias.find(d => d.cafe && d.data >= hoje);

    $main.innerHTML = `${destaque}
    ${proximoCafe ? cartaoLanche(proximoCafe) : ''}
    <section class="card">
        <div class="cabecalho">
            <h3>Semana de ${periodo(semana)}</h3>
            <div class="acoes" style="margin:0">
                <button class="btn claro" data-semana="-1" ${atual === 0 ? 'disabled' : ''} aria-label="Semana anterior">◀</button>
                <button class="btn claro" data-semana="1" ${atual === semanas.length - 1 ? 'disabled' : ''} aria-label="Próxima semana">▶</button>
                <button class="btn verde" id="btn-imprimir">🖨 Imprimir</button>
            </div>
        </div>
        <div class="pub-semana">${linhas}</div>
    </section>
    <p class="dica" style="text-align:center">
        ${pub.atualizado_em ? 'Atualizado em ' + new Date(pub.atualizado_em).toLocaleString('pt-BR', { day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit' }) + ' · ' : ''}
        <a href="./">Área do administrador</a>
    </p>`;

    // Folha impressa da semana (+ lista do café, se a semana tiver)
    const cafeDaSemana = semana.find(d => d.cafe && lanches[d.data]);
    const itensCafe = cafeDaSemana ? R.itensLanche(lanches[cafeDaSemana.data], lanches[cafeDaSemana.data].escolhas) : [];
    const linhaImpressa = d => {
        let resp, cinza = false;
        if (d.feriado) { resp = `<i>Feriado — ${h(d.feriado)}</i>`; cinza = true; }
        else if (d.sem_pao) { resp = '<i>Sem pão</i>'; cinza = true; }
        else if (d.cafe) resp = `<b>Café da seção</b>${cafeDaSemana ? '<span class="imp-obs">lista abaixo</span>' : ''}`;
        else if (d.militar) resp = `<b>${h(d.militar)}</b>${d.qtd ? `<span class="imp-obs">${d.qtd} pães</span>` : ''}`;
        else { resp = '<i>—</i>'; cinza = true; }
        const dia = R.nomeDiaSemana(d.data).replace('-feira', '').replace(/^./, c => c.toUpperCase());
        return `<tr class="${cinza ? 'imp-cinza' : ''}"><td><b>${dia}</b><span>${R.dataBr(d.data)}</span></td><td class="resp">${resp}</td><td></td></tr>`;
    };
    // Lista do café em duas colunas para caber na mesma folha
    const metade = Math.ceil(itensCafe.length / 2);
    const linhasCafe = Array.from({ length: metade }, (_, i) => {
        const a = itensCafe[i], b = itensCafe[i + metade];
        return `<tr><td>${h(a.produto)}</td><td>${h(a.nome)}</td><td>${b ? h(b.produto) : ''}</td><td>${b ? h(b.nome) : ''}</td></tr>`;
    }).join('');

    $impressao.innerHTML = `
        <div class="imp-topo">
            ${pub.cabecalho ? `<div class="imp-org">${h(pub.cabecalho)}</div>` : ''}
            <h1>${h(pub.titulo || 'Escala do Pão')}</h1>
            <div class="imp-periodo">Semana de ${periodo(semana, true)}</div>
        </div>
        <table class="imp-escala">
            <colgroup><col style="width:24%"><col><col style="width:24%"></colgroup>
            <thead><tr><th>Dia</th><th>Responsável pelo pão</th><th>Rubrica</th></tr></thead>
            <tbody>${semana.map(linhaImpressa).join('')}</tbody>
        </table>
        ${cafeDaSemana ? `<div class="imp-cafe">
            <h2>Café da seção — ${R.nomeDiaSemana(cafeDaSemana.data)}, ${R.dataBr(cafeDaSemana.data)}</h2>
            <table>
                <colgroup><col style="width:22%"><col style="width:28%"><col style="width:22%"><col style="width:28%"></colgroup>
                <thead><tr><th>Item</th><th>Quem leva</th><th>Item</th><th>Quem leva</th></tr></thead>
                <tbody>${linhasCafe}</tbody>
            </table>
        </div>` : ''}
        <div class="imp-rodape"><span>${h(pub.titulo || 'Escala do Pão')}</span><span>Impresso em ${R.dataBr(hoje)}</span></div>`;
}

async function carregarLanches() {
    const dias = pub.dias.filter(d => d.cafe && d.data >= R.addDias(hoje, -6));
    const lidos = await Promise.all(dias.map(d => lerLanche(d.data).catch(() => null)));
    lanches = Object.fromEntries(dias.map((d, i) => [d.data, lidos[i]]).filter(([, l]) => l));
}

document.addEventListener('click', e => {
    const nav = e.target.closest('[data-semana]');
    if (nav) {
        atual = Math.min(semanas.length - 1, Math.max(0, atual + Number(nav.dataset.semana)));
        render();
    }
    const escolher = e.target.closest('[data-escolher]');
    if (escolher) {
        escolhendo = escolher.dataset.escolher || null;
        render();
        document.querySelector('.lanche-extra input, .lanche-escolher select')?.focus();
    }
    if (e.target.closest('#btn-imprimir')) window.print();
});

document.addEventListener('submit', async e => {
    const form = e.target.closest('.lanche-escolher, .lanche-extra');
    if (!form) return;
    e.preventDefault();
    const nome = form.nome.value;
    if (!nome) return aviso('Selecione seu nome na lista.', 'erro');
    const extra = form.classList.contains('lanche-extra');
    const produto = extra ? form.produto.value.trim().replace(/\s+/g, ' ') : '';
    if (extra && produto.length < 2) return aviso('Escreva o que você vai levar.', 'erro');
    form.querySelectorAll('button').forEach(b => b.disabled = true);
    try {
        if (extra) await incluirExtra(form.dataset.data, R.novoIdExtra(), produto, nome);
        else await escolherItem(form.dataset.data, form.dataset.id, nome);
        lembrarNome(nome);
        aviso(extra ? `Anotado: ${produto}. Obrigado! ☕` : 'Anotado! Obrigado. ☕');
    } catch (err) {
        console.error(err);
        aviso(err.code === 'permission-denied' && !extra ? 'Esse item acabou de ser escolhido por outra pessoa. Escolha outro.' : 'Não foi possível salvar. Tente de novo.', 'erro');
    }
    escolhendo = null;
    await carregarLanches();
    render();
});

try {
    pub = await lerEscalaPublica();
    if (!pub?.dias?.length) {
        $main.innerHTML = `<section class="card vazio"><div class="emoji-grande">🥖</div><h2>Escala ainda não publicada</h2>
            <p class="muted">Ela aparece aqui assim que o administrador abrir o sistema.</p></section>`;
    } else {
        const grupos = {};
        for (const d of pub.dias) (grupos[segundaDe(d.data)] ||= []).push(d);
        semanas = Object.keys(grupos).sort().map(k => grupos[k]);
        // Semana atual; no fim de semana, já mostra a próxima
        const alvo = [6, 0].includes(R.diaDaSemana(hoje)) ? R.addDias(segundaDe(hoje), 7) : segundaDe(hoje);
        atual = Math.max(0, semanas.findIndex(s => s[0].data === alvo));
        await carregarLanches();
        render();
        if (new URLSearchParams(location.search).has('imprimir')) setTimeout(() => window.print(), 400);
    }
} catch (e) {
    console.error(e);
    $main.innerHTML = `<section class="card vazio"><div class="emoji-grande">⚠️</div><h2>Não foi possível carregar a escala</h2>
        <p class="muted">Tente de novo em alguns instantes.</p></section>`;
} finally {
    document.body.classList.remove('carregando');
}
