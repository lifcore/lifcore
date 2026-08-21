import { useState } from 'react'
import ContextoCotacaoForm from './ContextoCotacaoForm'
import SelecaoPlanosMulticalculo from './SelecaoPlanosMulticalculo'

/**
 * Sprint 3 — Painel de Cotação (Multicálculo), wizard que amarra os
 * passos já construídos: 1 (Contexto) → 5/6 (Planos + Seleção, já
 * entregues na 2D). Passos 2-4 do desenho do Chief (Operadora /
 * Produto / Características como telas próprias) NÃO foram
 * construídos como etapas separadas ainda — hoje a Biblioteca só tem
 * 1 produto (Saúde) e a seleção de operadora já acontece dentro do
 * card grid da 2D (agrupado por operadora). Criar uma etapa vazia só
 * pra "Produto" ou "Características" sem variação real pra filtrar
 * seria construir tela sem função — decisão registrada, não esquecida.
 * Revisitar quando Odonto ou outro produto entrar na Biblioteca.
 *
 * ATUALIZADO (19/08) — "Preparar comparação" virou "Criar Cotações":
 * ao confirmar a seleção, o wizard já cria as Cotações reais no Ciclo
 * Comercial existente (`multicalculoCotacaoService`), no mesmo
 * `grupo_comparacao_id`. Quem mostra o resultado é o card de Cotações
 * que já existe em `ClienteDetailPage.jsx` — por isso, ao terminar,
 * este wizard só fecha (`onConcluido`) e devolve o controle pra lá.
 *
 * ATUALIZADO (20/08) — Sprint 3 Fase 1, rascunho persistido: os dois
 * passos (`ContextoCotacaoForm` e `SelecaoPlanosMulticalculo`) agora
 * restauram e salvam sozinhos via `multicalculoRascunhoService` — este
 * componente só precisa passar `clienteProspectId` pra eles, sem
 * nenhuma lógica de rascunho aqui.
 *
 * ATUALIZADO (21/08) — `contexto` agora carrega `regiaoId` (o que o
 * motor usa de verdade pra buscar) além de `regiaoNome` (só exibição).
 * Este componente só repassa os dois adiante, sem decidir nada.
 */
export default function PainelCotacao({ clienteProspectId, onConcluido }) {
  const [contexto, setContexto] = useState(null)

  function handleCotacoesCriadas(resultado) {
    onConcluido?.(resultado)
  }

  return (
    <div className="painel-cotacao">
      {!contexto ? (
        <ContextoCotacaoForm clienteProspectId={clienteProspectId} onContinuar={setContexto} />
      ) : (
        <div>
          <button className="ls-btn ls-btn-ghost painel-cotacao-voltar" onClick={() => setContexto(null)}>
            ← Alterar contexto
          </button>
          <SelecaoPlanosMulticalculo
            clienteProspectId={clienteProspectId}
            regiaoId={contexto.regiaoId}
            regiaoNome={contexto.regiaoNome}
            faixasEtariasDasVidas={contexto.faixasEtariasDasVidas}
            onCotacoesCriadas={handleCotacoesCriadas}
          />
        </div>
      )}
    </div>
  )
}
