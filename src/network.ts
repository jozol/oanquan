import { Peer, type DataConnection } from 'peerjs';
import type { CellData, StoneData } from './store';

export type NetworkMessage =
  | { type: 'INIT_STATE'; cells: CellData[]; stones: StoneData[]; currentPlayer: number }
  | { type: 'MOVE'; startIndex: number; dir: 'cw' | 'ccw' }
  | { type: 'BORROW_SYNC'; player: number; borrowedStones: StoneData[] }
  | { type: 'SYNC_CHECK'; p1Score: number; p2Score: number; cells: CellData[]; stones: StoneData[] }
  | { type: 'REMATCH_REQUEST' }
  | { type: 'REMATCH_ACCEPT'; cells: CellData[]; stones: StoneData[] }
  | { type: 'REMATCH_DECLINE' }
  | { type: 'CHAT'; text: string; sender: 1 | 2 }
  | { type: 'LEAVE' }
  | { type: '__BC_HANDSHAKE_GUEST__' }
  | { type: '__BC_HANDSHAKE_HOST__' };

type MessageHandler = (msg: NetworkMessage) => void;
type StatusHandler = (status: 'disconnected' | 'connecting' | 'waiting' | 'connected' | 'error', error?: string | null) => void;

function generateCode(): string {
  const chars = '23456789abcdefghjkmnpqrstuvwxyz';
  let result = '';
  for (let i = 0; i < 5; i++) {
    result += chars.charAt(Math.floor(Math.random() * chars.length));
  }
  return result;
}

const PEER_PREFIX = 'oaq-';

const ICE_SERVERS = [
  { urls: 'stun:stun.l.google.com:19302' },
  { urls: 'stun:stun1.l.google.com:19302' },
  { urls: 'stun:stun2.l.google.com:19302' },
  { urls: 'stun:stun.cloudflare.com:3478' },
];

class NetworkService {
  private peer: Peer | null = null;
  private connection: DataConnection | null = null;
  private broadcastChannel: BroadcastChannel | null = null;
  private messageListeners: Set<MessageHandler> = new Set();
  private statusListeners: Set<StatusHandler> = new Set();
  private currentRoomCode: string | null = null;
  private isHost: boolean = false;
  private activeTransport: 'webrtc' | 'broadcast' | null = null;
  private retryTimer: any = null;

  public onMessage(handler: MessageHandler): () => void {
    this.messageListeners.add(handler);
    return () => this.messageListeners.delete(handler);
  }

  public onStatus(handler: StatusHandler): () => void {
    this.statusListeners.add(handler);
    return () => this.statusListeners.delete(handler);
  }

  private notifyStatus(status: 'disconnected' | 'connecting' | 'waiting' | 'connected' | 'error', error: string | null = null) {
    this.statusListeners.forEach(h => h(status, error));
  }

  private notifyMessage(msg: NetworkMessage) {
    this.messageListeners.forEach(h => h(msg));
  }

  public getRoomCode(): string | null {
    return this.currentRoomCode;
  }

  public getIsHost(): boolean {
    return this.isHost;
  }

  public isConnected(): boolean {
    return this.activeTransport !== null;
  }

  /**
   * Host creates a room: listens on both BroadcastChannel (for local same-browser tabs)
   * and WebRTC (for cross-device / remote opponents).
   */
  public async createRoom(): Promise<string> {
    this.cleanup();
    this.isHost = true;
    this.notifyStatus('connecting');

    const code = generateCode();
    const peerId = `${PEER_PREFIX}${code}`;
    this.currentRoomCode = code;

    // 1. Setup local BroadcastChannel
    this.setupLocalHostChannel(code);

    // 2. Setup WebRTC Peer
    return new Promise((resolve, reject) => {
      try {
        const peer = new Peer(peerId, {
          debug: 1,
          config: { iceServers: ICE_SERVERS },
        });

        this.peer = peer;

        peer.on('open', (id) => {
          const roomCode = id.replace(PEER_PREFIX, '');
          this.currentRoomCode = roomCode;
          this.notifyStatus('waiting');
          resolve(roomCode);
        });

        peer.on('connection', (conn) => {
          this.setupWebRTCConnection(conn);
        });

        peer.on('error', (err) => {
          console.warn('[PeerJS Host Error]:', err);
          if (err.type === 'unavailable-id') {
            // Retry with new code if collision occurs
            this.createRoom().then(resolve).catch(reject);
          } else {
            // Still waiting via local channel even if remote broker has temporary hiccups
            if (!this.activeTransport) {
              this.notifyStatus('waiting');
            }
          }
        });

        peer.on('disconnected', () => {
          if (this.activeTransport === 'webrtc') {
            this.notifyStatus('disconnected');
          }
        });
      } catch (err: any) {
        console.warn('[PeerJS Host Init Exception]:', err);
        // Fall back to local channel waiting
        this.notifyStatus('waiting');
        resolve(code);
      }
    });
  }

  /**
   * Guest joins an existing room:
   * First tries BroadcastChannel (instant for local tabs), and simultaneously
   * connects via WebRTC with automatic retry for broker propagation delay.
   */
  public async joinRoom(inputCode: string): Promise<string> {
    this.cleanup();
    this.isHost = false;
    this.notifyStatus('connecting');

    const cleanCode = inputCode.trim().toLowerCase().replace(PEER_PREFIX, '');
    const targetPeerId = `${PEER_PREFIX}${cleanCode}`;
    this.currentRoomCode = cleanCode;

    // 1. Try local BroadcastChannel handshake
    this.setupLocalGuestChannel(cleanCode);

    // 2. Try WebRTC with retry mechanism
    return new Promise((resolve) => {
      let attempts = 0;
      const maxAttempts = 6;

      const connectPeer = () => {
        if (this.activeTransport === 'broadcast') {
          // Already connected locally
          resolve(cleanCode);
          return;
        }

        try {
          if (!this.peer) {
            this.peer = new Peer({
              debug: 1,
              config: { iceServers: ICE_SERVERS },
            });
          }

          const peer = this.peer;

          const attemptConnect = () => {
            if (this.activeTransport) return;
            attempts++;

            const conn = peer.connect(targetPeerId, {
              reliable: true,
            });

            this.setupWebRTCConnection(conn);

            conn.on('error', (connErr) => {
              console.warn(`[WebRTC conn attempt ${attempts} error]:`, connErr);
            });
          };

          if (peer.open) {
            attemptConnect();
          } else {
            peer.once('open', () => {
              attemptConnect();
            });
          }

          peer.on('error', (err) => {
            console.warn(`[PeerJS Guest Error attempt ${attempts}]:`, err);
            if (this.activeTransport === 'broadcast') return;

            if (err.type === 'peer-unavailable') {
              if (attempts < maxAttempts) {
                this.notifyStatus('connecting', `Locating sanctuary... (attempt ${attempts}/${maxAttempts})`);
                this.retryTimer = setTimeout(() => {
                  if (!this.activeTransport) {
                    attemptConnect();
                  }
                }, 1000);
                return;
              }
              this.notifyStatus('error', 'Sanctuary not found. The room code may be incorrect or expired.');
            } else {
              this.notifyStatus('error', err.message || 'Connection error');
            }
          });
        } catch (err: any) {
          console.warn('[PeerJS Guest Init Exception]:', err);
        }

        resolve(cleanCode);
      };

      connectPeer();
    });
  }

  // --- Local BroadcastChannel Transport ---

  private setupLocalHostChannel(code: string) {
    if (typeof BroadcastChannel === 'undefined') return;
    try {
      this.broadcastChannel = new BroadcastChannel(`oanquan_room_${code}`);
      this.broadcastChannel.onmessage = (e) => {
        const msg = e.data as NetworkMessage;
        if (msg.type === '__BC_HANDSHAKE_GUEST__') {
          // Respond to guest
          this.activeTransport = 'broadcast';
          this.broadcastChannel?.postMessage({ type: '__BC_HANDSHAKE_HOST__' });
          this.notifyStatus('connected');
        } else if (msg.type === 'LEAVE') {
          this.notifyStatus('disconnected', 'Opponent disconnected');
        } else if (!msg.type.startsWith('__BC_')) {
          this.notifyMessage(msg);
        }
      };
    } catch (err) {
      console.warn('[BroadcastChannel Host Error]:', err);
    }
  }

  private setupLocalGuestChannel(code: string) {
    if (typeof BroadcastChannel === 'undefined') return;
    try {
      this.broadcastChannel = new BroadcastChannel(`oanquan_room_${code}`);
      this.broadcastChannel.onmessage = (e) => {
        const msg = e.data as NetworkMessage;
        if (msg.type === '__BC_HANDSHAKE_HOST__') {
          // Host responded! Connection established
          this.activeTransport = 'broadcast';
          if (this.retryTimer) clearTimeout(this.retryTimer);
          this.notifyStatus('connected');
        } else if (msg.type === 'LEAVE') {
          this.notifyStatus('disconnected', 'Opponent disconnected');
        } else if (!msg.type.startsWith('__BC_')) {
          this.notifyMessage(msg);
        }
      };

      // Send initial handshake ping
      this.broadcastChannel.postMessage({ type: '__BC_HANDSHAKE_GUEST__' });
      // Repeat handshake ping after 200ms in case host was loading
      setTimeout(() => {
        if (!this.activeTransport) {
          this.broadcastChannel?.postMessage({ type: '__BC_HANDSHAKE_GUEST__' });
        }
      }, 200);
    } catch (err) {
      console.warn('[BroadcastChannel Guest Error]:', err);
    }
  }

  // --- WebRTC Transport ---

  private setupWebRTCConnection(conn: DataConnection) {
    this.connection = conn;

    conn.on('open', () => {
      this.activeTransport = 'webrtc';
      if (this.retryTimer) clearTimeout(this.retryTimer);
      this.notifyStatus('connected');
    });

    conn.on('data', (data) => {
      if (typeof data === 'object' && data !== null && 'type' in data) {
        this.notifyMessage(data as NetworkMessage);
      }
    });

    conn.on('close', () => {
      if (this.activeTransport === 'webrtc') {
        this.notifyStatus('disconnected', 'Opponent disconnected');
        this.activeTransport = null;
      }
      this.connection = null;
    });

    conn.on('error', (err) => {
      console.warn('[PeerJS DataConnection Error]:', err);
      if (this.activeTransport === 'webrtc') {
        this.notifyStatus('error', err?.message || 'Data connection error');
      }
    });
  }

  public send(msg: NetworkMessage) {
    // 1. BroadcastChannel transport
    if (this.activeTransport === 'broadcast' && this.broadcastChannel) {
      try {
        this.broadcastChannel.postMessage(msg);
      } catch (err) {
        console.error('[BroadcastChannel Send Error]:', err);
      }
      return;
    }

    // 2. WebRTC transport
    if (this.connection && this.connection.open) {
      try {
        this.connection.send(msg);
      } catch (err) {
        console.error('[WebRTC Send Error]:', err);
      }
    }
  }

  public cleanup() {
    if (this.retryTimer) {
      clearTimeout(this.retryTimer);
      this.retryTimer = null;
    }

    if (this.broadcastChannel) {
      try {
        this.broadcastChannel.postMessage({ type: 'LEAVE' });
        this.broadcastChannel.close();
      } catch (_) {}
      this.broadcastChannel = null;
    }

    if (this.connection) {
      try {
        this.connection.send({ type: 'LEAVE' });
        this.connection.close();
      } catch (_) {}
      this.connection = null;
    }

    if (this.peer) {
      try {
        this.peer.destroy();
      } catch (_) {}
      this.peer = null;
    }

    this.currentRoomCode = null;
    this.isHost = false;
    this.activeTransport = null;
    this.notifyStatus('disconnected');
  }
}

export const network = new NetworkService();
