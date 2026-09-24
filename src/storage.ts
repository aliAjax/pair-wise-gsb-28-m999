// 存储层：用 localStorage 模拟两台电脑共享的“服务端”真相。
// 同一浏览器开两个标签页即两台调度电脑：一个标签页保存后，
// 另一个标签页通过 window 的 storage 事件收到最新真相，
// 拖拽提交时再与本地快照的修订序号核对，模拟乐观锁。

import {
  ConflictRecord,
  DeliveryOrder,
  HandoverRequest
} from "./types";
import { seedOrders } from "./data";

const STORAGE_KEY = "hxwlfront-14-board-v2";

export interface BoardState {
  orders: DeliveryOrder[];
  conflicts: ConflictRecord[];
  handovers: HandoverRequest[];
  /** 演示用：最近一次由“另一台电脑”做出的修改 */
  lastRemoteTick: string | null;
}

export function seedState(): BoardState {
  return {
    orders: seedOrders(),
    conflicts: [],
    handovers: [],
    lastRemoteTick: null
  };
}

export function loadState(): BoardState {
  const raw = localStorage.getItem(STORAGE_KEY);
  if (!raw) return seedState();
  try {
    const parsed = JSON.parse(raw) as Partial<BoardState>;
    return {
      orders: Array.isArray(parsed.orders) ? parsed.orders : seedOrders(),
      conflicts: Array.isArray(parsed.conflicts) ? parsed.conflicts : [],
      handovers: Array.isArray(parsed.handovers) ? parsed.handovers : [],
      lastRemoteTick: parsed.lastRemoteTick ?? null
    };
  } catch {
    return seedState();
  }
}

/**
 * 保存并通知其它标签页。
 * origin 标记本次写入来自哪个标签页（哪台电脑）。
 * storage 事件只在“其它”标签页触发，本页不会收到，因此本页状态由调用方自行更新。
 */
export function saveState(state: BoardState, origin: string) {
  const payload = JSON.stringify({ ...state, origin });
  localStorage.setItem(STORAGE_KEY, payload);
}

/** 订阅其它标签页（其它电脑）写入的最新真相 */
export function subscribeRemote(cb: (state: BoardState, origin: string) => void): () => void {
  const onStorage = (event: StorageEvent) => {
    if (event.key !== STORAGE_KEY || !event.newValue) return;
    try {
      const parsed = JSON.parse(event.newValue) as BoardState & { origin?: string };
      cb(parsed, parsed.origin ?? "remote");
    } catch {
      /* 坏数据忽略 */
    }
  };
  window.addEventListener("storage", onStorage);
  return () => window.removeEventListener("storage", onStorage);
}
