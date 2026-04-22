import type { Response } from "express";

type LiveChatMessageEvent = {
  id: string;
  seller_id: number;
  user_id: number;
  buyer_name: string;
  sender_role: "buyer" | "seller";
  message: string;
  created_at: string;
};

const registry = new Map<number, Set<Response>>();

export function addLiveChatConnection(sellerId: number, res: Response): void {
  let conns = registry.get(sellerId);
  if (!conns) {
    conns = new Set();
    registry.set(sellerId, conns);
  }

  conns.add(res);
}

export function removeLiveChatConnection(sellerId: number, res: Response): void {
  const conns = registry.get(sellerId);
  if (!conns) return;

  conns.delete(res);
  if (conns.size === 0) registry.delete(sellerId);
}

export function pushLiveChatMessage(
  sellerId: number,
  payload: LiveChatMessageEvent,
): void {
  const conns = registry.get(sellerId);
  if (!conns?.size) return;

  const frame = `event: live-chat-message\ndata: ${JSON.stringify(payload)}\n\n`;

  for (const res of conns) {
    try {
      res.write(frame);
      const writable = res as any;
      if (typeof writable.flush === "function") writable.flush();
    } catch {
      // Socket closed; cleanup happens on close listener.
    }
  }
}
