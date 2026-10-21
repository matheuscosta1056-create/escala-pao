// Rodar: npm test
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { simular, pendentesParaGravar, feriados, pascoa, feriadosNacionais, linkWhats, telefoneValido, resumoPublico, mensagem, listaProdutos, itensLanche, textoLanche, participantesCafe, faltamEscolher } from '../js/regras.js';

const NOMES = ['Silva', 'Souza', 'Costa', 'Lima', 'Pereira', 'Almeida', 'Rocha', 'Gomes', 'Ribeiro', 'Martins', 'Carvalho', 'Araujo', 'Melo', 'Barbosa', 'Teixeira'];
const HOJE = '2026-10-20';

// 15 militares, fila começando em 13/10, Lima de férias de 21 a 31/10, histórico gravado até hoje
function cenario() {
    const dados = {
        militares: NOMES.map((n, i) => ({ id: 'm' + (i + 1), posto: '3º Sgt', nome: n, telefone: '', ordem: i + 1, folga_inicial: 14 - i, data_inclusao: '2026-10-13', data_desligamento: null, criado_em: '2026-10-13T10:00:0' + i })),
        afastamentos: [{ id: 'a1', militar_id: 'm4', tipo: 'ferias', inicio: '2026-10-21', fim: '2026-10-31' }],
        feriados: feriados(2026, 2027),
        registros: {},
    };
    gravar(dados);
    return dados;
}

function gravar(dados, dia = HOJE) {
    for (const p of pendentesParaGravar(dados, dia)) {
        dados.registros[p.data] ||= { militar_id: p.militar_id, status: p.status, fixo: false, obs: '' };
    }
}

const nomeDe = (dados, id) => dados.militares.find(m => m.id === id)?.nome ?? null;
function escala(dados, de, n = 12) {
    const sim = simular(dados, '2027-03-01', HOJE);
    return Object.entries(sim.dias).filter(([d]) => d >= de).slice(0, n).map(([d, x]) => `${d.slice(8)}/${d.slice(5, 7)} ${x.status === 'sem_pao' ? 'SEM PÃO' : nomeDe(dados, x.militar_id)}`);
}

test('histórico gravado segue a fila inicial', () => {
    const dados = cenario();
    assert.deepEqual(Object.entries(dados.registros).map(([d, r]) => `${d.slice(8)} ${nomeDe(dados, r.militar_id)} ${r.status}`),
        ['13 Silva trouxe', '14 Souza trouxe', '15 Costa trouxe', '16 Lima trouxe', '19 Pereira trouxe', '20 Almeida previsto']);
});

test('projeção igual à versão PHP (Lima de férias, Finados pulado)', () => {
    const dados = cenario();
    assert.deepEqual(escala(dados, '2026-10-21', 14), [
        '21/10 Rocha', '22/10 Gomes', '23/10 Ribeiro', '26/10 Martins', '27/10 Carvalho', '28/10 Araujo', '29/10 Melo',
        '30/10 Barbosa', '03/11 Teixeira', '04/11 Silva', '05/11 Souza', '06/11 Costa', '09/11 Pereira', '10/11 Almeida',
    ]);
    const sim = simular(dados, '2027-01-01', HOJE);
    assert.equal(sim.dias['2026-10-21'].folga, 14, 'quem traz em seguida tem 14 folgas');
    assert.equal(sim.dias['2026-11-09'].folga, 13, 'com Lima fora, o ciclo é de 14 pessoas');
});

test('afastado fica com a folga congelada e retoma o lugar', () => {
    const dados = cenario();
    const antes = simular(dados, '2027-01-01', '2026-10-20').estado.m4.folga;
    const durante = simular(dados, '2027-01-01', '2026-10-30').estado.m4.folga;
    assert.equal(antes, 2);
    assert.equal(durante, 2);
    assert.ok(!escala(dados, '2026-10-21', 9).some(l => l.includes('Lima')), 'não é escalado nas férias');
});

test('"não trouxe" passa o mesmo militar para o próximo dia', () => {
    const dados = cenario();
    dados.registros[HOJE].status = 'faltou';
    assert.deepEqual(escala(dados, '2026-10-21', 3), ['21/10 Almeida', '22/10 Rocha', '23/10 Gomes']);
});

test('troca com permuta hoje: quem saiu assume o dia de quem entrou, sem aparecer duas vezes', () => {
    const dados = cenario();
    dados.registros[HOJE] = { militar_id: 'm8', status: 'previsto', fixo: true, obs: '' };       // Gomes hoje
    dados.registros['2026-10-22'] = { militar_id: 'm6', status: 'previsto', fixo: true, obs: '' }; // Almeida no dia do Gomes
    assert.deepEqual(escala(dados, HOJE, 4), ['20/10 Gomes', '21/10 Rocha', '22/10 Almeida', '23/10 Ribeiro']);
});

test('troca futura com permuta', () => {
    const dados = cenario();
    dados.registros['2026-10-23'] = { militar_id: 'm10', status: 'previsto', fixo: true, obs: '' }; // Martins
    dados.registros['2026-10-26'] = { militar_id: 'm9', status: 'previsto', fixo: true, obs: '' };  // Ribeiro
    assert.deepEqual(escala(dados, '2026-10-22', 4), ['22/10 Gomes', '23/10 Martins', '26/10 Ribeiro', '27/10 Carvalho']);
});

test('militar novo entra no fim da fila (atrás de quem trouxe ontem)', () => {
    const dados = cenario();
    dados.militares.push({ id: 'novo', posto: 'Cb', nome: 'Novato', telefone: '', ordem: 16, folga_inicial: 0, data_inclusao: HOJE, data_desligamento: null, criado_em: '2026-10-20T20:00' });
    const lista = escala(dados, '2026-10-21', 30);
    const pos = n => lista.findIndex(l => l.endsWith(n));
    assert.ok(pos('Pereira') < pos('Novato'), lista.join(', '));
    assert.ok(pos('Novato') < pos('Lima'), 'Lima volta das férias com folga congelada baixa');
});

test('dia "sem pão" não conta folga para ninguém', () => {
    const dados = cenario();
    dados.registros['2026-10-21'] = { militar_id: null, status: 'sem_pao', fixo: true, obs: '' };
    const sim = simular(dados, '2027-01-01', HOJE);
    assert.equal(sim.dias['2026-10-22'].militar_id, 'm7');
    assert.equal(sim.dias['2026-10-22'].folga, 14);
});

test('militar retirado da escala deixa de ser escalado', () => {
    const dados = cenario();
    dados.militares.find(m => m.id === 'm7').data_desligamento = '2026-10-21';
    assert.ok(!escala(dados, '2026-10-21', 20).some(l => l.endsWith('Rocha')));
});

test('feriados nacionais calculados (datas móveis)', () => {
    assert.equal(pascoa(2026), '2026-04-05');
    assert.equal(pascoa(2027), '2027-03-28');
    const f = feriadosNacionais(2026);
    assert.equal(f['2026-02-16'], 'Carnaval');
    assert.equal(f['2026-04-03'], 'Sexta-feira Santa');
    assert.equal(f['2026-06-04'], 'Corpus Christi');
    assert.equal(Object.keys(f).length, 13);
    const comExpediente = feriados(2026, 2026, ['2026-02-16'], { '2026-03-19': 'Aniversário da cidade' });
    assert.ok(!('2026-02-16' in comExpediente));
    assert.equal(comExpediente['2026-03-19'], 'Aniversário da cidade');
});

test('resumo público: semanas inteiras, feriados e sem telefone', () => {
    const dados = cenario();
    const dias = resumoPublico(dados, HOJE, 6);
    assert.equal(dias[0].data, '2026-10-19', 'começa na segunda-feira da semana');
    assert.equal(dias.length, 30, '6 semanas de seg a sex');
    assert.deepEqual(dias.find(d => d.data === '2026-10-20'), { data: '2026-10-20', militar: '3º Sgt Almeida', status: 'previsto' });
    assert.deepEqual(dias.find(d => d.data === '2026-11-02'), { data: '2026-11-02', feriado: 'Finados' });
    assert.ok(!JSON.stringify(dias).includes('telefone'));
    const sabado = resumoPublico(dados, '2026-10-24', 1);
    assert.equal(sabado[0].data, '2026-10-19', 'no sábado ainda mostra a semana corrente');
});

test('sexta de café: ninguém traz e a folga não conta', () => {
    const dados = cenario();
    const sexta = '2026-10-23';
    const antes = simular(dados, '2027-01-01', HOJE).dias;
    dados.registros[sexta] = { militar_id: null, status: 'cafe', fixo: true, obs: '' };
    const sim = simular(dados, '2027-01-01', HOJE);
    assert.equal(sim.dias[sexta].status, 'cafe');
    assert.equal(sim.dias[sexta].militar_id, null);
    assert.equal(sim.dias['2026-10-26'].militar_id, antes[sexta].militar_id, 'quem seria da sexta passa para segunda');
    assert.equal(sim.dias['2026-10-26'].folga, antes[sexta].folga, 'sem somar folga no café');
    assert.deepEqual(resumoPublico(dados, HOJE, 1, 10).find(d => d.data === sexta), { data: sexta, cafe: true });
});

test('sexta de pão: resumo e lembrete levam a quantidade', () => {
    const dados = cenario();
    const sexta = resumoPublico(dados, HOJE, 1, 10).find(d => d.data === '2026-10-23');
    assert.equal(sexta.qtd, 10);
    assert.equal(resumoPublico(dados, HOJE, 1, 10).find(d => d.data === '2026-10-22').qtd, undefined);
    const m = { posto: '3º Sgt', nome: 'Gomes' };
    assert.match(mensagem('Oi {nome}', m, '2026-10-23', 10), /Oi Gomes\n🥖 Sexta-feira: são 10 pães\./);
    assert.equal(mensagem('Traga {qtd} pães, {nome}', m, '2026-10-23', 10), 'Traga 10 pães, Gomes');
    assert.equal(mensagem('Oi {nome}', m, '2026-10-22', 10), 'Oi Gomes', 'outros dias não mudam');
});

test('lista do lanche', () => {
    assert.deepEqual(listaProdutos(' Pão \n\nSuco\n'), ['Pão', 'Suco']);
    const itens = itensLanche({ itens: { i002: 'Suco', i001: 'Pão', i1730000000000: 'Bolo' } }, { i002: { nome: 'Cb Novato' } });
    assert.deepEqual(itens.map(i => i.produto), ['Pão', 'Suco', 'Bolo']);
    assert.equal(textoLanche('☕ {data}\n{lista}\n{link}', '2026-10-23', itens, 'http://x'),
        '☕ Sex 23/10\n• Pão — _(livre)_\n• Suco — Cb Novato\n• Bolo — _(livre)_\nhttp://x');
});

test('participantes do café: escala do pão + extras, sem repetir', () => {
    const mil = [{ posto: 'S Ten', nome: 'Neto' }, { posto: '2º Sgt', nome: 'Matheus' }];
    const p = participantesCafe(mil, 'Cap Ribeiro\n s ten  neto \n\nSd Araújo');
    assert.deepEqual(p, ['S Ten Neto', '2º Sgt Matheus', 'Cap Ribeiro', 'Sd Araújo']);
    const itens = [{ produto: 'Bolo', nome: 'sd araujo' }, { produto: 'Suco', nome: '' }];
    assert.deepEqual(faltamEscolher(p, itens), ['S Ten Neto', '2º Sgt Matheus', 'Cap Ribeiro'], 'ignora acento e maiúscula');
});

test('link do WhatsApp', () => {
    assert.equal(linkWhats('(61) 98166-2045', 'Oi pão'), 'https://wa.me/5561981662045?text=Oi%20p%C3%A3o');
    assert.ok(telefoneValido('61981662045'));
    assert.ok(!telefoneValido('619999999'), '9 dígitos é inválido');
});
