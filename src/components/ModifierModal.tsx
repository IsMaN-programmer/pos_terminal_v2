import { useState } from 'react'
import { useT } from '../i18n'

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
  const t = useT()
  const GROUP_LABELS: Record<string, string> = {
    'Мясные блюда (стейки, бургеры, шашлык)': t('Мясные блюда (стейки, бургеры, шашлык)', 'Go\'sht taomlari (steyk, burger, shashlik)'),
    'Пицца и паста': t('Пицца и паста', 'Pitsa va pasta'),
    'Кофе и напитки': t('Кофе и напитки', 'Qahva va ichimliklar'),
  }
  const OPTION_LABELS: Record<string, string> = {
    'Сыр чеддер': t('Сыр чеддер', 'Cheddar pishlog\'i'),
    'Сыр дорблю': t('Сыр дорблю', 'Dorblu pishlog\'i'),
    'Жареный лук': t('Жареный лук', 'Qovurilgan piyoz'),
    'Бекон': t('Бекон', 'Bekon'),
    'Халапеньо': t('Халапеньо', 'Jalapenyo'),
    'Яйцо': t('Яйцо', 'Tuxum'),
    'Соус барбекю': t('Соус барбекю', 'Barbekyu sousi'),
    'Соус сырный': t('Соус сырный', 'Pishloq sousi'),
    'Соус чесночный': t('Соус чесночный', 'Sarimsoq sousi'),
    'Соус сальса': t('Соус сальса', 'Salsa sousi'),
    'Тонкое тесто': t('Тонкое тесто', 'Yupqa xamir'),
    'Пышное тесто': t('Пышное тесто', 'Yumshoq xamir'),
    'Безглютеновая основа': t('Безглютеновая основа', 'Glyutensiz asos'),
    'Сырный бортик': t('Сырный бортик', 'Pishloqli gardish'),
    'Двойная порция сыра': t('Двойная порция сыра', 'Ikki porsiya pishloq'),
    'Пепперони': t('Пепперони', 'Pepperoni'),
    'Грибы': t('Грибы', 'Qo\'ziqorinlar'),
    'Маслины': t('Маслины', 'Zaytunlar'),
    'Морепродукты': t('Морепродукты', 'Dengiz mahsulotlari'),
    'Без оливок': t('Без оливок', 'Zaytunsiz'),
    'Без лука': t('Без лука', 'Piyozsiz'),
    'Без грибов': t('Без грибов', 'Qo\'ziqorinsiz'),
    'Молоко обезжиренное': t('Молоко обезжиренное', 'Yog\'siz sut'),
    'Молоко безлактозное': t('Молоко безлактозное', 'Laktozasiz sut'),
    'Молоко соевое': t('Молоко соевое', 'Soya suti'),
    'Молоко миндальное': t('Молоко миндальное', 'Bodom suti'),
    'Молоко кокосовое': t('Молоко кокосовое', 'Kokos suti'),
    'Молоко овсяное': t('Молоко овсяное', 'Suli suti'),
    'Сироп ванильный': t('Сироп ванильный', 'Vanilli sirop'),
    'Сироп карамельный': t('Сироп карамельный', 'Karamel siropi'),
    'Сироп кокосовый': t('Сироп кокосовый', 'Kokos siropi'),
    'Сироп лавандовый': t('Сироп лавандовый', 'Lavanda siropi'),
    'Горячий': t('Горячий', 'Issiq'),
    'Тёплый': t('Тёплый', 'Iliq'),
    'Со льдом': t('Со льдом', 'Muzli'),
    'Безо льда': t('Безо льда', 'Muzsiz'),
    'Взбитые сливки': t('Взбитые сливки', 'Ko\'pirtirilgan qaymoq'),
    'Корица': t('Корица', 'Dolchin'),
    'Маршмеллоу': t('Маршмеллоу', 'Marshmallow'),
  }
  const [selected, setSelected] = useState<string[]>(initialSelected)
  const [groups] = useState<ModifierGroup[]>(loadModifiers)

  function toggleMod(mod: string) {
    setSelected(prev => prev.includes(mod) ? prev.filter(m => m !== mod) : [...prev, mod])
  }

  return (
    <div className="modal-overlay" onClick={onCancel}>
      <div className="modal-content modifier-modal" onClick={e => e.stopPropagation()}>
        <h3 className="modal-title">{t('Модификаторы', 'Modifikatorlar')}</h3>

        {groups.map(group => (
          <div key={group.label} className="modifier-group">
            <h4 className="modifier-group-title">{GROUP_LABELS[group.label] || group.label}</h4>
            <div className="modal-tags">
              {group.options.map(opt => (
                <button
                  key={opt}
                  className={`modal-tag${selected.includes(opt) ? ' active' : ''}`}
                  onClick={() => toggleMod(opt)}
                >
                  {OPTION_LABELS[opt] || opt}
                </button>
              ))}
            </div>
          </div>
        ))}

        <div className="modal-actions">
          <button className="modal-btn cancel" onClick={onCancel}>{t('Отменить', 'Bekor qilish')}</button>
          <button className="modal-btn save" onClick={() => onSave(selected)}>{t('Сохранить', 'Saqlash')}</button>
        </div>
      </div>
    </div>
  )
}
