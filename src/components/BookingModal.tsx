import { useState } from 'react'
import type { Table, TableBookingData } from '../data/types'
import { useT } from '../i18n'

interface BookingModalProps {
  table: Table
  onSave: (tableId: number, booking: TableBookingData) => void
  onClose: () => void
}

export default function BookingModal({ table, onSave, onClose }: BookingModalProps) {
  const t = useT()
  const [bookingDate, setBookingDate] = useState(() => new Date().toISOString().slice(0, 10))
  const [bookingTime, setBookingTime] = useState('19:00')
  const [bookingName, setBookingName] = useState('')
  const [bookingPhone, setBookingPhone] = useState('')
  const [guestCount, setGuestCount] = useState(2)

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    onSave(table.id, {
      date: bookingDate,
      time: bookingTime,
      name: bookingName,
      phone: bookingPhone,
      guestCount,
    })
  }

  return (
    <div className="modal-overlay" onClick={onClose}>
      <div className="modal-content" style={{ width: 440 }} onClick={e => e.stopPropagation()}>
        <div className="modal-title">
          {t('Бронирование стола', 'Stolni bron qilish', 'Table reservation')} — {table.name}
        </div>
        <form onSubmit={handleSubmit} className="booking-modal-form">
          <div className="booking-form-group">
            <label>{t('Дата брони', 'Bron sanasi', 'Reservation date')}</label>
            <input
              type="date"
              value={bookingDate}
              onChange={e => setBookingDate(e.target.value)}
              required
            />
          </div>

          <div className="booking-form-group">
            <label>{t('Время приезда', 'Kelish vaqti', 'Arrival time')}</label>
            <input
              type="time"
              value={bookingTime}
              onChange={e => setBookingTime(e.target.value)}
              required
            />
          </div>

          <div className="booking-form-group">
            <label>{t('Имя', 'Ism', 'Name')}</label>
            <input
              type="text"
              placeholder={t('На кого бронируем', 'Kimning nomiga bron', 'Reservation for')}
              value={bookingName}
              onChange={e => setBookingName(e.target.value)}
              required
            />
          </div>

          <div className="booking-form-group">
            <label>{t('Телефон', 'Telefon', 'Phone')}</label>
            <input
              type="tel"
              placeholder="+998 90 123 45 67"
              value={bookingPhone}
              onChange={e => setBookingPhone(e.target.value)}
              required
            />
          </div>

          <div className="booking-form-group">
            <label>{t('Количество гостей', 'Mehmonlar soni', 'Number of guests')}</label>
            <div className="qty-controls booking-qty-controls">
              <button type="button" className="qty-btn" onClick={() => setGuestCount(Math.max(1, guestCount - 1))}>−</button>
              <span className="qty-value">{guestCount}</span>
              <button type="button" className="qty-btn" onClick={() => setGuestCount(guestCount + 1)}>+</button>
            </div>
          </div>

          <div className="modal-actions">
            <button
              type="button"
              className="modal-btn cancel"
              onClick={onClose}
            >
              {t('Отменить', 'Bekor qilish', 'Cancel')}
            </button>
            <button type="submit" className="modal-btn save">
              {t('Сохранить', 'Saqlash', 'Save')}
            </button>
          </div>
        </form>
      </div>
    </div>
  )
}