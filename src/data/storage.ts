import type { DeliveryOrder, PersistShape } from "../domain/types";

export const STORAGE_KEY = "hxwlfront-14-dispatch-v1";

export const DRIVERS = ["刘师傅", "赵师傅", "孙师傅"] as const;

const now = () => new Date().toISOString();

/** 初始演示数据：覆盖 未派 / 已排 / 已发车 三种状态 */
export function seedOrders(): DeliveryOrder[] {
  return [
    { id: "seed-1", orderNo: "ORD-9012", destination: "浦东张江", weightKg: 260, driver: "刘师傅", status: "已排", revision: 3, seq: 0, updatedAt: now() },
    { id: "seed-2", orderNo: "ORD-9013", destination: "虹桥枢纽", weightKg: 180, driver: "刘师傅", status: "已发车", revision: 5, seq: 1, updatedAt: now() },
    { id: "seed-3", orderNo: "ORD-9021", destination: "嘉定工业区", weightKg: 140, driver: "赵师傅", status: "已排", revision: 2, seq: 0, updatedAt: now() },
    { id: "seed-4", orderNo: "ORD-9022", destination: "松江大学城", weightKg: 320, driver: "赵师傅", status: "已发车", revision: 4, seq: 1, updatedAt: now() },
    { id: "seed-5", orderNo: "ORD-9031", destination: "青浦练塘", weightKg: 90, driver: null, status: "未派", revision: 1, seq: 0, updatedAt: now() },
    { id: "seed-6", orderNo: "ORD-9032", destination: "奉贤海湾", weightKg: 210, driver: null, status: "未派", revision: 1, seq: 1, updatedAt: now() },
    { id: "seed-7", orderNo: "ORD-9033", destination: "金山卫", weightKg: 150, driver: null, status: "未派", revision: 2, seq: 2, updatedAt: now() }
  ];
}

export function loadPersisted(): PersistShape {
  const fallback: PersistShape = { orders: seedOrders(), conflicts: [], handovers: [] };
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return fallback;
    const parsed = JSON.parse(raw) as Partial<PersistShape>;
    return {
      orders: Array.isArray(parsed.orders) ? parsed.orders : fallback.orders,
      conflicts: Array.isArray(parsed.conflicts) ? parsed.conflicts : [],
      handovers: Array.isArray(parsed.handovers) ? parsed.handovers : []
    };
  } catch {
    return fallback;
  }
}

export function savePersisted(data: PersistShape) {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(data));
}
