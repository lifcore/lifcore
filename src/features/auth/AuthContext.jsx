import { createContext, useContext, useEffect, useState } from 'react'
import { supabase } from '../../lib/supabaseClient'

const AuthContext = createContext(null)

export function AuthProvider({ children }) {
  const [user, setUser] = useState(null)
  const [perfil, setPerfil] = useState(null)
  const [carregando, setCarregando] = useState(true)

  useEffect(() => {
    // Verifica se já existe uma sessão ativa ao carregar o app
    supabase.auth.getSession().then(({ data: { session } }) => {
      setUser(session?.user ?? null)
      if (session?.user) {
        buscarPerfil(session.user.id)
      } else {
        setCarregando(false)
      }
    })

    // Escuta mudanças de login/logout em tempo real
    const { data: listener } = supabase.auth.onAuthStateChange(
      (_event, session) => {
        setUser(session?.user ?? null)
        if (session?.user) {
          buscarPerfil(session.user.id)
        } else {
          setPerfil(null)
          setCarregando(false)
        }
      }
    )

    return () => listener.subscription.unsubscribe()
  }, [])

  async function buscarPerfil(userId) {
    const { data, error } = await supabase
      .from('perfis')
      .select('*')
      .eq('id', userId)
      .single()

    if (error) {
      console.error('Erro ao buscar perfil:', error.message)
    } else {
      setPerfil(data)
    }
    setCarregando(false)
  }

  async function login(email, senha) {
    const { error } = await supabase.auth.signInWithPassword({
      email,
      password: senha,
    })
    return { error }
  }

  async function logout() {
    await supabase.auth.signOut()
  }

  return (
    <AuthContext.Provider value={{ user, perfil, carregando, login, logout }}>
      {children}
    </AuthContext.Provider>
  )
}

export function useAuth() {
  const context = useContext(AuthContext)
  if (!context) {
    throw new Error('useAuth deve ser usado dentro de um AuthProvider')
  }
  return context
}
