import { supabase } from '../supabaseClient'

const BUCKET = 'anexos'

/**
 * Faz upload de um arquivo para o Supabase Storage e retorna a URL
 * pública, além de já convertê-lo em base64 (necessário para a IA
 * conseguir "ler" a imagem/documento na mesma chamada).
 *
 * IMPORTANTE: é necessário criar o bucket "anexos" uma única vez
 * no painel do Supabase (Storage → New bucket → nome "anexos").
 */
export async function enviarAnexo(arquivo, casoIdOuTemp) {
  const extensao = arquivo.name.split('.').pop()
  const caminho = `${casoIdOuTemp}/${Date.now()}.${extensao}`

  const { error } = await supabase.storage.from(BUCKET).upload(caminho, arquivo)
  if (error) {
    throw new Error(
      `Erro ao enviar anexo (verifique se o bucket "anexos" existe no Supabase Storage): ${error.message}`
    )
  }

  // Bucket é PRIVADO (dado sensível de saúde) — geramos um link assinado
  // com validade longa, em vez de um link público permanente.
  const { data: urlAssinada, error: erroUrl } = await supabase.storage
    .from(BUCKET)
    .createSignedUrl(caminho, 60 * 60 * 24 * 365 * 5) // 5 anos

  if (erroUrl) throw new Error(`Erro ao gerar link do anexo: ${erroUrl.message}`)

  const base64 = await arquivoParaBase64(arquivo)

  return {
    nome: arquivo.name,
    url: urlAssinada.signedUrl,
    base64,
    mediaType: arquivo.type || 'application/octet-stream',
  }
}

function arquivoParaBase64(arquivo) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader()
    reader.onload = () => {
      // O resultado vem como "data:image/png;base64,XXXXX" — extraímos só o base64 puro
      const base64Puro = reader.result.split(',')[1]
      resolve(base64Puro)
    }
    reader.onerror = reject
    reader.readAsDataURL(arquivo)
  })
}
