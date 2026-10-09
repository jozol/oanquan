import { useState, useEffect } from 'react';
import { network, type NetworkMessage } from '../network';
import { useGameStore } from '../store';
import { useFx } from '../fx';
import { sfx } from '../audio';
import { useI18n, translations } from '../i18n';

interface MultiplayerModalProps {
  isOpen: boolean;
  onClose: () => void;
  initialRoomCode?: string | null;
}

export function MultiplayerModal({ isOpen, onClose, initialRoomCode }: MultiplayerModalProps) {
  const lang = useI18n(s => s.lang);
  const t = translations[lang];

  const peerStatus = useGameStore(s => s.peerStatus);
  const peerError = useGameStore(s => s.peerError);
  const setGameMode = useGameStore(s => s.setGameMode);
  const setPeerStatus = useGameStore(s => s.setPeerStatus);
  const setRematchState = useGameStore(s => s.setRematchState);
  const syncRemoteBoard = useGameStore(s => s.syncRemoteBoard);
  const syncScoresAndCounts = useGameStore(s => s.syncScoresAndCounts);
  const resetGameOnline = useGameStore(s => s.resetGameOnline);
  const executeMove = useGameStore(s => s.executeMove);
  
  const start = useFx(s => s.start);
  const started = useFx(s => s.started);

  const [activeTab, setActiveTab] = useState<'host' | 'join'>(initialRoomCode ? 'join' : 'host');
  const [joinCode, setJoinCode] = useState(initialRoomCode || '');
  const [copied, setCopied] = useState(false);
  const [isJoining, setIsJoining] = useState(false);
  const [isHosting, setIsHosting] = useState(false);
  const [hostRoomCode, setHostRoomCode] = useState<string | null>(null);

  // Set up network listeners
  useEffect(() => {
    const unsubStatus = network.onStatus((status, error) => {
      setPeerStatus(status, error);
      if (status === 'connected') {
        const isHost = network.getIsHost();
        const code = network.getRoomCode();
        setGameMode('online', isHost ? 1 : 2, code);

        if (isHost) {
          // As host, generate initial synchronized state and broadcast to guest
          const { cells, stones, currentPlayer } = useGameStore.getState();
          network.send({
            type: 'INIT_STATE',
            cells,
            stones,
            currentPlayer,
          });
        }

        // Start game entrance if not started yet
        if (!started) {
          start();
        }

        // Close modal after brief connection acknowledgement
        setTimeout(() => {
          onClose();
        }, 600);
      }
    });

    const unsubMsg = network.onMessage((msg: NetworkMessage) => {
      switch (msg.type) {
        case 'INIT_STATE':
          setGameMode('online', 2, network.getRoomCode());
          syncRemoteBoard(msg.cells, msg.stones, msg.currentPlayer);
          if (!useFx.getState().started) {
            start();
          }
          break;

        case 'MOVE':
          executeMove(msg.startIndex, msg.dir, true);
          break;

        case 'SYNC_CHECK':
          syncScoresAndCounts(msg.p1Score, msg.p2Score, msg.cellCounts);
          break;

        case 'REMATCH_REQUEST':
          setRematchState('requested_by_opponent');
          break;

        case 'REMATCH_ACCEPT':
          resetGameOnline(msg.cells, msg.stones);
          break;

        case 'LEAVE':
          setPeerStatus('disconnected', t.opponentDisconnected);
          break;
      }
    });

    return () => {
      unsubStatus();
      unsubMsg();
    };
  }, [setGameMode, setPeerStatus, setRematchState, syncRemoteBoard, syncScoresAndCounts, resetGameOnline, executeMove, start, started, onClose, t.opponentDisconnected]);

  // If initialRoomCode is passed (via URL parameter), auto-populate and trigger join
  useEffect(() => {
    if (initialRoomCode) {
      setJoinCode(initialRoomCode);
      setActiveTab('join');
      handleJoin(initialRoomCode);
    }
  }, [initialRoomCode]);

  const handleHost = async () => {
    setIsHosting(true);
    sfx.click();
    try {
      const code = await network.createRoom();
      setHostRoomCode(code);
      setGameMode('online', 1, code);
    } catch (err) {
      console.error(err);
    } finally {
      setIsHosting(false);
    }
  };

  const handleJoin = async (codeToUse?: string) => {
    const code = (codeToUse || joinCode).trim();
    if (!code) return;
    setIsJoining(true);
    sfx.click();
    try {
      await network.joinRoom(code);
      setGameMode('online', 2, code);
    } catch (err) {
      console.error(err);
    } finally {
      setIsJoining(false);
    }
  };

  const handleCopyLink = () => {
    sfx.click();
    if (!hostRoomCode) return;
    const url = `${window.location.origin}${window.location.pathname}?room=${hostRoomCode}`;
    navigator.clipboard.writeText(url).then(() => {
      setCopied(true);
      setTimeout(() => setCopied(false), 2500);
    });
  };

  if (!isOpen) return null;

  return (
    <div className="grimoire-overlay" onClick={onClose} role="dialog" aria-modal="true">
      <div className="grimoire-tome mp-modal" onClick={e => e.stopPropagation()}>
        <div className="grimoire-header">
          <div className="grimoire-kicker">{t.multiplayerKicker}</div>
          <h2 className="grimoire-title">{t.multiplayerTitle}</h2>
          <button className="grimoire-close" onClick={onClose} aria-label={t.cancel}>
            ✕
          </button>
        </div>

        <nav className="grimoire-tabs">
          <button
            className={`grimoire-tab ${activeTab === 'host' ? 'active' : ''}`}
            onClick={() => { setActiveTab('host'); sfx.hover(); }}
          >
            🏰 {t.createMatch}
          </button>
          <button
            className={`grimoire-tab ${activeTab === 'join' ? 'active' : ''}`}
            onClick={() => { setActiveTab('join'); sfx.hover(); }}
          >
            ⚔️ {t.joinMatch}
          </button>
        </nav>

        <div className="mp-content">
          {activeTab === 'host' && (
            <div className="mp-tab-pane">
              {!hostRoomCode && (
                <div className="mp-intro">
                  <p className="mp-desc">{t.youAreP1}</p>
                  <button
                    className="btn-d2 btn-big mp-action-btn"
                    onClick={handleHost}
                    disabled={isHosting}
                  >
                    {isHosting ? '...' : t.createMatch}
                  </button>
                </div>
              )}

              {hostRoomCode && (
                <div className="mp-lobby-box">
                  <div className="mp-code-label">{t.roomCode}</div>
                  <div className="mp-code-display">
                    <span className="mp-code-text">{hostRoomCode.toUpperCase()}</span>
                  </div>

                  <button className="btn-d2 mp-copy-btn" onClick={handleCopyLink}>
                    {copied ? `✓ ${t.linkCopied}` : `📋 ${t.copyInviteLink}`}
                  </button>

                  <div className="mp-status-pill">
                    <span className="mp-beacon-dot" />
                    <span>{peerStatus === 'connected' ? t.opponentJoined : t.waitingForOpponent}</span>
                  </div>
                </div>
              )}
            </div>
          )}

          {activeTab === 'join' && (
            <div className="mp-tab-pane">
              <div className="mp-intro">
                <p className="mp-desc">{t.youAreP2}</p>
                <div className="mp-input-group">
                  <input
                    type="text"
                    className="mp-code-input"
                    placeholder={t.enterRoomCode}
                    value={joinCode}
                    onChange={e => setJoinCode(e.target.value)}
                    maxLength={10}
                    onKeyDown={e => {
                      if (e.key === 'Enter') handleJoin();
                    }}
                  />
                  <button
                    className="btn-d2 mp-action-btn"
                    onClick={() => handleJoin()}
                    disabled={isJoining || !joinCode.trim()}
                  >
                    {isJoining ? '...' : t.joinBtn}
                  </button>
                </div>
                {peerError && <p className="mp-error-msg">⚠️ {peerError}</p>}
                {isJoining && (
                  <div className="mp-status-pill">
                    <span className="mp-beacon-dot" />
                    <span>{t.joiningRoom}</span>
                  </div>
                )}
              </div>
            </div>
          )}
        </div>

        <div className="grimoire-footer mp-footer">
          <button className="btn-d2" onClick={onClose}>
            {t.cancelDuel}
          </button>
        </div>
      </div>
    </div>
  );
}
