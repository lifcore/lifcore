/**
 * Renderiza **negrito** de markdown como <strong> de verdade. Quebra de
 * linha (\n) já é tratada via CSS (white-space: pre-wrap) na bolha do
 * chat, então aqui só precisamos cuidar do negrito.
 */
export function renderizarTextoComMarkdown(texto) {
  if (!texto) return null
  const partes = texto.split(/(\*\*[^*]+\*\*)/g)
  return partes.map((parte, i) => {
    if (parte.startsWith('**') && parte.endsWith('**') && parte.length > 4) {
      return <strong key={i}>{parte.slice(2, -2)}</strong>
    }
    return parte
  })
}
