export default function AdminSupport() {
  return (
    <div className="screen admin-support-screen">
      <div className="admin-support-container">
        <h1 className="admin-support-title">Служба Тех-подержки</h1>

        <div className="admin-support-card">
          {/* Telegram support with right button */}
          <div className="admin-support-row telegram-row">
            <div className="admin-support-row-left">
              <div className="admin-support-icon-badge telegram-badge">
                <svg width="25" height="25" viewBox="0 0 24 24" fill="currentColor">
                  <path d="M11.944 0A12 12 0 0 0 0 12a12 12 0 0 0 12 12 12 12 0 0 0 12-12A12 12 0 0 0 12 0a12 12 0 0 0-.056 0zm4.962 7.224c.1-.002.321.023.465.14a.506.506 0 0 1 .171.325c.016.093.036.306.02.472-.18 1.898-.962 6.502-1.36 8.627-.168.9-.499 1.201-.82 1.23-.696.065-1.225-.46-1.9-.902-1.056-.693-1.653-1.124-2.678-1.8-1.185-.78-.417-1.21.258-1.91.177-.184 3.247-2.977 3.307-3.23.007-.032.014-.15-.056-.212s-.174-.041-.249-.024c-.106.024-1.793 1.14-5.061 3.345-.48.33-.913.49-1.302.48-.428-.008-1.252-.241-1.865-.44-.752-.245-1.349-.374-1.297-.789.027-.216.325-.437.893-.663 3.498-1.524 5.83-2.529 6.998-3.014 3.332-1.386 4.025-1.627 4.476-1.635z" />
                </svg>
              </div>
              <span className="admin-support-label">Telegram support</span>
            </div>
            <a
              href="https://t.me/pos_terminal_support"
              target="_blank"
              rel="noopener noreferrer"
              className="admin-support-btn"
            >
              <span>Перейти</span>
              <svg width="17" height="17" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                <polyline points="9 18 15 12 9 6" />
              </svg>
            </a>
          </div>

          {/* Phone number */}
          <div className="admin-support-row">
            <div className="admin-support-row-left">
              <div className="admin-support-icon-badge phone-badge">
                <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                  <path d="M22 16.92v3a2 2 0 0 1-2.18 2 19.79 19.79 0 0 1-8.63-3.07 19.5 19.5 0 0 1-6-6 19.79 19.79 0 0 1-3.07-8.67A2 2 0 0 1 4.11 2h3a2 2 0 0 1 2 1.72 12.84 12.84 0 0 0 .7 2.81 2 2 0 0 1-.45 2.11L8.09 9.91a16 16 0 0 0 6 6l1.27-1.27a2 2 0 0 1 2.11-.45 12.84 12.84 0 0 0 2.81.7A2 2 0 0 1 22 16.92z" />
                </svg>
              </div>
              <div className="admin-support-info">
                <span className="admin-support-sublabel">Телефон</span>
                <a href="tel:+998712023282" className="admin-support-val phone-link">
                  +998 71 202 32 82
                </a>
              </div>
            </div>
          </div>

          {/* Email */}
          <div className="admin-support-row">
            <div className="admin-support-row-left">
              <div className="admin-support-icon-badge email-badge">
                <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                  <path d="M4 4h16c1.1 0 2 .9 2 2v12c0 1.1-.9 2-2 2H4c-1.1 0-2-.9-2-2V6c0-1.1.9-2 2-2z" />
                  <polyline points="22,6 12,13 2,6" />
                </svg>
              </div>
              <div className="admin-support-info">
                <span className="admin-support-sublabel">Gmail</span>
                <a href="mailto:soliqservus402@gmail.com" className="admin-support-val email-link">
                  soliqservus402@gmail.com
                </a>
              </div>
            </div>
          </div>

          {/* Address */}
          <div className="admin-support-row">
            <div className="admin-support-row-left">
              <div className="admin-support-icon-badge address-badge">
                <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                  <path d="M21 10c0 7-9 13-9 13s-9-6-9-13a9 9 0 0 1 18 0z" />
                  <circle cx="12" cy="10" r="3" />
                </svg>
              </div>
              <div className="admin-support-info">
                <span className="admin-support-sublabel">Адрес</span>
                <a
                  href="https://yandex.uz/maps/-/CTvnURlG"
                  target="_blank"
                  rel="noopener noreferrer"
                  className="admin-support-val address-link"
                >
                  Ташкент, ул. Мукими, 166
                  <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                    <path d="M18 13v6a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h6" />
                    <polyline points="15 3 21 3 21 9" />
                    <line x1="10" y1="14" x2="21" y2="3" />
                  </svg>
                </a>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  )
}
