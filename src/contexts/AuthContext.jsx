import { createContext, useContext, useEffect, useState, useMemo } from 'react'
import { supabase } from '../lib/supabase'

const AuthContext = createContext({})

export const useAuth = () => {
  const context = useContext(AuthContext)
  if (!context) {
    throw new Error('useAuth must be used within an AuthProvider')
  }
  return context
}

export const AuthProvider = ({ children }) => {
  const [user, setUser] = useState(null)
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    // Check active session - keep loading true until this completes
    supabase.auth.getSession().then(({ data: { session } }) => {
      setUser(session?.user ?? null)
      setLoading(false) // Only set false after session check completes
    })

    // Listen for auth changes
    const {
      data: { subscription },
    } = supabase.auth.onAuthStateChange((_event, session) => {
      setUser(prevUser => {
        const newUser = session?.user ?? null
        if (!prevUser && !newUser) return prevUser
        if (prevUser?.id === newUser?.id) return prevUser
        return newUser
      })
      // Don't set loading to false here - it's already false after initial check
    })

    return () => subscription.unsubscribe()
  }, [])

  // Memoize the user object to ensure stable reference when user ID hasn't changed
  const memoizedUser = useMemo(() => {
    return user
  }, [user?.id]) // Only recreate when user ID changes, not when other properties change

  const signUp = async (email, password) => {
    const { data, error } = await supabase.auth.signUp({
      email,
      password,
    })
    return { data, error }
  }

  const signIn = async (email, password) => {
    const { data, error } = await supabase.auth.signInWithPassword({
      email,
      password,
    })
    return { data, error }
  }

  const signOut = async () => {
    await supabase.auth.signOut()
  }

  // Memoize the context value to prevent unnecessary re-renders
  // Use memoizedUser to ensure stable reference
  const value = useMemo(() => ({
    user: memoizedUser,
    loading,
    signUp,
    signIn,
    signOut,
  }), [memoizedUser, loading])

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>
}

