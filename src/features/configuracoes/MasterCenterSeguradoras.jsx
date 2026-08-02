import React, { useState, useEffect, useMemo } from 'react';
import {
  listarSeguradoras,
  criarSeguradora,
  atualizarSeguradora,
  upsertConexao,
  removerConexao,
} from './seguradorasService';

const MODULOS = [
  { key: 'lifcare', label: 'Lifcare (Saúde/Odonto)' },
  { key: 'lifleet', label: 'Lifleet (Auto/Frota)' },
  { key: 'lifsure', label: 'Lifsure (Seguros Gerais)' },
  { key: 'lishield', label: 'LiShield (Seguros Técnicos)' },
  { key: 'lifplan', label: 'LifPlan (Planejamento Patrimonial)' },
];

const TIPO_CONEXAO_LABEL = { api: 'API', tabela: 'Tabela', manual: 'Manual' };
const STATUS_STYLE = {
  ativo: 'bg-emerald-100 text-emerald-800',
  pendente: 'bg-amber-100 text-amber-800',
  inativo: 'bg-slate-200 text-slate-600',
};

export default function MasterCenterSeguradoras() {
  const [seguradoras, setSeguradoras] = useState([]);
  const [busca, setBusca] = useState('');
  const [carregando, setCarregando] = useState(true);
  const [erro, setErro] = useState(null);
  const [selecionadaId, setSelecionadaId] = useState(null);
  const [criandoNova, setCriandoNova] = useState(false);

  async function carregar() {
    setCarregando(true);
    setErro(null);
    try {
      const dados = await listarSeguradoras({ busca });
      setSeguradoras(dados);
    } catch (e) {
      setErro(e.message || 'Erro ao carregar seguradoras.');
    } finally {
      setCarregando(false);
    }
  }

  useEffect(() => {
    const timeout = setTimeout(carregar, 250); // debounce da busca
    return () => clearTimeout(timeout);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [busca]);

  const selecionada = useMemo(
    () => seguradoras.find((s) => s.id === selecionadaId) || null,
    [seguradoras, selecionadaId]
  );

  function resumoConexoes(seguradora) {
    const conns = seguradora.seguradora_conexoes || [];
    if (conns.length === 0) return 'Nenhuma conexão configurada';
    const porTipo = conns.reduce((acc, c) => {
      acc[c.tipo_conexao] = (acc[c.tipo_conexao] || 0) + 1;
      return acc;
    }, {});
    const partes = Object.entries(porTipo).map(
      ([tipo, qtd]) => `${qtd} ${TIPO_CONEXAO_LABEL[tipo]}`
    );
    return `${conns.length} módulo${conns.length > 1 ? 's' : ''} · ${partes.join(', ')}`;
  }

  return (
    <div className="flex h-full min-h-[600px] gap-4">
      {/* Coluna esquerda: lista mestre */}
      <div className="w-80 shrink-0 border-r border-slate-200 pr-4">
        <div className="mb-3 flex items-center justify-between">
          <h2 className="text-lg font-semibold text-slate-800">Seguradoras/Operadoras</h2>
          <button
            onClick={() => {
              setCriandoNova(true);
              setSelecionadaId(null);
            }}
            className="rounded-md bg-slate-800 px-3 py-1.5 text-sm font-medium text-white hover:bg-slate-700"
          >
            + Nova
          </button>
        </div>

        <input
          type="text"
          value={busca}
          onChange={(e) => setBusca(e.target.value)}
          placeholder="Buscar seguradora..."
          className="mb-3 w-full rounded-md border border-slate-300 px-3 py-2 text-sm focus:border-slate-500 focus:outline-none focus:ring-1 focus:ring-slate-500"
        />

        {carregando && <p className="text-sm text-slate-500">Carregando...</p>}
        {erro && <p className="text-sm text-red-600">{erro}</p>}

        <ul className="space-y-1 overflow-y-auto">
          {seguradoras.map((s) => (
            <li key={s.id}>
              <button
                onClick={() => {
                  setSelecionadaId(s.id);
                  setCriandoNova(false);
                }}
                className={`w-full rounded-md px-3 py-2 text-left text-sm transition ${
                  selecionadaId === s.id
                    ? 'bg-slate-100 font-medium text-slate-900'
                    : 'text-slate-700 hover:bg-slate-50'
                }`}
              >
                <div>{s.nome_fantasia}</div>
                <div className="text-xs text-slate-500">{resumoConexoes(s)}</div>
              </button>
            </li>
          ))}
          {!carregando && seguradoras.length === 0 && (
            <li className="px-3 py-6 text-center text-sm text-slate-400">
              Nenhuma seguradora encontrada.
            </li>
          )}
        </ul>
      </div>

      {/* Coluna direita: detalhe */}
      <div className="flex-1 overflow-y-auto pr-1">
        {criandoNova && (
          <FormNovaSeguradora
            onCancelar={() => setCriandoNova(false)}
            onCriada={(nova) => {
              setCriandoNova(false);
              setSelecionadaId(nova.id);
              carregar();
            }}
          />
        )}

        {!criandoNova && selecionada && (
          <DetalheSeguradora
            seguradora={selecionada}
            onAtualizada={carregar}
          />
        )}

        {!criandoNova && !selecionada && (
          <div className="flex h-full items-center justify-center text-sm text-slate-400">
            Selecione uma seguradora à esquerda, ou cadastre uma nova.
          </div>
        )}
      </div>
    </div>
  );
}

function FormNovaSeguradora({ onCancelar, onCriada }) {
  const [nomeFantasia, setNomeFantasia] = useState('');
  const [razaoSocial, setRazaoSocial] = useState('');
  const [cnpj, setCnpj] = useState('');
  const [salvando, setSalvando] = useState(false);
  const [erro, setErro] = useState(null);

  async function handleSalvar(e) {
    e.preventDefault();
    setSalvando(true);
    setErro(null);
    try {
      const nova = await criarSeguradora({ nomeFantasia, razaoSocial, cnpj });
      onCriada(nova);
    } catch (e2) {
      setErro(e2.message || 'Erro ao criar seguradora.');
    } finally {
      setSalvando(false);
    }
  }

  return (
    <form onSubmit={handleSalvar} className="max-w-md space-y-3">
      <h3 className="text-base font-semibold text-slate-800">Nova seguradora</h3>
      {erro && <p className="text-sm text-red-600">{erro}</p>}
      <Campo label="Nome fantasia *">
        <input
          required
          value={nomeFantasia}
          onChange={(e) => setNomeFantasia(e.target.value)}
          className="w-full rounded-md border border-slate-300 px-2 py-1.5 text-sm focus:border-slate-500 focus:outline-none focus:ring-1 focus:ring-slate-500"
        />
      </Campo>
      <Campo label="Razão social">
        <input value={razaoSocial} onChange={(e) => setRazaoSocial(e.target.value)} className="w-full rounded-md border border-slate-300 px-2 py-1.5 text-sm focus:border-slate-500 focus:outline-none focus:ring-1 focus:ring-slate-500" />
      </Campo>
      <Campo label="CNPJ">
        <input value={cnpj} onChange={(e) => setCnpj(e.target.value)} className="w-full rounded-md border border-slate-300 px-2 py-1.5 text-sm focus:border-slate-500 focus:outline-none focus:ring-1 focus:ring-slate-500" />
      </Campo>
      <div className="flex gap-2 pt-2">
        <button
          type="submit"
          disabled={salvando}
          className="rounded-md bg-slate-800 px-4 py-2 text-sm font-medium text-white hover:bg-slate-700 disabled:opacity-50"
        >
          {salvando ? 'Salvando...' : 'Salvar'}
        </button>
        <button
          type="button"
          onClick={onCancelar}
          className="rounded-md border border-slate-300 px-4 py-2 text-sm text-slate-700 hover:bg-slate-50"
        >
          Cancelar
        </button>
      </div>
    </form>
  );
}

function DetalheSeguradora({ seguradora, onAtualizada }) {
  const conexoesPorModulo = useMemo(() => {
    const map = new Map();
    for (const c of seguradora.seguradora_conexoes || []) map.set(c.modulo, c);
    return map;
  }, [seguradora]);

  return (
    <div className="space-y-6">
      <div>
        <h3 className="text-xl font-semibold text-slate-900">{seguradora.nome_fantasia}</h3>
        {seguradora.razao_social && (
          <p className="text-sm text-slate-500">{seguradora.razao_social}</p>
        )}
        {seguradora.cnpj && <p className="text-sm text-slate-500">CNPJ: {seguradora.cnpj}</p>}
      </div>

      <div>
        <h4 className="mb-2 text-sm font-semibold uppercase tracking-wide text-slate-500">
          Conexões por módulo
        </h4>
        <div className="space-y-2">
          {MODULOS.map((m) => (
            <LinhaConexao
              key={m.key}
              modulo={m}
              conexao={conexoesPorModulo.get(m.key)}
              seguradoraId={seguradora.id}
              onAtualizada={onAtualizada}
            />
          ))}
        </div>
      </div>
    </div>
  );
}

function LinhaConexao({ modulo, conexao, seguradoraId, onAtualizada }) {
  const [editando, setEditando] = useState(false);
  const [tipoConexao, setTipoConexao] = useState(conexao?.tipo_conexao || 'manual');
  const [status, setStatus] = useState(conexao?.status || 'pendente');
  const [codigoSucursal, setCodigoSucursal] = useState(conexao?.codigo_sucursal || '');
  const [ambiente, setAmbiente] = useState(conexao?.ambiente || '');
  const [salvando, setSalvando] = useState(false);

  async function handleSalvar() {
    setSalvando(true);
    try {
      await upsertConexao({
        seguradoraId,
        modulo: modulo.key,
        tipoConexao,
        status,
        codigoSucursal: codigoSucursal || null,
        ambiente: ambiente || null,
      });
      setEditando(false);
      onAtualizada();
    } finally {
      setSalvando(false);
    }
  }

  async function handleRemover() {
    if (!conexao) return;
    setSalvando(true);
    try {
      await removerConexao(conexao.id);
      onAtualizada();
    } finally {
      setSalvando(false);
    }
  }

  if (!editando) {
    return (
      <div className="flex items-center justify-between rounded-md border border-slate-200 px-3 py-2">
        <div>
          <div className="text-sm font-medium text-slate-800">{modulo.label}</div>
          {conexao ? (
            <div className="mt-1 flex items-center gap-2 text-xs">
              <span className={`rounded px-2 py-0.5 ${STATUS_STYLE[conexao.status]}`}>
                {conexao.status}
              </span>
              <span className="text-slate-500">{TIPO_CONEXAO_LABEL[conexao.tipo_conexao]}</span>
              {conexao.codigo_sucursal && (
                <span className="text-slate-400">· sucursal {conexao.codigo_sucursal}</span>
              )}
            </div>
          ) : (
            <div className="mt-1 text-xs text-slate-400">Sem conexão configurada</div>
          )}
        </div>
        <button
          onClick={() => setEditando(true)}
          className="text-sm text-slate-600 hover:text-slate-900 hover:underline"
        >
          {conexao ? 'Editar' : 'Configurar'}
        </button>
      </div>
    );
  }

  return (
    <div className="space-y-2 rounded-md border border-slate-300 bg-slate-50 px-3 py-3">
      <div className="text-sm font-medium text-slate-800">{modulo.label}</div>
      <div className="grid grid-cols-2 gap-2">
        <Campo label="Tipo de conexão">
          <select value={tipoConexao} onChange={(e) => setTipoConexao(e.target.value)} className="w-full rounded-md border border-slate-300 px-2 py-1.5 text-sm focus:border-slate-500 focus:outline-none focus:ring-1 focus:ring-slate-500">
            <option value="manual">Manual</option>
            <option value="tabela">Tabela</option>
            <option value="api">API</option>
          </select>
        </Campo>
        <Campo label="Status">
          <select value={status} onChange={(e) => setStatus(e.target.value)} className="w-full rounded-md border border-slate-300 px-2 py-1.5 text-sm focus:border-slate-500 focus:outline-none focus:ring-1 focus:ring-slate-500">
            <option value="pendente">Pendente</option>
            <option value="ativo">Ativo</option>
            <option value="inativo">Inativo</option>
          </select>
        </Campo>
        <Campo label="Código sucursal">
          <input value={codigoSucursal} onChange={(e) => setCodigoSucursal(e.target.value)} className="w-full rounded-md border border-slate-300 px-2 py-1.5 text-sm focus:border-slate-500 focus:outline-none focus:ring-1 focus:ring-slate-500" />
        </Campo>
        <Campo label="Ambiente">
          <select value={ambiente} onChange={(e) => setAmbiente(e.target.value)} className="w-full rounded-md border border-slate-300 px-2 py-1.5 text-sm focus:border-slate-500 focus:outline-none focus:ring-1 focus:ring-slate-500">
            <option value="">—</option>
            <option value="homologacao">Homologação</option>
            <option value="producao">Produção</option>
          </select>
        </Campo>
      </div>
      <div className="flex gap-2 pt-1">
        <button
          onClick={handleSalvar}
          disabled={salvando}
          className="rounded-md bg-slate-800 px-3 py-1.5 text-xs font-medium text-white hover:bg-slate-700 disabled:opacity-50"
        >
          {salvando ? 'Salvando...' : 'Salvar'}
        </button>
        <button
          onClick={() => setEditando(false)}
          className="rounded-md border border-slate-300 px-3 py-1.5 text-xs text-slate-700 hover:bg-white"
        >
          Cancelar
        </button>
        {conexao && (
          <button
            onClick={handleRemover}
            disabled={salvando}
            className="ml-auto text-xs text-red-600 hover:underline"
          >
            Remover conexão
          </button>
        )}
      </div>
    </div>
  );
}

function Campo({ label, children }) {
  return (
    <label className="block">
      <span className="mb-1 block text-xs font-medium text-slate-600">{label}</span>
      {children}
    </label>
  );
}
