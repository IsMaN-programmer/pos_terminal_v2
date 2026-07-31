import { useState, useCallback } from 'react'
import type { OrderItem } from '../data/types'

export interface CashierPaymentData {
  items: OrderItem[]
  tableName: string
  guestCount: number
  servicePercent: number
  discountType: 'percent' | 'amount'
  discountPercent: number
  discountAmount: number
  selectedMethod: 'cash' | 'card' | 'click' | null
  splitAmounts?: { cash: number; card: number; click: number }
}

interface CashierPaymentProps {
  totalSum: number
  tableName: string
  guestCount: number
  onBack: () => void
  items: OrderItem[]
  onContinue: (data: CashierPaymentData) => void
  servicePercent: number
  discountType: 'percent' | 'amount'
  discountPercent: number
  discountAmount: number
  selectedMethod: 'cash' | 'card' | 'click' | null
  onServicePercentChange: (v: number) => void
  onDiscountTypeChange: (v: 'percent' | 'amount') => void
  onDiscountPercentChange: (v: number) => void
  onDiscountAmountChange: (v: number) => void
  onSelectedMethodChange: (v: 'cash' | 'card' | 'click' | null) => void
  splitAmounts: { cash: number; card: number; click: number } | null
  onSplitAmountsChange: (v: { cash: number; card: number; click: number } | null) => void
}

type ActiveModal = 'discount' | 'promo' | 'service' | 'split' | null

export default function CashierPayment({
  totalSum, tableName, guestCount, onBack, items, onContinue,
  servicePercent, discountType, discountPercent, discountAmount, selectedMethod,
  onServicePercentChange, onDiscountTypeChange, onDiscountPercentChange, onDiscountAmountChange, onSelectedMethodChange,
  splitAmounts, onSplitAmountsChange,
}: CashierPaymentProps) {
  const [activeModal, setActiveModal] = useState<ActiveModal>(null)
  const [tempDiscountType, setTempDiscountType] = useState<'percent' | 'amount'>('percent')
  const [tempDiscountPercent, setTempDiscountPercent] = useState(0)
  const [tempDiscountAmount, setTempDiscountAmount] = useState(0)
  const [tempPromoCode, setTempPromoCode] = useState('')
  const [tempServicePercent, setTempServicePercent] = useState(0)
  const [promoError, setPromoError] = useState(false)
  const [tempSplitCash, setTempSplitCash] = useState(0)
  const [tempSplitCard, setTempSplitCard] = useState(0)
  const [tempSplitClick, setTempSplitClick] = useState(0)
  const [splitError, setSplitError] = useState('')
  const [toast, setToast] = useState<string | null>(null)

  const showToast = useCallback((msg: string) => {
    setToast(msg)
    setTimeout(() => setToast(null), 2000)
  }, [])

  const serviceAmount = Math.round(totalSum * servicePercent / 100)
  const discountValue = discountType === 'percent'
    ? Math.round(totalSum * discountPercent / 100)
    : discountAmount
  const qqsBase = totalSum + serviceAmount - discountValue
  const qqsAmount = Math.round(qqsBase * 12 / 100)
  const итого = qqsBase

  const now = new Date()
  const dateStr = now.toLocaleDateString('ru-RU')
  const timeStr = now.toLocaleTimeString('ru-RU', { hour: '2-digit', minute: '2-digit' })

  function openModal(type: ActiveModal) {
    setTempDiscountType(discountType)
    setTempDiscountPercent(discountPercent)
    setTempDiscountAmount(discountAmount)
    setTempPromoCode('')
    setTempServicePercent(servicePercent)
    setPromoError(false)
    if (type === 'split') {
      setTempSplitCash(splitAmounts?.cash ?? 0)
      setTempSplitCard(splitAmounts?.card ?? 0)
      setTempSplitClick(splitAmounts?.click ?? 0)
      setSplitError('')
    }
    setActiveModal(type)
  }

  function applyDiscount() {
    onDiscountTypeChange(tempDiscountType)
    onDiscountPercentChange(tempDiscountPercent)
    onDiscountAmountChange(tempDiscountAmount)
    setActiveModal(null)
  }

  function applyPromo() {
    if (tempPromoCode.toUpperCase() === 'POS') {
      onDiscountTypeChange('percent')
      onDiscountPercentChange(10)
      onDiscountAmountChange(0)
      setActiveModal(null)
      setPromoError(false)
      showToast('Промокод успешно добавлен')
    } else {
      setPromoError(true)
    }
  }

  function applyService() {
    onServicePercentChange(tempServicePercent)
    setActiveModal(null)
  }

  function applySplit() {
    const total = tempSplitCash + tempSplitCard + tempSplitClick
    if (total !== итого) {
      setSplitError(`Общая сумма разделения (${total.toLocaleString()} сум) не равна итого (${итого.toLocaleString()} сум)`)
      return
    }
    onSplitAmountsChange({ cash: tempSplitCash, card: tempSplitCard, click: tempSplitClick })
    onSelectedMethodChange(null)
    setActiveModal(null)
  }

  function clearSplit() {
    onSplitAmountsChange(null)
  }

  return (
    <div className="screen">
      <div className="screen-header">
        <h1 className="screen-title">
          <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <rect x="2" y="4" width="20" height="16" rx="2" />
            <path d="M12 12a3 3 0 1 0 0-6 3 3 0 0 0 0 6z" />
            <path d="M2 12h20" />
            <path d="M12 18h0" />
          </svg>
          Прием оплаты
        </h1>
        <div className="menu-header-btns">
          <button className="menu-header-btn back" onClick={onBack}>Назад</button>
          <button className={`menu-header-btn continue${!selectedMethod && !splitAmounts ? ' disabled' : ''}`} disabled={!selectedMethod && !splitAmounts} onClick={() => onContinue({
            items, tableName, guestCount, servicePercent,
            discountType, discountPercent, discountAmount, selectedMethod,
            splitAmounts: splitAmounts || undefined,
          })}>Продолжить</button>
        </div>
      </div>

      <div className="order-info-bar">
        <div className="order-info-item">
          <span className="order-info-label">Стол:</span>
          <span className="order-info-value">{tableName}</span>
        </div>
        <div className="order-info-item">
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2" />
            <circle cx="9" cy="7" r="4" /><path d="M23 21v-2a4 4 0 0 0-3-3.87" />
            <path d="M16 3.13a4 4 0 0 1 0 7.75" />
          </svg>
          <span>{guestCount} чел.</span>
        </div>
        <div className="order-info-item">
          <span>{dateStr}</span>
          <span className="order-info-time">{timeStr}</span>
        </div>
      </div>

      <div className="cashier-payment-layout">
        <div className="cashier-payment-left">
          <div className="payment-summary-box">
            <div className="payment-summary-inner">
              <h3 className="payment-summary-title">Сумма платежа</h3>
              <div className="payment-summary-rows">
                <div className="payment-summary-row">
                  <span className="ps-label">Общая сумма</span>
                  <span className="ps-value">{totalSum.toLocaleString()} сум</span>
                </div>
                <div className="payment-summary-row">
                  <span className="ps-label">Сервис ({servicePercent}%)</span>
                  <span className="ps-value">{serviceAmount.toLocaleString()} сум</span>
                </div>
                <div className="payment-summary-row">
                  <span className="ps-label">Скидка</span>
                  <span className={`ps-value${discountValue > 0 ? ' ps-negative' : ''}`}>{discountValue > 0 ? `−${discountValue.toLocaleString()}` : '0'} сум</span>
                </div>
                <div className="payment-summary-row">
                  <span className="ps-label">QQS (12%)</span>
                  <span className="ps-value">{qqsAmount.toLocaleString()} сум</span>
                </div>
              </div>
              <div className="payment-summary-divider" />
              <div className="payment-summary-total">
                <span className="pst-label">Итого</span>
                <span className="pst-value">{итого.toLocaleString()} сум</span>
              </div>
            </div>
          </div>

          <div className="payment-action-btns">
            <button className="payment-action-btn" onClick={() => openModal('discount')}>
              <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <line x1="18" y1="6" x2="6" y2="18" /><circle cx="8" cy="8" r="1.5" fill="currentColor" /><circle cx="16" cy="16" r="1.5" fill="currentColor" />
              </svg>
              Скидка
            </button>
            <button className="payment-action-btn" onClick={() => openModal('promo')}>
              <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <polyline points="20 12 20 22 4 22 4 12" /><rect x="2" y="7" width="20" height="5" /><line x1="12" y1="22" x2="12" y2="7" /><path d="M12 7H7.5a2.5 2.5 0 0 1 0-5C11 2 12 7 12 7z" /><path d="M12 7h4.5a2.5 2.5 0 0 0 0-5C13 2 12 7 12 7z" />
              </svg>
              Промокод
            </button>
            <button className="payment-action-btn" onClick={() => openModal('service')}>
              <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z" />
              </svg>
              Сервис
            </button>
          </div>
          <button className={`payment-action-btn split-btn${splitAmounts ? ' active' : ''}`} onClick={() => splitAmounts ? clearSplit() : openModal('split')}>
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <line x1="12" y1="2" x2="12" y2="22" /><path d="M17 5H9.5a3.5 3.5 0 0 0 0 7h5a3.5 3.5 0 0 1 0 7H6" />
            </svg>
            Разделение счета
          </button>
        </div>

        <div className="cashier-payment-right">
          <h3 className="payment-methods-title">{splitAmounts ? 'Разделение счета' : 'Выбор оплаты'}</h3>
          <div className="payment-methods">
            {splitAmounts ? (
              <>
                <div className="payment-method-box selected">
                  <svg width="32" height="32" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
                    <rect x="2" y="6" width="20" height="12" rx="2" /><circle cx="12" cy="12" r="3" />
                  </svg>
                  <span className="pm-label">Наличной</span>
                  <span className="pm-amount">{splitAmounts.cash.toLocaleString()} сум</span>
                </div>
                <div className="payment-method-box selected">
                  <svg width="32" height="32" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
                    <rect x="1" y="4" width="22" height="16" rx="2" /><line x1="1" y1="10" x2="23" y2="10" />
                  </svg>
                  <span className="pm-label">Карта</span>
                  <span className="pm-amount">{splitAmounts.card.toLocaleString()} сум</span>
                </div>
                <div className="payment-method-box selected">
                  <svg width="32" height="32" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
                    <rect x="5" y="2" width="14" height="20" rx="2" /><line x1="12" y1="18" x2="12.01" y2="18" />
                  </svg>
                  <span className="pm-label">Click/Payme</span>
                  <span className="pm-amount">{splitAmounts.click.toLocaleString()} сум</span>
                </div>
              </>
            ) : (
              <>
                <div className={`payment-method-box${selectedMethod === 'cash' ? ' selected' : ''}`} onClick={() => onSelectedMethodChange('cash')}>
                  <svg width="32" height="32" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
                    <rect x="2" y="6" width="20" height="12" rx="2" /><circle cx="12" cy="12" r="3" />
                  </svg>
                  <span className="pm-label">Наличной</span>
                </div>
                <div className={`payment-method-box${selectedMethod === 'card' ? ' selected' : ''}`} onClick={() => onSelectedMethodChange('card')}>
                  <svg width="32" height="32" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
                    <rect x="1" y="4" width="22" height="16" rx="2" /><line x1="1" y1="10" x2="23" y2="10" />
                  </svg>
                  <span className="pm-label">Карта</span>
                </div>
                <div className={`payment-method-box${selectedMethod === 'click' ? ' selected' : ''}`} onClick={() => onSelectedMethodChange('click')}>
                  <svg width="32" height="32" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
                    <rect x="5" y="2" width="14" height="20" rx="2" /><line x1="12" y1="18" x2="12.01" y2="18" />
                  </svg>
                  <span className="pm-label">Click/Payme</span>
                </div>
              </>
            )}
          </div>
        </div>
      </div>

      {activeModal === 'discount' && (
        <div className="modal-overlay" onClick={() => setActiveModal(null)}>
          <div className="modal-content" onClick={e => e.stopPropagation()}>
            <h3 className="modal-title">Скидка</h3>
            <div className="discount-toggle">
              <button className={`dt-btn${tempDiscountType === 'percent' ? ' active' : ''}`} onClick={() => setTempDiscountType('percent')}>Процент</button>
              <button className={`dt-btn${tempDiscountType === 'amount' ? ' active' : ''}`} onClick={() => setTempDiscountType('amount')}>Сумма</button>
            </div>
            {tempDiscountType === 'percent' ? (
              <input type="number" className="modal-input" placeholder="Процент..." value={tempDiscountPercent || ''} onChange={e => setTempDiscountPercent(Number(e.target.value) || 0)} />
            ) : (
              <input type="number" className="modal-input" placeholder="Сумма..." value={tempDiscountAmount || ''} onChange={e => setTempDiscountAmount(Number(e.target.value) || 0)} />
            )}
            <div className="modal-actions">
              <button className="modal-btn cancel" onClick={() => setActiveModal(null)}>Назад</button>
              <button className="modal-btn save" onClick={applyDiscount}>Применить</button>
            </div>
          </div>
        </div>
      )}

      {activeModal === 'promo' && (
        <div className="modal-overlay" onClick={() => setActiveModal(null)}>
          <div className="modal-content" onClick={e => e.stopPropagation()}>
            <h3 className="modal-title">Промокод</h3>
            <input type="text" className="modal-input" placeholder="Введите промокод..." value={tempPromoCode} onChange={e => setTempPromoCode(e.target.value)} />
            {promoError && <div className="promo-error">Такого промокода нету</div>}
            <div className="modal-actions">
              <button className="modal-btn cancel" onClick={() => setActiveModal(null)}>Назад</button>
              <button className="modal-btn save" onClick={applyPromo}>Применить</button>
            </div>
          </div>
        </div>
      )}

      {activeModal === 'split' && (
        <div className="modal-overlay" onClick={() => setActiveModal(null)}>
          <div className="modal-content" onClick={e => e.stopPropagation()}>
            <h3 className="modal-title">Разделение счета</h3>
            <div className="split-input-group">
              <label className="split-label">
                <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                  <rect x="2" y="6" width="20" height="12" rx="2" /><circle cx="12" cy="12" r="3" />
                </svg>
                Наличные
              </label>
              <input type="number" className="modal-input" placeholder="0" value={tempSplitCash || ''} onChange={e => { setTempSplitCash(Number(e.target.value) || 0); setSplitError('') }} />
            </div>
            <div className="split-input-group">
              <label className="split-label">
                <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                  <rect x="1" y="4" width="22" height="16" rx="2" /><line x1="1" y1="10" x2="23" y2="10" />
                </svg>
                Карта
              </label>
              <input type="number" className="modal-input" placeholder="0" value={tempSplitCard || ''} onChange={e => { setTempSplitCard(Number(e.target.value) || 0); setSplitError('') }} />
            </div>
            <div className="split-input-group">
              <label className="split-label">
                <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                  <rect x="5" y="2" width="14" height="20" rx="2" /><line x1="12" y1="18" x2="12.01" y2="18" />
                </svg>
                Click/Payme
              </label>
              <input type="number" className="modal-input" placeholder="0" value={tempSplitClick || ''} onChange={e => { setTempSplitClick(Number(e.target.value) || 0); setSplitError('') }} />
            </div>
            <div className="split-total-info">
              Итого: {(tempSplitCash + tempSplitCard + tempSplitClick).toLocaleString()} / {итого.toLocaleString()} сум
            </div>
            {splitError && <div className="promo-error">{splitError}</div>}
            <div className="modal-actions">
              <button className="modal-btn cancel" onClick={() => setActiveModal(null)}>Назад</button>
              <button className="modal-btn save" onClick={applySplit}>Применить</button>
            </div>
          </div>
        </div>
      )}

      {activeModal === 'service' && (
        <div className="modal-overlay" onClick={() => setActiveModal(null)}>
          <div className="modal-content" onClick={e => e.stopPropagation()}>
            <h3 className="modal-title">Сервис</h3>
            <input type="number" className="modal-input" placeholder="Процент..." value={tempServicePercent || ''} onChange={e => setTempServicePercent(Number(e.target.value) || 0)} />
            <div className="modal-actions">
              <button className="modal-btn cancel" onClick={() => setActiveModal(null)}>Назад</button>
              <button className="modal-btn save" onClick={applyService}>Применить</button>
            </div>
          </div>
        </div>
      )}

      {toast && (
        <div className="toast-overlay">
          <div className="toast-msg">{toast}</div>
        </div>
      )}
    </div>
  )
}
