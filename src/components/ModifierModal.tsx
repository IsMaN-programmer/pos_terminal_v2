import { useState } from 'react'
import { dataStore } from '../services/dataStore'
import { useT } from '../i18n'

interface ModifierGroup {
  label: string
  options: string[]
}

interface Additive {
  id: number
  name: string
  photo?: string
  sum: number
  mxik?: string
  mxikName?: string
  unit?: string
  unitCode?: string
  marking?: boolean
  type?: string
}

export interface DishBinding {
  id: number
  name: string
  count: number
}

export interface AddonSelection {
  id: number
  name: string
  photo?: string
  price: number
  mxik?: string
  mxikName?: string
  unit?: string
  unitCode?: string
  marking?: boolean
  quantity: number
  mode: 'general' | 'dish'
  bindings?: DishBinding[]
}

export interface DishOption {
  id: number
  name: string
  quantity: number
}

const MODIFIERS_KEY = 'pos_v2_modifier_groups'

function loadModifiers(): ModifierGroup[] {
  try {
    const raw = dataStore.getItem(MODIFIERS_KEY)
    if (raw) {
      const parsed = JSON.parse(raw)
      if (Array.isArray(parsed)) return parsed
    }
  } catch {}
  return []
}

function loadAdditives(): Additive[] {
  try {
    const raw = dataStore.getItem('pos_v2_stock_goods')
    const goods: Additive[] = raw ? JSON.parse(raw) : []
    return goods.filter(g => g && g.type === 'additive' && g.name)
  } catch { return [] }
}

interface ModifierModalProps {
  initialSelected: string[]
  initialAddons?: AddonSelection[]
  dishes: DishOption[]
  onSave: (addons: AddonSelection[], selected: string[]) => void
  onCancel: () => void
}

export default function ModifierModal({ initialSelected, initialAddons = [], dishes, onSave, onCancel }: ModifierModalProps) {
  const t = useT()
  const [selected, setSelected] = useState<string[]>(initialSelected)
  const [addons, setAddons] = useState<AddonSelection[]>(initialAddons)
  const [groups] = useState<ModifierGroup[]>(() => loadModifiers().filter(g => g.label !== 'Добавка'))
  const [additives] = useState<Additive[]>(loadAdditives)

  function toggleAddon(a: Additive) {
    setAddons(prev => {
      const exists = prev.find(p => p.id === a.id)
      if (exists) return prev.filter(p => p.id !== a.id)
      return [...prev, {
        id: a.id,
        name: a.name,
        photo: a.photo,
        price: a.sum,
        mxik: a.mxik,
        mxikName: a.mxikName,
        unit: a.unit,
        unitCode: a.unitCode,
        marking: a.marking,
        quantity: 1,
        mode: 'general' as const,
      }]
    })
  }

  function changeQty(id: number, delta: number) {
    setAddons(prev => prev.map(p => {
      if (p.id !== id) return p
      return { ...p, quantity: Math.min(99, Math.max(1, p.quantity + delta)) }
    }))
  }

  function setMode(id: number, mode: 'general' | 'dish') {
    setAddons(prev => prev.map(p => {
      if (p.id !== id) return p
      return { ...p, mode }
    }))
  }

  function changeDishBinding(id: number, dishId: number, delta: number) {
    setAddons(prev => prev.map(p => {
      if (p.id !== id) return p
      const dish = dishes.find(d => d.id === dishId)
      if (!dish) return p
      const cur = p.bindings?.find(b => b.id === dishId)
      const count = Math.min(dish.quantity, Math.max(0, (cur?.count ?? 0) + delta))
      const base = p.bindings ? [...p.bindings] : []
      const idx = base.findIndex(b => b.id === dishId)
      const bindings = idx >= 0
        ? base.map(b => b.id === dishId ? { ...b, count } : b)
        : [...base, { id: dish.id, name: dish.name, count }]
      return { ...p, bindings }
    }))
  }

  function toggleMod(mod: string) {
    setSelected(prev => prev.includes(mod) ? prev.filter(m => m !== mod) : [...prev, mod])
  }

  return (
    <div className="modal-overlay" onClick={onCancel}>
      <div className="modal-content modifier-modal" onClick={e => e.stopPropagation()}>
        <h3 className="modal-title">{t('Модификаторы', 'Modifikatorlar', 'Modifiers')}</h3>

        {additives.length === 0 && groups.length === 0 && (
          <div style={{ fontSize: 14, color: '#64748b', padding: '8px 0 16px' }}>
            {t('Добавки не добавлены. Добавьте их в разделе Склад, выбрав тип: Добавка.', 'Qo\'shimchalar qo\'shilmagan. Ularni Ombor bo\'limida qo\'shing, turini tanlab: Qo\'shimcha.', 'Additives not added. Add them in the Stock section, selecting type: Additive.')}
          </div>
        )}

        {additives.length > 0 && (
          <div className="am-add-section">
            <h4 className="modifier-group-title">{t('Добавка', 'Qo\'shimcha', 'Additive')}</h4>
            <div className="am-add-list">
              {additives.map(a => {
                const cur = addons.find(p => p.id === a.id)
                const on = !!cur
                const qty = cur?.quantity || 1
                return (
                  <div key={a.id} className={`am-add-row${on ? ' on' : ''}`}>
                    <div className="am-add-info">
                      {a.photo ? (
                        <img src={a.photo} alt={a.name} className="order-product-photo" />
                      ) : (
                        <span className="order-product-fallback">{a.name.charAt(0)}</span>
                      )}
                      <div className="am-add-details">
                        <span className="am-add-name">{a.name}</span>
                        <span className="am-add-price">{a.sum.toLocaleString()} {t('сум', 'so\'m', 'sum')}</span>
                      </div>
                    </div>
                    <div className="am-add-actions">
                      <button
                        className={`am-add-toggle${on ? ' active' : ''}`}
                        title={on ? t('Убрать добавку', 'Qo\'shimchani olib tashlash', 'Remove additive') : t('Добавить', 'Qo\'shish', 'Add')}
                        onClick={() => toggleAddon(a)}
                      >
                        <span className="am-add-toggle-knob" />
                      </button>
                      <div className={`qty-controls am-add-qty${on ? ' on' : ' off'}`}>
                        <button className="qty-btn" disabled={!on} onClick={() => changeQty(a.id, -1)}>−</button>
                        <span className="qty-value">{qty}</span>
                        <button className="qty-btn" disabled={!on} onClick={() => changeQty(a.id, 1)}>+</button>
                      </div>
                      <span className="am-add-sum">{on ? (qty * a.sum).toLocaleString() : '—'}</span>
                    </div>

                    {on && (
                      <div className="am-add-sub">
                        <div className="am-mode-selector">
                          <button
                            className={`am-mode-btn${cur.mode === 'general' ? ' active' : ''}`}
                            onClick={() => setMode(a.id, 'general')}
                          >
                            {t('Общий', 'Umumiy', 'General')}
                          </button>
                          <button
                            className={`am-mode-btn${cur.mode === 'dish' ? ' active' : ''}`}
                            disabled={dishes.length === 0}
                            onClick={() => setMode(a.id, 'dish')}
                          >
                            {t('Для блюда', 'Taom uchun', 'For dish')}
                          </button>
                        </div>

                        {cur.mode === 'dish' && (
                          <div className="am-dish-list">
                            <div className="am-dish-list-title">{t('Привязать к блюдам', 'Taomlarga biriktirish', 'Link to dishes')}</div>
                            {dishes.map(d => {
                              const count = cur.bindings?.find(b => b.id === d.id)?.count ?? 0
                              return (
                                <div key={d.id} className="am-dish-row">
                                  <span className="am-dish-name">{d.name} × {d.quantity}</span>
                                  <div className="qty-controls">
                                    <button className="qty-btn" disabled={count === 0} onClick={() => changeDishBinding(a.id, d.id, -1)}>−</button>
                                    <span className="qty-value">{count}</span>
                                    <button className="qty-btn" disabled={count >= d.quantity} onClick={() => changeDishBinding(a.id, d.id, 1)}>+</button>
                                  </div>
                                </div>
                              )
                            })}
                          </div>
                        )}
                      </div>
                    )}
                  </div>
                )
              })}
            </div>
          </div>
        )}

        {groups.map(group => (
          <div key={group.label} className="modifier-group">
            <h4 className="modifier-group-title">{group.label}</h4>
            <div className="modal-tags">
              {group.options.map(opt => (
                <button
                  key={opt}
                  className={`modal-tag${selected.includes(opt) ? ' active' : ''}`}
                  onClick={() => toggleMod(opt)}
                >
                  {opt}
                </button>
              ))}
            </div>
          </div>
        ))}

        <div className="modal-actions">
          <button className="modal-btn cancel" onClick={onCancel}>{t('Отменить', 'Bekor qilish', 'Cancel')}</button>
          <button className="modal-btn save" onClick={() => onSave(addons, selected)}>{t('Сохранить', 'Saqlash', 'Save')}</button>
        </div>
      </div>
    </div>
  )
}
