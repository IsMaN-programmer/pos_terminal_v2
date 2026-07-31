import { useState } from 'react'

const PRESET_TAGS = ['Без соли', 'Без сахара', 'Без арахиса', 'Без глютена', 'Без лука', 'Поострее', 'Веган', 'Без лактозы']

interface CommentModalProps {
  initialComment: string
  initialTags: string[]
  onSave: (comment: string, tags: string[]) => void
  onCancel: () => void
}

export default function CommentModal({ initialComment, initialTags, onSave, onCancel }: CommentModalProps) {
  const [comment, setComment] = useState(initialComment)
  const [tags, setTags] = useState<string[]>(initialTags)

  function toggleTag(tag: string) {
    setTags(prev => prev.includes(tag) ? prev.filter(t => t !== tag) : [...prev, tag])
  }

  return (
    <div className="modal-overlay" onClick={onCancel}>
      <div className="modal-content" onClick={e => e.stopPropagation()}>
        <h3 className="modal-title">Комментарий к заказу</h3>

        <div className="modal-tags">
          {PRESET_TAGS.map(tag => (
            <button
              key={tag}
              className={`modal-tag${tags.includes(tag) ? ' active' : ''}`}
              onClick={() => toggleTag(tag)}
            >
              {tag}
            </button>
          ))}
        </div>

        <textarea
          className="modal-textarea"
          placeholder="Ваш комментарий..."
          maxLength={120}
          value={comment}
          onChange={e => setComment(e.target.value)}
        />
        <span className="modal-chars">{comment.length}/120</span>

        <div className="modal-actions">
          <button className="modal-btn cancel" onClick={onCancel}>Отменить</button>
          <button className="modal-btn save" onClick={() => onSave(comment, tags)}>Сохранить</button>
        </div>
      </div>
    </div>
  )
}
