import { useEffect, useState } from 'react';
import type { Creature, DisplayMessage } from 'shared';
import { fetchRecentCreatures } from '../../lib/display/recentCreatures.ts';
import { toWebSocketUrl } from '../../lib/display/webSocketUrl.ts';

const RECONNECT_DELAY_MS = 3000;

export type ConnectionStatus = 'connecting' | 'open' | 'closed';

const parseMessage = (data: unknown): DisplayMessage | null => {
  if (typeof data !== 'string') {
    return null;
  }

  try {
    const parsed: unknown = JSON.parse(data);

    return (parsed as DisplayMessage)?.type === 'creature_added'
      ? (parsed as DisplayMessage)
      : null;
  } catch {
    return null;
  }
};

/**
 * 大画面へ接続し、放流された作品を受け取る。切断されたら自動で接続し直す。
 * 接続するたびに直近の作品も読み込み、再読み込みや切断のあとも作品を表示し続ける。
 */
export const useCreatureStream = (
  onCreature: (creature: Creature) => void,
  onRestore: (creatures: Creature[]) => void,
) => {
  const [status, setStatus] = useState<ConnectionStatus>('connecting');

  useEffect(() => {
    let socket: WebSocket | null = null;
    let reconnectTimer: ReturnType<typeof setTimeout> | null = null;
    let disposed = false;

    const restore = async () => {
      try {
        const creatures = await fetchRecentCreatures();

        if (!disposed) {
          onRestore(creatures);
        }
      } catch (error) {
        console.error('作品の一覧を読み込めませんでした', error);
      }
    };

    const connect = () => {
      setStatus('connecting');
      socket = new WebSocket(toWebSocketUrl('/ws/display', window.location.href));

      // 接続が開いてから読み込むことで、読み込み中に放流された作品も通知で受け取れる
      socket.addEventListener('open', () => {
        setStatus('open');
        void restore();
      });

      socket.addEventListener('message', (event) => {
        const message = parseMessage(event.data);

        if (message !== null) {
          onCreature(message.creature);
        }
      });

      socket.addEventListener('close', () => {
        setStatus('closed');

        if (!disposed) {
          reconnectTimer = setTimeout(connect, RECONNECT_DELAY_MS);
        }
      });
    };

    connect();

    return () => {
      disposed = true;

      if (reconnectTimer !== null) {
        clearTimeout(reconnectTimer);
      }

      socket?.close();
    };
  }, [onCreature, onRestore]);

  return status;
};
