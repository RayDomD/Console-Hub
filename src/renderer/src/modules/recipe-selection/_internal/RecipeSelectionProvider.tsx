import { createContext, useCallback, useContext, useMemo, useState, type PropsWithChildren } from 'react'
import type { RecipeId } from '../../../../../shared/recipes'

interface RecipeSelectionContextValue {
  /** Null until the user picks one. ADR 0021: no Recipe is preselected. */
  recipe: RecipeId | null
  select: (recipe: RecipeId | null) => void
}

const RecipeSelectionContext = createContext<RecipeSelectionContextValue | null>(null)

export function RecipeSelectionProvider({ children }: PropsWithChildren): React.JSX.Element {
  const [recipe, setRecipe] = useState<RecipeId | null>(null)
  const select = useCallback((next: RecipeId | null) => setRecipe(next), [])
  const value = useMemo(() => ({ recipe, select }), [recipe, select])
  return <RecipeSelectionContext.Provider value={value}>{children}</RecipeSelectionContext.Provider>
}

export function useRecipeSelection(): RecipeSelectionContextValue {
  const value = useContext(RecipeSelectionContext)
  if (!value) throw new Error('useRecipeSelection must be used inside RecipeSelectionProvider')
  return value
}
