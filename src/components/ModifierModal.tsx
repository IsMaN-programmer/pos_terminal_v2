import { useState } from 'react'

interface ModifierGroup {
  label: string
  options: string[]
}

const MODIFIERS_KEY = 'pos_v2_modifier_groups'

const DEFAULT_MODIFIERS: ModifierGroup[] = [
  {
    label: 'Мясные блюда (стейки, бургеры, шашлык)',
    options: ['Rare', 'Medium Rare', 'Medium', 'Medium Well', 'Well Done', 'Сыр чеддер', 'Сыр дорблю', 'Жареный лук', 'Бекон', 'Халапеньо', 'Яйцо', 'Соус барбекю', 'Соус сырный', 'Соус чесночный', 'Соус сальса'],
  },
  {
    label: 'Пицца и паста',
    options: ['Тонкое тесто', 'Пышное тесто', 'Безглютеновая основа', 'Сырный бортик', 'Двойная порция сыра', 'Пепперони', 'Грибы', 'Маслины', 'Морепродукты', 'Без оливок', 'Без лука', 'Без грибов'],
  },
  {
    label: 'Кофе и напитки',
    options: ['Молоко обезжиренное', 'Молоко безлактозное', 'Молоко соевое', 'Молоко миндальное', 'Молоко кокосовое', 'Молоко овсяное', 'Сироп ванильный', 'Сироп карамельный', 'Сироп кокосовый', 'Сироп лавандовый', 'Горячий', 'Тёплый', 'Со льдом', 'Безо льда', 'Взбитые сливки', 'Корица', 'Маршмеллоу', 'Double shot'],
  },
]

function loadModifiers(): ModifierGroup[] {
  try {
    const raw = localStorage.getItem(MODIFIERS_KEY)
    if (raw) {
      const parsed = JSON.parse(raw)
      if (Array.isArray(parsed) && parsed.length > 0) return parsed
    }
  } catch {}
  return DEFAULT_MODIFIERS
}

interface ModifierModalProps {
  initialSelected: string[]
  onSave: (selected: string[]) => void
  onCancel: () => void
}

export default function ModifierModal({ initialSelected, onSave, onCancel }: ModifierModalProps) {
  const [selected, setSelected] = useState<string[]>(initialSelected)
  const [groups] = useState<ModifierGroup[]>(loadModifiers)

  function toggleMod(mod: string) {
    setSelected(prev => prev.includes(mod) ? prev.filter(m => m !== mod) : [...prev, mod])
  }

  return (
    <div className="modal-overlay" onClick={onCancel}>
      <div className="modal-content modifier-modal" onClick={e => e.stopPropagation()}>
        <h3 className="modal-title">Модификаторы</h3>

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
          <button className="modal-btn cancel" onClick={onCancel}>Отменить</button>
          <button className="modal-btn save" onClick={() => onSave(selected)}>Сохранить</button>
        </div>
      </div>
    </div>
  )
}
