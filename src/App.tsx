import { useEffect, useState, useRef } from 'react';
import { useGameStore, initGame } from './store';
import { useFx } from './fx';
import { sfx } from './audio';
import { Game } from './Game';
import { useI18n, translations } from './i18n';
import { MultiplayerModal } from './components/MultiplayerModal';
import { network } from './network';

const MAX_ORB = 40; // score at which an orb is "full"

function Orb({ player, score, active, label }: { player: 1 | 2; score: number; active: boolean; label: string }) {
  const pct = Math.max(7, Math.min(100, (score / MAX_ORB) * 100));
  return (
    <div id={`player${player}-score`} className={`orb ${player === 1 ? 'orb-red' : 'orb-blue'} ${active ? 'active' : ''}`}>
      <div className="orb-label">{label}</div>
      <div className="orb-frame">
        <div className="orb-glass" style={{ ['--fill' as string]: `${pct}%` }}>
          <div className="wave w1" />
          <div className="wave w2" />
          <div className="orb-gloss" />
        </div>
      </div>
      <div className="orb-score" key={score}>
        {score}
      </div>
    </div>
  );
}

const Icon = {
  sound: (
    <svg viewBox="0 0 24 24" width="20" height="20" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <path d="M11 5 6 9H3v6h3l5 4V5z" fill="currentColor" />
      <path d="M15.5 8.5a5 5 0 0 1 0 7" />
      <path d="M18.5 5.5a9 9 0 0 1 0 13" />
    </svg>
  ),
  mute: (
    <svg viewBox="0 0 24 24" width="20" height="20" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <path d="M11 5 6 9H3v6h3l5 4V5z" fill="currentColor" />
      <path d="m16 9 6 6M22 9l-6 6" />
    </svg>
  ),
  restart: (
    <svg viewBox="0 0 24 24" width="20" height="20" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <path d="M3 12a9 9 0 1 0 3-6.7" />
      <path d="M3 4v5h5" />
    </svg>
  ),
  camera: (
    <svg viewBox="0 0 24 24" width="20" height="20" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <path d="m15 10 4.553-2.276A1 1 0 0 1 21 8.618v6.764a1 1 0 0 1-1.447.894L15 14v-4z" fill="currentColor" />
      <rect width="12" height="12" x="3" y="6" rx="2" />
    </svg>
  ),
  tome: (
    <svg viewBox="0 0 24 24" width="20" height="20" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <path d="M4 19.5v-15A2.5 2.5 0 0 1 6.5 2H20v20H6.5a2.5 2.5 0 0 1-2.5-2.5Z" />
      <path d="M6 6h10" />
      <path d="M6 10h10" />
      <path d="M6 14h6" />
    </svg>
  ),
  cross: (
    <svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <line x1="18" y1="6" x2="6" y2="18" />
      <line x1="6" y1="6" x2="18" y2="18" />
    </svg>
  ),
};

export default function App() {
  const {
    p1Score,
    p2Score,
    currentPlayer,
    cellToSow,
    cells,
    winner,
    isAnimating,
    resetGame,
    endDrag,
    updateDrag,
    executeMove,
    selectCell,
    gameMode,
    myPlayerNumber,
    roomId,
    rematchState,
    setRematchState,
    resetGameOnline,
    leaveOnline,
  } = useGameStore();
  const started = useFx(s => s.started);
  const doorsOpening = useFx(s => s.doorsOpening);
  const muted = useFx(s => s.muted);
  const tacticalView = useFx(s => s.tacticalView);
  const grimoireOpen = useFx(s => s.grimoireOpen);
  const banner = useFx(s => s.banner);
  const start = useFx(s => s.start);
  const toggleMute = useFx(s => s.toggleMute);
  const toggleTacticalView = useFx(s => s.toggleTacticalView);
  const setGrimoireOpen = useFx(s => s.setGrimoireOpen);

  const lang = useI18n(s => s.lang);
  const toggleLang = useI18n(s => s.toggleLang);
  const t = translations[lang];

  const [multiplayerOpen, setMultiplayerOpen] = useState(false);
  const [inviteRoomCode, setInviteRoomCode] = useState<string | null>(null);

  // Auto-detect ?room=... from URL to prompt join flow
  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const roomParam = params.get('room');
    if (roomParam) {
      setInviteRoomCode(roomParam);
      setMultiplayerOpen(true);
    }
  }, []);

  const [activeTab, setActiveTab] = useState<'ritual' | 'reaping' | 'mandarin' | 'debt' | 'controls'>('ritual');
  const grimoireBtnRef = useRef<HTMLButtonElement>(null);
  const grimoireTomeRef = useRef<HTMLDivElement>(null);

  // Accessible keyboard focus trap and focus restoration for the Grimoire dialog
  useEffect(() => {
    if (!grimoireOpen) return;
    const container = grimoireTomeRef.current;
    if (!container) return;

    // Focus the close button or first interactive element upon opening
    const closeBtn = container.querySelector<HTMLElement>('.grimoire-close');
    closeBtn?.focus();

    const handleTabKey = (e: KeyboardEvent) => {
      if (e.key !== 'Tab') return;
      const focusables = Array.from(
        container.querySelectorAll<HTMLElement>(
          'button, [href], input, select, textarea, [tabindex]:not([tabindex="-1"])'
        )
      ).filter(el => !el.hasAttribute('disabled'));

      if (focusables.length === 0) return;
      const first = focusables[0];
      const last = focusables[focusables.length - 1];

      if (e.shiftKey && document.activeElement === first) {
        e.preventDefault();
        last.focus();
      } else if (!e.shiftKey && document.activeElement === last) {
        e.preventDefault();
        first.focus();
      }
    };

    window.addEventListener('keydown', handleTabKey);
    return () => {
      window.removeEventListener('keydown', handleTabKey);
      grimoireBtnRef.current?.focus();
    };
  }, [grimoireOpen]);

  useEffect(() => {
    const handlePointerUp = (e: PointerEvent) => endDrag(e.clientX);
    const handlePointerMove = (e: PointerEvent) => updateDrag(e.clientX);
    
    window.addEventListener('pointerup', handlePointerUp);
    window.addEventListener('pointermove', handlePointerMove);
    return () => {
      window.removeEventListener('pointerup', handlePointerUp);
      window.removeEventListener('pointermove', handlePointerMove);
    };
  }, [endDrag, updateDrag]);

  // Automated scene inspection URL parameters
  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    if (params.get('autostart') === '1') {
      const t1 = setTimeout(() => start(), 300);
      let t2: any, t3: any;
      if (params.get('tactical') === '1') {
        t2 = setTimeout(() => toggleTacticalView(), 3200);
      }
      if (params.has('select')) {
        const idx = parseInt(params.get('select') || '2', 10);
        t3 = setTimeout(() => selectCell(idx), 3500);
      }
      return () => {
        clearTimeout(t1);
        if (t2) clearTimeout(t2);
        if (t3) clearTimeout(t3);
      };
    }
  }, [start, toggleTacticalView, selectCell]);

  // Keyboard controls for a AAA responsive feel
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.target instanceof HTMLInputElement || e.target instanceof HTMLTextAreaElement) return;

      if (e.key === 'Escape') {
        if (multiplayerOpen) {
          setMultiplayerOpen(false);
          sfx.click();
        } else if (grimoireOpen) {
          setGrimoireOpen(false);
          sfx.click();
        } else if (cellToSow !== null) {
          selectCell(null);
          sfx.click();
        }
      } else if (e.key === 'h' || e.key === 'H' || e.key === '?') {
        setGrimoireOpen(!grimoireOpen);
        sfx.click();
      } else if (e.key === 't' || e.key === 'T') {
        toggleTacticalView();
        sfx.click();
      } else if (e.key === 'l' || e.key === 'L') {
        toggleLang();
        sfx.click();
      } else if (e.key === 'm' || e.key === 'M') {
        toggleMute();
        sfx.click();
      } else if (e.key === 'r' || e.key === 'R') {
        if (!isAnimating && gameMode !== 'online') {
          sfx.click();
          resetGame();
        }
      } else if (cellToSow !== null && !isAnimating && !winner) {
        if (e.key === 'ArrowLeft' || e.key === 'a' || e.key === 'A' || e.key === 'q' || e.key === 'Q') {
          sfx.click();
          executeMove(cellToSow, 'cw');
        } else if (e.key === 'ArrowRight' || e.key === 'd' || e.key === 'D' || e.key === 'e' || e.key === 'E') {
          sfx.click();
          executeMove(cellToSow, 'ccw');
        }
      } else if (!isAnimating && !winner && started) {
        // Quick number select 1-5 for active player (only if my turn)
        if (gameMode === 'online' && myPlayerNumber !== currentPlayer) return;
        const num = parseInt(e.key, 10);
        if (num >= 1 && num <= 5) {
          const baseIndex = currentPlayer === 1 ? 0 : 6;
          const targetIndex = baseIndex + (num - 1);
          const c = cells.find(cl => cl.index === targetIndex);
          if (c && c.stones > 0) {
            selectCell(targetIndex);
            sfx.click();
          }
        }
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [cellToSow, isAnimating, winner, started, grimoireOpen, currentPlayer, cells, selectCell, executeMove, resetGame, toggleMute, toggleTacticalView, toggleLang, setGrimoireOpen]);

  const isDraw = winner === 'Draw!';
  const winnerPlayer = winner?.includes('1') ? 1 : 2;

  return (
    <div id="app">
      <Game />

      {/* ---------- Top HUD ---------- */}
      {started && (
        <header className="hud-top">
          <div className="hud-title">
            <span>{t.title}</span>
            {gameMode === 'online' && (
              <span className="hud-mp-tag">
                <span className="mp-tag-dot" />
                {t.roomCode}: <b>{roomId?.toUpperCase()}</b> · <span className={`mp-role-tag p${myPlayerNumber}`}>{myPlayerNumber === 1 ? t.playerI : t.playerII}</span>
              </span>
            )}
          </div>
        </header>
      )}

      {started && (
        <div className="hud-tools">
          <button 
            id="lang-btn" 
            className="icon-btn lang-btn" 
            onClick={() => { toggleLang(); sfx.click(); }} 
            aria-label={t.langToggle} 
            title={`${t.langToggle} (L)`}
          >
            <span className="lang-code">{lang.toUpperCase()}</span>
          </button>
          <button 
            ref={grimoireBtnRef}
            id="grimoire-btn" 
            className={`icon-btn ${grimoireOpen ? 'active' : ''}`} 
            onClick={() => { setGrimoireOpen(!grimoireOpen); sfx.click(); }} 
            aria-label={t.grimoireBtn} 
            title={t.grimoireBtn}
          >
            {Icon.tome}
          </button>
          <button 
            id="camera-btn" 
            className={`icon-btn ${tacticalView ? 'active' : ''}`} 
            onClick={() => { toggleTacticalView(); sfx.click(); }} 
            aria-label={tacticalView ? t.cinematicBtn : t.tacticalBtn} 
            title={tacticalView ? t.cinematicBtn : t.tacticalBtn}
          >
            {Icon.camera}
          </button>
          <button 
            id="mute-btn" 
            className="icon-btn" 
            onClick={() => { toggleMute(); sfx.click(); }} 
            aria-label={muted ? t.unmuteBtn : t.muteBtn} 
            title={muted ? t.unmuteBtn : t.muteBtn}
          >
            {muted ? Icon.mute : Icon.sound}
          </button>
          {gameMode === 'online' ? (
            <button 
              id="leave-btn" 
              className="icon-btn" 
              onClick={() => { sfx.click(); leaveOnline(); }} 
              aria-label={t.leaveRoom} 
              title={t.leaveRoom}
            >
              {Icon.cross}
            </button>
          ) : (
            <button 
              id="restart-btn" 
              className="icon-btn" 
              onClick={() => { sfx.click(); resetGame(); }} 
              aria-label={t.restartBtn} 
              title={t.restartBtn}
            >
              {Icon.restart}
            </button>
          )}
        </div>
      )}

      {/* ---------- Interactive Sowing Panel & Directional Controls ---------- */}
      {started && cellToSow !== null && !winner && !isAnimating && (
        <div id="dir-ui" className="sow-panel" aria-live="polite">
          <button
            className="sow-action-btn sow-left"
            onClick={() => { sfx.click(); executeMove(cellToSow, 'cw'); }}
            onMouseEnter={() => sfx.hover()}
          >
            <span className="sow-arrow">⟵</span>
            <div className="sow-text">
              <span className="sow-main">{t.sowCW}</span>
              <span className="sow-sub">{t.sowLeft}</span>
            </div>
          </button>

          <div className="sow-center-disc">
            <span className="sow-center-cell">{t.cell} {cellToSow + 1}</span>
            <span className="sow-center-rune">ᛟ</span>
            <button
              className="sow-cancel-btn"
              onClick={() => { sfx.click(); selectCell(null); }}
              title={`${t.cancel} (Esc)`}
            >
              ✕ {t.cancel}
            </button>
          </div>

          <button
            className="sow-action-btn sow-right"
            onClick={() => { sfx.click(); executeMove(cellToSow, 'ccw'); }}
            onMouseEnter={() => sfx.hover()}
          >
            <div className="sow-text">
              <span className="sow-main">{t.sowCCW}</span>
              <span className="sow-sub">{t.sowRight}</span>
            </div>
            <span className="sow-arrow">⟶</span>
          </button>
        </div>
      )}

      {/* ---------- Bottom HUD: orbs + belt ---------- */}
      {started && (
        <footer className="hud-bottom">
          <Orb player={1} score={p1Score} active={currentPlayer === 1 && !winner} label={t.playerI} />

          <div className="belt">
            <div id="turn-indicator" className={`turn-plate p${currentPlayer}`} key={currentPlayer}>
              <span className="rune">ᚠ</span>
              <span className="turn-name">{currentPlayer === 1 ? t.playerI : t.playerII}</span>
              <span className="rune">ᛟ</span>
            </div>
            <div className="belt-status">
              {winner 
                ? t.statusSilent 
                : isAnimating 
                  ? t.statusSowing 
                  : gameMode === 'online' && myPlayerNumber !== currentPlayer
                    ? t.opponentTurn
                    : cellToSow !== null 
                      ? t.statusChooseDir 
                      : t.statusSelectCell}
            </div>
          </div>

          <Orb player={2} score={p2Score} active={currentPlayer === 2 && !winner} label={t.playerII} />
        </footer>
      )}

      {/* ---------- Banners ---------- */}
      {banner && (
        <div className={`banner ${banner.tone}`} key={banner.id} role="status">
          <div className="banner-title">{banner.title}</div>
          {banner.subtitle && <div className="banner-sub">{banner.subtitle}</div>}
        </div>
      )}

      {/* ---------- Grimoire / Tome of Rules & Lore Modal ---------- */}
      {grimoireOpen && (
        <div 
          className="grimoire-overlay" 
          onClick={() => { setGrimoireOpen(false); sfx.click(); }}
          role="dialog"
          aria-modal="true"
          aria-labelledby="grimoire-dialog-title"
        >
          <div ref={grimoireTomeRef} className="grimoire-tome" onClick={(e) => e.stopPropagation()}>
            <div className="grimoire-header">
              <div className="grimoire-kicker">{t.grimoireHeaderKicker}</div>
              <h2 id="grimoire-dialog-title" className="grimoire-title">{t.grimoireHeaderTitle}</h2>
              <button 
                className="grimoire-close" 
                onClick={() => { setGrimoireOpen(false); sfx.click(); }} 
                aria-label={t.grimoireClose}
              >
                {Icon.cross}
              </button>
            </div>

            <nav className="grimoire-tabs">
              <button 
                className={`grimoire-tab ${activeTab === 'ritual' ? 'active' : ''}`}
                onClick={() => { setActiveTab('ritual'); sfx.hover(); }}
              >
                {t.tabRitual}
              </button>
              <button 
                className={`grimoire-tab ${activeTab === 'reaping' ? 'active' : ''}`}
                onClick={() => { setActiveTab('reaping'); sfx.hover(); }}
              >
                {t.tabReaping}
              </button>
              <button 
                className={`grimoire-tab ${activeTab === 'mandarin' ? 'active' : ''}`}
                onClick={() => { setActiveTab('mandarin'); sfx.hover(); }}
              >
                {t.tabMandarin}
              </button>
              <button 
                className={`grimoire-tab ${activeTab === 'debt' ? 'active' : ''}`}
                onClick={() => { setActiveTab('debt'); sfx.hover(); }}
              >
                {t.tabDebt}
              </button>
              <button 
                className={`grimoire-tab ${activeTab === 'controls' ? 'active' : ''}`}
                onClick={() => { setActiveTab('controls'); sfx.hover(); }}
              >
                {t.tabControls}
              </button>
            </nav>

            <div className="grimoire-body">
              {activeTab === 'ritual' && (
                <article className="grimoire-article">
                  <h3>{t.ritualTitle}</h3>
                  <p>{t.ritualP1}</p>
                  <ul>
                    <li><b>{t.ritualCitizen.split(':')[0]}:</b> {t.ritualCitizen.split(':')[1]}</li>
                    <li><b>{t.ritualMandarin.split(':')[0]}:</b> {t.ritualMandarin.split(':')[1]}</li>
                  </ul>
                  <p><b>{t.ritualWin}</b></p>
                </article>
              )}

              {activeTab === 'reaping' && (
                <article className="grimoire-article">
                  <h3>{t.reapingTitle}</h3>
                  <p>{t.reapingP1}</p>
                  <ol>
                    <li><b>{t.reapingStep1.split(':')[0]}:</b> {t.reapingStep1.split(':')[1]}</li>
                    <li><b>{t.reapingStep2.split(':')[0]}:</b> {t.reapingStep2.split(':')[1]}</li>
                    <li><b>{t.reapingStep3.split(':')[0]}:</b> {t.reapingStep3.split(':')[1]}</li>
                    <li><b>{t.reapingStep4.split(':')[0]}:</b> {t.reapingStep4.split(':')[1]}</li>
                    <li><b>{t.reapingStep5.split(':')[0]}:</b> {t.reapingStep5.split(':')[1]}</li>
                  </ol>
                </article>
              )}

              {activeTab === 'mandarin' && (
                <article className="grimoire-article">
                  <h3>{t.mandarinTitle}</h3>
                  <p>{t.mandarinP1}</p>
                  <ul>
                    <li>{t.mandarinRule1}</li>
                    <li>{t.mandarinRule2}</li>
                    <li>{t.mandarinRule3}</li>
                  </ul>
                </article>
              )}

              {activeTab === 'debt' && (
                <article className="grimoire-article">
                  <h3>{t.debtTitle}</h3>
                  <p>{t.debtP1}</p>
                  <ul>
                    <li>{t.debtRule1}</li>
                    <li>{t.debtRule2}</li>
                    <li>{t.debtRule3}</li>
                  </ul>
                </article>
              )}

              {activeTab === 'controls' && (
                <article className="grimoire-article">
                  <h3>{t.controlsTitle}</h3>
                  <div className="grimoire-keymap">
                    <div className="key-row"><kbd>1</kbd> – <kbd>5</kbd> <span>{t.key15}</span></div>
                    <div className="key-row"><kbd>Q</kbd> / <kbd>←</kbd> / <kbd>A</kbd> <span>{t.keyLeft}</span></div>
                    <div className="key-row"><kbd>E</kbd> / <kbd>→</kbd> / <kbd>D</kbd> <span>{t.keyRight}</span></div>
                    <div className="key-row"><kbd>Kéo chuột / Drag</kbd> <span>{t.keyDrag}</span></div>
                    <div className="key-row"><kbd>Mũi tên 3D / 3D Arrows</kbd> <span>{t.keyArrows}</span></div>
                    <div className="key-row"><kbd>T</kbd> <span>{t.keyTactical}</span></div>
                    <div className="key-row"><kbd>L</kbd> <span>{t.langToggle}</span></div>
                    <div className="key-row"><kbd>H</kbd> / <kbd>?</kbd> <span>{t.keyTome}</span></div>
                    <div className="key-row"><kbd>M</kbd> <span>{t.keyMute}</span></div>
                    <div className="key-row"><kbd>R</kbd> <span>{t.keyRestart}</span></div>
                    <div className="key-row"><kbd>Esc</kbd> <span>{t.keyEsc}</span></div>
                  </div>
                </article>
              )}
            </div>

            <div className="grimoire-footer">
              <button className="btn-d2" onClick={() => { setGrimoireOpen(false); sfx.click(); }}>
                {t.grimoireBack}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ---------- Sanctuary Portal & Gates (Title Transition) ---------- */}
      <section className={`sanctuary-portal ${doorsOpening ? 'opening' : ''} ${started ? 'gone' : ''}`} aria-hidden={started}>
        {/* Double Gothic Stone Gates with Iron Bands and Demonic Seal */}
        <div className="sanctuary-doors">
          <div className="door-panel door-left">
            <div className="door-relief" />
            <div className="door-iron-bands">
              <span className="iron-band top" />
              <span className="iron-band mid" />
              <span className="iron-band bot" />
            </div>
          </div>

          <div className="door-panel door-right">
            <div className="door-relief" />
            <div className="door-iron-bands">
              <span className="iron-band top" />
              <span className="iron-band mid" />
              <span className="iron-band bot" />
            </div>
          </div>

          {/* Central Demonic Seal that fractures and bursts on opening */}
          <div className="sanctuary-seal">
            <div className="seal-ring outer" />
            <div className="seal-ring inner" />
            <div className="seal-rune">ᛟ</div>
          </div>
        </div>

        {/* Portal Arch Vignette Frame */}
        <div className="portal-arch" />

        {/* Title Content Overlay */}
        <div className="title-content">
          <p className="title-kicker">{t.kicker}</p>
          <h1 className="title-main">{t.title}</h1>
          <div className="title-divider">
            <span />
          </div>
          <p className="title-sub">{t.sub}</p>
          <div className="title-actions">
            <button 
              id="start-btn" 
              className="btn-d2 btn-big" 
              onClick={start} 
              disabled={doorsOpening || started}
              onMouseEnter={() => sfx.hover()} 
              tabIndex={started ? -1 : 0}
            >
              {t.enterBtn}
            </button>
            <button 
              id="mp-btn" 
              className="btn-d2 btn-big btn-mp" 
              onClick={() => { setMultiplayerOpen(true); sfx.click(); }} 
              disabled={doorsOpening || started}
              onMouseEnter={() => sfx.hover()} 
              tabIndex={started ? -1 : 0}
            >
              ⚔️ {t.onlineDuelBtn}
            </button>
          </div>
          <p className="title-tip">{t.titleTip}</p>
        </div>
      </section>

      {/* ---------- Victory screen ---------- */}
      {winner && (
        <section id="message-overlay" className={`victory ${isDraw ? 'draw' : `win p${winnerPlayer}`}`}>
          <p className="victory-kicker">{isDraw ? t.drawKicker : t.winKicker}</p>
          <div className="victory-title win-text">
            {isDraw ? t.drawTitle : winnerPlayer === 1 ? t.winP1Title : t.winP2Title}
          </div>
          <div className="victory-scores">
            <span className="vs p1">
              <b>{p1Score}</b> {t.playerI}
            </span>
            <span className="vs-sep">◆</span>
            <span className="vs p2">
              {t.playerII} <b>{p2Score}</b>
            </span>
          </div>

          {gameMode === 'online' ? (
            <div className="victory-actions">
              {rematchState === 'idle' && (
                <button
                  className="btn-d2 reset-btn"
                  onClick={() => {
                    sfx.click();
                    network.send({ type: 'REMATCH_REQUEST' });
                    setRematchState('requested_by_me');
                  }}
                  onMouseEnter={() => sfx.hover()}
                >
                  ⚔️ {t.requestRematch}
                </button>
              )}
              {rematchState === 'requested_by_me' && (
                <button className="btn-d2 reset-btn" disabled>
                  ⏳ {t.rematchRequested}
                </button>
              )}
              {rematchState === 'requested_by_opponent' && (
                <button
                  className="btn-d2 reset-btn"
                  onClick={() => {
                    sfx.click();
                    if (myPlayerNumber === 1) {
                      const fresh = initGame();
                      resetGameOnline(fresh.cells, fresh.stones);
                      network.send({ type: 'REMATCH_ACCEPT', cells: fresh.cells, stones: fresh.stones });
                    } else {
                      network.send({ type: 'REMATCH_REQUEST' });
                      setRematchState('requested_by_me');
                    }
                  }}
                  onMouseEnter={() => sfx.hover()}
                >
                  ✨ {t.acceptRematch}
                </button>
              )}
              <button
                className="btn-d2 reset-btn btn-secondary"
                onClick={() => {
                  sfx.click();
                  leaveOnline();
                }}
                onMouseEnter={() => sfx.hover()}
              >
                🚪 {t.leaveRoom}
              </button>
            </div>
          ) : (
            <button className="btn-d2 reset-btn" onClick={() => { sfx.click(); resetGame(); }} onMouseEnter={() => sfx.hover()}>
              {t.fightAgain}
            </button>
          )}
        </section>
      )}

      {/* ---------- Multiplayer Sanctuary Modal ---------- */}
      <MultiplayerModal
        isOpen={multiplayerOpen}
        onClose={() => setMultiplayerOpen(false)}
        initialRoomCode={inviteRoomCode}
      />
    </div>
  );
}
