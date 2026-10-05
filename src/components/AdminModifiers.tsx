import { useState } from 'react'
import { dataStore } from '../services/dataStore'
import { useT } from '../i18n'

interface ModifierGroup {
  label: string
  options: string[]
}

const MODIFIERS_KEY = 'pos_v2_modifier_groups'
const BUTTONS_KEY = 'pos_v2_action_buttons'

const DEFAULT_BUTTONS: string[] = ['Отправить шашлычную', 'Отправить сомсусечную']

function loadModifiers(): ModifierGroup[] {
  try {
    const raw = dataStore.getItem(MODIFIERS_KEY)
    if (raw) return JSON.parse(raw)
  } catch {}
  return []
}

function loadButtons(): string[] {
  try {
    const raw = dataStore.getItem(BUTTONS_KEY)
    if (raw) return JSON.parse(raw)
  } catch {}
  return [...DEFAULT_BUTTONS]
}

interface StockGood {
  id: number; name: string; type: string; [key: string]: any
}

function loadAdditives(): StockGood[] {
  try {
    const raw = dataStore.getItem('pos_v2_stock_goods')
    const goods: StockGood[] = raw ? JSON.parse(raw) : []
    return goods.filter(g => g.type === 'additive')
  } catch { return [] }
}

export default function AdminModifiers() {
  const [groups, setGroups] = useState<ModifierGroup[]>(loadModifiers)
  const [buttons, setButtons] = useState<string[]>(loadButtons)
  const [additives] = useState<StockGood[]>(loadAdditives)
  const [editGroupIdx, setEditGroupIdx] = useState<number | null>(null)
  const [editGroupLabel, setEditGroupLabel] = useState('')
  const [editOptionIdx, setEditOptionIdx] = useState<{ group: number; opt: number } | null>(null)
  const [editOptionValue, setEditOptionValue] = useState('')
  const [editBtnIdx, setEditBtnIdx] = useState<number | null>(null)
  const [editBtnValue, setEditBtnValue] = useState('')
  const [newGroupLabel, setNewGroupLabel] = useState('')
  const [newOptionInput, setNewOptionInput] = useState<{ group: number; val: string } | null>(null)
  const [newBtnInput, setNewBtnInput] = useState('')
  const t = useT()

  function saveGroups(g: ModifierGroup[]) {
    setGroups(g)
    dataStore.setItem(MODIFIERS_KEY, JSON.stringify(g))
  }

  function saveButtons(b: string[]) {
    setButtons(b)
    dataStore.setItem(BUTTONS_KEY, JSON.stringify(b))
  }

  function handleAddGroup() {
    const name = newGroupLabel.trim()
    if (!name) return
    saveGroups([...groups, { label: name, options: [] }])
    setNewGroupLabel('')
  }

  function handleDeleteGroup(idx: number) {
    saveGroups(groups.filter((_, i) => i !== idx))
  }

  function handleSaveGroupLabel(idx: number) {
    const name = editGroupLabel.trim()
    if (!name) return
    const updated = [...groups]
    updated[idx] = { ...updated[idx], label: name }
    saveGroups(updated)
    setEditGroupIdx(null)
  }

  function handleAddOption(groupIdx: number) {
    const val = newOptionInput?.group === groupIdx ? newOptionInput.val.trim() : ''
    if (!val) return
    const updated = [...groups]
    updated[groupIdx] = { ...updated[groupIdx], options: [...updated[groupIdx].options, val] }
    saveGroups(updated)
    setNewOptionInput(null)
  }

  function handleDeleteOption(groupIdx: number, optIdx: number) {
    const updated = [...groups]
    updated[groupIdx] = { ...updated[groupIdx], options: updated[groupIdx].options.filter((_, i) => i !== optIdx) }
    saveGroups(updated)
  }

  function handleSaveOption(groupIdx: number, optIdx: number) {
    const val = editOptionValue.trim()
    if (!val) return
    const updated = [...groups]
    updated[groupIdx] = { ...updated[groupIdx], options: updated[groupIdx].options.map((o, i) => i === optIdx ? val : o) }
    saveGroups(updated)
    setEditOptionIdx(null)
  }

  function handleAddButton() {
    const name = newBtnInput.trim()
    if (!name) return
    saveButtons([...buttons, name])
    setNewBtnInput('')
  }

  function handleDeleteButton(idx: number) {
    saveButtons(buttons.filter((_, i) => i !== idx))
  }

  function handleSaveButton(idx: number) {
    const name = editBtnValue.trim()
    if (!name) return
    saveButtons(buttons.map((b, i) => i === idx ? name : b))
    setEditBtnIdx(null)
  }

  return (
    <div className="screen">
      <div className="screen-header">
        <h1 className="screen-title">{t('Модификаторы', 'Modifikatorlar', 'Modifiers')}</h1>
      </div>
      <div style={{ maxWidth: 800, margin: '0 auto', display: 'flex', flexDirection: 'column', gap: 24, padding: '20px 0' }}>
        <div style={{ background: '#fff', borderRadius: 12, padding: 24, boxShadow: '0 1px 3px rgba(0,0,0,0.08)' }}>
          <h3 style={{ fontSize: 16, fontWeight: 700, color: '#1e293b', margin: '0 0 16px 0' }}>{t('Модификаторы из окна заказа', 'Buyurtma oynasidagi modifikatorlar', 'Modifiers from order window')}</h3>

          <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
            {groups.map((group, gIdx) => (
              <div key={gIdx} className="am-group">
                <div className="am-group-header">
                  {editGroupIdx === gIdx ? (
                    <div className="am-edit-inline">
                      <input className="am-input" value={editGroupLabel} onChange={e => setEditGroupLabel(e.target.value)} placeholder={t('Название группы...', 'Guruh nomi...', 'Group name...')} />
                      <button className="am-btn am-btn-sm am-btn-primary" onClick={() => handleSaveGroupLabel(gIdx)}>✓</button>
                      <button className="am-btn am-btn-sm" onClick={() => setEditGroupIdx(null)}>✕</button>
                    </div>
                  ) : (
                    <>
                      <span className="am-group-label">{group.label}</span>
                      <div className="am-group-actions">
                        <button className="am-icon-btn" title={t('Редактировать', 'Tahrirlash', 'Edit')} onClick={() => { setEditGroupIdx(gIdx); setEditGroupLabel(group.label) }}>
                          <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7" /><path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z" /></svg>
                        </button>
                        <button className="am-icon-btn danger" title={t('Удалить', 'O\'chirish', 'Delete')} onClick={() => handleDeleteGroup(gIdx)}>
                          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><polyline points="3 6 5 6 21 6" /><path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2" /></svg>
                        </button>
                      </div>
                    </>
                  )}
                </div>
                <div className="am-options">
                  {group.options.map((opt, oIdx) => (
                    <div key={oIdx} className="am-option-row">
                      {editOptionIdx?.group === gIdx && editOptionIdx.opt === oIdx ? (
                        <div className="am-edit-inline">
                          <input className="am-input" value={editOptionValue} onChange={e => setEditOptionValue(e.target.value)} placeholder={t('Модификатор...', 'Modifikator...', 'Modifier...')} />
                          <button className="am-btn am-btn-sm am-btn-primary" onClick={() => handleSaveOption(gIdx, oIdx)}>✓</button>
                          <button className="am-btn am-btn-sm" onClick={() => setEditOptionIdx(null)}>✕</button>
                        </div>
                      ) : (
                        <>
                          <span className="am-option-name">{opt}</span>
                          <div className="am-option-actions">
                            <button className="am-icon-btn" title={t('Редактировать', 'Tahrirlash', 'Edit')} onClick={() => { setEditOptionIdx({ group: gIdx, opt: oIdx }); setEditOptionValue(opt) }}>
                              <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7" /><path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z" /></svg>
                            </button>
                            <button className="am-icon-btn danger" title={t('Удалить', 'O\'chirish', 'Delete')} onClick={() => handleDeleteOption(gIdx, oIdx)}>
                              <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><line x1="18" y1="6" x2="6" y2="18" /><line x1="6" y1="6" x2="18" y2="18" /></svg>
                            </button>
                          </div>
                        </>
                      )}
                    </div>
                  ))}
                  {newOptionInput?.group === gIdx ? (
                    <div className="am-edit-inline" style={{ marginTop: 6 }}>
                      <input className="am-input" value={newOptionInput.val} onChange={e => setNewOptionInput({ group: gIdx, val: e.target.value })} placeholder={t('Новый модификатор...', 'Yangi modifikator...', 'New modifier...')} />
                      <button className="am-btn am-btn-sm am-btn-primary" onClick={() => handleAddOption(gIdx)}>✓</button>
                      <button className="am-btn am-btn-sm" onClick={() => setNewOptionInput(null)}>✕</button>
                    </div>
                  ) : (
                    <button className="am-add-option-btn" onClick={() => setNewOptionInput({ group: gIdx, val: '' })}>+ {t('Добавить модификатор', 'Modifikator qo\'shish', 'Add modifier')}</button>
                  )}
                </div>
              </div>
            ))}
          </div>

          <div className="am-divider" />

          <div className="am-add-group-row">
            <input className="am-input" style={{ flex: 1 }} value={newGroupLabel} onChange={e => setNewGroupLabel(e.target.value)} placeholder={t('Название новой группы...', 'Yangi guruh nomi...', 'New group name...')} />
            <button className="am-btn am-btn-primary" onClick={handleAddGroup}>{t('Добавить группу', 'Guruh qo\'shish', 'Add group')}</button>
          </div>
        </div>

        {additives.length > 0 && (
          <div style={{ background: '#fff', borderRadius: 12, padding: 24, boxShadow: '0 1px 3px rgba(0,0,0,0.08)' }}>
            <h3 style={{ fontSize: 16, fontWeight: 700, color: '#1e293b', margin: '0 0 16px 0' }}>{t('Добавка (из склада)', 'Qo\'shimcha (ombordan)', 'Additive (from stock)')}</h3>
            <div className="am-group" style={{ border: '1px solid #e2e8f0', borderRadius: 10, padding: 20 }}>
              <div className="am-group-header">
                <span className="am-group-label">{t('Добавка', 'Qo\'shimcha', 'Additive')}</span>
              </div>
              <div className="am-options">
                {additives.map(a => (
                  <div key={a.id} className="am-option-row">
                    <span className="am-option-name">{a.name}</span>
                  </div>
                ))}
              </div>
            </div>
          </div>
        )}

        <div style={{ background: '#fff', borderRadius: 12, padding: 24, boxShadow: '0 1px 3px rgba(0,0,0,0.08)' }}>
          <h3 style={{ fontSize: 16, fontWeight: 700, color: '#1e293b', margin: '0 0 16px 0' }}>{t('Кнопки действий', 'Amallar tugmalari', 'Action buttons')}</h3>

          <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
            {buttons.map((btn, idx) => (
              <div key={idx} className="am-option-row">
                {editBtnIdx === idx ? (
                  <div className="am-edit-inline">
                    <input className="am-input" value={editBtnValue} onChange={e => setEditBtnValue(e.target.value)} placeholder={t('Название кнопки...', 'Tugma nomi...', 'Button name...')} />
                    <button className="am-btn am-btn-sm am-btn-primary" onClick={() => handleSaveButton(idx)}>✓</button>
                    <button className="am-btn am-btn-sm" onClick={() => setEditBtnIdx(null)}>✕</button>
                  </div>
                ) : (
                  <>
                    <span className="am-option-name">{btn}</span>
                    <div className="am-option-actions">
                      <button className="am-icon-btn" title={t('Редактировать', 'Tahrirlash', 'Edit')} onClick={() => { setEditBtnIdx(idx); setEditBtnValue(btn) }}>
                        <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7" /><path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z" /></svg>
                      </button>
                      <button className="am-icon-btn danger" title={t('Удалить', 'O\'chirish', 'Delete')} onClick={() => handleDeleteButton(idx)}>
                        <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><line x1="18" y1="6" x2="6" y2="18" /><line x1="6" y1="6" x2="18" y2="18" /></svg>
                      </button>
                    </div>
                  </>
                )}
              </div>
            ))}
          </div>

          <div className="am-divider" />

          <div className="am-add-group-row">
            <input className="am-input" style={{ flex: 1 }} value={newBtnInput} onChange={e => setNewBtnInput(e.target.value)} placeholder={t('Название новой кнопки...', 'Yangi tugma nomi...', 'New button name...')} />
            <button className="am-btn am-btn-primary" onClick={handleAddButton}>{t('Добавить кнопку', 'Tugma qo\'shish', 'Add button')}</button>
          </div>
        </div>
      </div>
    </div>
  )
}
