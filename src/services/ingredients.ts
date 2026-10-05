import { dataStore } from './dataStore'

export interface Ingredient {
  id: number
  name: string
  category: string
  unit: string
  stock: number
  price: number
  active: boolean
  baseline?: number
}

export interface RecipeIngredient {
  ingredientId: number
  qty: number
}

export const INGREDIENTS_KEY = 'pos_v2_ingredients'
export const INGREDIENT_CATEGORIES_KEY = 'pos_v2_ingredient_categories'
export const INGREDIENT_RECIPES_KEY = 'pos_v2_ingredient_recipes'

export const DEFAULT_UNITS = ['кг', 'гр', 'л', 'мл', 'шт', 'уп', 'порц']

export function loadIngredients(): Ingredient[] {
  try {
    const r = dataStore.getItem(INGREDIENTS_KEY)
    if (!r) return []
    const parsed = JSON.parse(r)
    if (!Array.isArray(parsed)) return []
    return parsed.filter((g: any) => g && typeof g === 'object' && g.name)
  } catch { return [] }
}

export function saveIngredients(list: Ingredient[]) {
  dataStore.setItem(INGREDIENTS_KEY, JSON.stringify(list))
}

export function loadIngredientCategories(): string[] {
  try {
    const raw = dataStore.getItem(INGREDIENT_CATEGORIES_KEY)
    const list = raw ? JSON.parse(raw) : []
    return Array.isArray(list) ? list : []
  } catch { return [] }
}

export function saveIngredientCategories(list: string[]) {
  dataStore.setItem(INGREDIENT_CATEGORIES_KEY, JSON.stringify(list))
}

export function loadRecipes(): Record<string, RecipeIngredient[]> {
  try {
    const raw = dataStore.getItem(INGREDIENT_RECIPES_KEY)
    return raw ? JSON.parse(raw) : {}
  } catch { return {} }
}

export function saveRecipes(recipes: Record<string, RecipeIngredient[]>) {
  dataStore.setItem(INGREDIENT_RECIPES_KEY, JSON.stringify(recipes))
}

export interface DeductItem {
  mxik?: string
  goodsId?: number
  quantity: number
  menuItem?: { mxik?: string }
}

export function deductIngredientStock(items: DeductItem[]) {
  const ingredients = loadIngredients()
  if (ingredients.length === 0) return
  const recipes = loadRecipes()
  let changed = false
  const byId = new Map(ingredients.map(i => [i.id, i]))
  for (const item of items) {
    const mxik = item.mxik || item.menuItem?.mxik
    const recipe = (mxik && recipes[mxik]) || (item.goodsId ? recipes[String(item.goodsId)] : undefined)
    if (!recipe || !item.quantity) continue
    for (const r of recipe) {
      const ing = byId.get(r.ingredientId)
      if (!ing) continue
      const deduct = (r.qty || 0) * item.quantity
      if (deduct <= 0) continue
      ing.stock = Math.max(0, Math.round((ing.stock - deduct) * 1000) / 1000)
      changed = true
    }
  }
  if (changed) saveIngredients(ingredients)
}

export function ingredientStatus(ing: Ingredient, lowPercent = 0.25): 'active' | 'low' | 'out' | 'inactive' {
  if (!ing.active) return 'inactive'
  if (ing.stock <= 0) return 'out'
  const baseline = ing.baseline && ing.baseline > 0 ? ing.baseline : 1
  if (ing.stock <= baseline * lowPercent) return 'low'
  return 'active'
}