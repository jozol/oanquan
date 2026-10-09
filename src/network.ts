import { Peer, type DataConnection } from 'peerjs';
import type { CellData, StoneData } from './store';

export type NetworkMessage =
  | { type: 'INIT_STATE'; cells: CellData[]; stones: StoneData[]; currentPlayer: number }
  | { type: 'MOVE'; startIndex: number; dir: 'cw' | 'ccw' }
  | { type: 'BORROW_SYNC'; player: number; borrowedStones: StoneData[] }
  | { type: 'SYNC_CHECK'; p1Score: number; p2Score: number; cellCounts: number[] }
  | { type: 'REMATCH_REQUEST' }
  | { type: 'REMATCH_ACCEPT'; cells: CellData[]; stones: StoneData[] }
  | { type: 'REMATCH_DECLINE' }
  | { type: 'EMOTE'; rune: string; text: string }
  | { type: 'LEAVE' };

type MessageHandler = (msg: NetworkMessage) => void;
type StatusHandler = (status: 'disconnected' | 'connecting' | 'waiting' | 'connected' | 'error', error?: string | null) => void;

function generateCode(): string {
  const chars = '23456789abcdefghjkmnpqrstuvwxyz'; // readable characters (omitting 0, 1, i, l, o)
  let result = '';
  for (let i = 0; i < 4; i++) {
    result += chars.charAt(Math.floor(Math.random() * chars.length));
  }
  return result;
}

const PEER_PREFIX = 'oaq-';

class NetworkService {
  private peer: Peer | null = null;
  private connection: DataConnection | null = null;
  private messageListeners: Set<MessageHandler> = new Set();
  private statusListeners: Set<StatusHandler> = new Set();
  private currentRoomCode: string | null = null;
  private isHost: boolean = false;

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
    return !!this.connection && this.connection.open;
  }

  /**
   * Host creates a room with an automatic or specified short room code.
   */
  public async createRoom(): Promise<string> {
    this.cleanup();
    this.isHost = true;
    this.notifyStatus('connecting');

    const code = generateCode();
    const peerId = `${PEER_PREFIX}${code}`;
    this.currentRoomCode = code;

    return new Promise((resolve, reject) => {
      try {
        const peer = new Peer(peerId, {
          debug: 1,
        });

        this.peer = peer;

        peer.on('open', (id) => {
          const roomCode = id.replace(PEER_PREFIX, '');
          this.currentRoomCode = roomCode;
          this.notifyStatus('waiting');
          resolve(roomCode);
        });

        peer.on('connection', (conn) => {
          // If another connection arrives, accept it
          this.setupConnection(conn);
        });

        peer.on('error', (err) => {
          console.warn('[PeerJS Host Error]:', err);
          if (err.type === 'unavailable-id') {
            // ID already taken, retry with new code
            this.createRoom().then(resolve).catch(reject);
          } else {
            this.notifyStatus('error', err.message || 'Connection error');
            reject(err);
          }
        });

        peer.on('disconnected', () => {
          this.notifyStatus('disconnected');
        });

        peer.on('close', () => {
          this.notifyStatus('disconnected');
        });
      } catch (err: any) {
        this.notifyStatus('error', err?.message || 'Failed to initialize peer');
        reject(err);
      }
    });
  }

  /**
   * Guest joins an existing room by its room code (e.g. "4f9k" or "oaq-4f9k").
   */
  public async joinRoom(inputCode: string): Promise<string> {
    this.cleanup();
    this.isHost = false;
    this.notifyStatus('connecting');

    const cleanCode = inputCode.trim().toLowerCase().replace(PEER_PREFIX, '');
    const targetPeerId = `${PEER_PREFIX}${cleanCode}`;
    this.currentRoomCode = cleanCode;

    return new Promise((resolve, reject) => {
      try {
        const peer = new Peer({
          debug: 1,
        });

        this.peer = peer;

        peer.on('open', () => {
          const conn = peer.connect(targetPeerId, {
            reliable: true,
          });

          this.setupConnection(conn);
          resolve(cleanCode);
        });

        peer.on('error', (err) => {
          console.warn('[PeerJS Guest Error]:', err);
          let message = err.message || 'Could not find or connect to room';
          if (err.type === 'peer-unavailable') {
            message = 'Sanctuary not found. The room code may be incorrect or expired.';
          }
          this.notifyStatus('error', message);
          reject(err);
        });

        peer.on('disconnected', () => {
          this.notifyStatus('disconnected');
        });

        peer.on('close', () => {
          this.notifyStatus('disconnected');
        });
      } catch (err: any) {
        this.notifyStatus('error', err?.message || 'Failed to connect');
        reject(err);
      }
    });
  }

  private setupConnection(conn: DataConnection) {
    this.connection = conn;

    conn.on('open', () => {
      this.notifyStatus('connected');
    });

    conn.on('data', (data) => {
      if (typeof data === 'object' && data !== null && 'type' in data) {
        this.notifyMessage(data as NetworkMessage);
      }
    });

    conn.on('close', () => {
      this.notifyStatus('disconnected', 'Opponent disconnected');
      this.connection = null;
    });

    conn.on('error', (err) => {
      console.warn('[PeerJS DataConnection Error]:', err);
      this.notifyStatus('error', err?.message || 'Data connection error');
    });
  }

  public send(msg: NetworkMessage) {
    if (this.connection && this.connection.open) {
      try {
        this.connection.send(msg);
      } catch (err) {
        console.error('[PeerJS Send Error]:', err);
      }
    }
  }

  public cleanup() {
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
    this.notifyStatus('disconnected');
  }
}

export const network = new NetworkService();
