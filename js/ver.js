// Página pública: quem traz o pão hoje + escala da semana, com impressão

import * as R from './regras.js?v=3';
import { lerEscalaPublica } from './dados-publico.js?v=3';

const $main = document.getElementById('conteudo');
const $impressao = document.getElementById('impressao');
const hoje = R.hoje();

let pub = null;
let semanas = [];   // [[dia, dia, ...], ...] agrupado por segunda-feira
let atual = 0;

const h = s => String(s ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const segundaDe = d => R.addDias(d, 1 - (R.diaDaSemana(d) || 7));

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
    if (d.sem_pao) return { texto: 'Sem pão', icone: '🚫', classe: 'feriado' };
    if (!d.militar) return { texto: '—', icone: '', classe: 'vazio' };
    return { texto: d.militar, icone: '', classe: '' };
}

function render() {
    const semana = semanas[atual];
    const dHoje = pub.dias.find(d => d.data === hoje);
    const proximo = pub.dias.find(d => d.data > hoje && d.militar);

    let destaque;
    if (dHoje?.militar) {
        destaque = `<section class="hero ${dHoje.status === 'trouxe' ? 'st-trouxe' : ''}">
            <div class="hero-data">${R.dataExtenso(hoje)}</div>
            <p class="hero-sub" style="margin:0 0 10px">Hoje quem traz o pão é</p>
            ${avatar(dHoje.militar, 'gigante')}
            <h1>${h(dHoje.militar)}</h1>
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
            <div class="pub-nome">${h(x.texto)}${d.data === hoje ? ' <span class="selo">hoje</span>' : ''}</div>
            ${d.status === 'trouxe' ? '<span class="pub-ok">✔</span>' : ''}
        </div>`;
    }).join('');

    $main.innerHTML = `${destaque}
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

    $impressao.innerHTML = `
        <h1>🥖 ${h(pub.titulo || 'Escala do Pão')}</h1>
        <h2>Semana de ${periodo(semana, true)}</h2>
        <table>
            <thead><tr><th>Dia</th><th>Data</th><th>Quem traz o pão</th><th>Visto</th></tr></thead>
            <tbody>${semana.map(d => {
                const x = descricao(d);
                return `<tr class="${x.classe}"><td>${R.nomeDiaSemana(d.data).replace(/^./, c => c.toUpperCase())}</td>
                    <td>${R.dataBr(d.data)}</td><td>${x.icone ? x.icone + ' ' : ''}${h(x.texto)}</td><td></td></tr>`;
            }).join('')}</tbody>
        </table>
        <p class="rodape-impressao">Impresso em ${R.dataBr(hoje)}</p>`;
}

document.addEventListener('click', e => {
    const nav = e.target.closest('[data-semana]');
    if (nav) {
        atual = Math.min(semanas.length - 1, Math.max(0, atual + Number(nav.dataset.semana)));
        render();
    }
    if (e.target.closest('#btn-imprimir')) window.print();
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
