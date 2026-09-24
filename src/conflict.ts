// 冲突判断层：纯函数，不接触 localStorage / React / dnd-kit。
// 排班操作带着本地快照的修订序号提交；服务端当前序号变了即判定冲突，
// 本次操作不生效，由调用方把返回的冲突记录放入冲突区。

import {
  ApplyResult,
  ConflictRecord,
  DeliveryOrder,
  ScheduleOperation
} from "./types";

export interface Refusal {
  code: "departed" | "missing";
  message: string;
}

/** 已发车（在途）的单子禁止拖拽，必须走司机移交登记 */
export function checkDraggable(order: DeliveryOrder | undefined): Refusal | null {
  if (!order) return { code: "missing", message: "配送单不存在或已被删除" };
  if (order.status === "departed") {
    return { code: "departed", message: "该单已发车，不能拖动，请由原司机登记移交" };
  }
  return null;
}

function makeConflict(
  op: ScheduleOperation,
  current: DeliveryOrder,
  reason: string
): ConflictRecord {
  return {
    id: crypto.randomUUID(),
    orderId: current.id,
    orderNo: current.orderNo,
    baseDriverId: op.baseDriverId,
    baseRevision: op.baseRevision,
    currentRevision: current.revision,
    currentDriverId: current.driverId,
    target: op.target,
    reason,
    operator: op.operator,
    status: "open",
    createdAt: new Date().toISOString()
  };
}

/**
 * 核对修订序号：
 * - 当前服务端序号 === 快照序号：操作可应用，返回 ok（具体改由调用方持久化）
 * - 序号不一致：拒绝，生成冲突记录（单号、原司机、当前序号等）
 */
export function evaluateOperation(
  order: DeliveryOrder | undefined,
  op: ScheduleOperation
): ApplyResult {
  const refusal = checkDraggable(order);
  if (refusal) return { ok: false, conflict: null };

  if (!order) return { ok: false, conflict: null };

  if (order.revision !== op.baseRevision) {
    return {
      ok: false,
      conflict: makeConflict(
        op,
        order,
        `修订序号已变化（本地 ${op.baseRevision} → 服务端 ${order.revision}），对方已先保存排班`
      )
    };
  }

  return { ok: true, conflict: null };
}

/** 应用一次已通过序号核对的排班操作，返回新的订单（序号 +1）并重排列内 rank */
export function applyScheduleOperation(
  orders: DeliveryOrder[],
  op: ScheduleOperation
): DeliveryOrder[] {
  const targetDriverId = op.target.kind === "driver" ? op.target.driverId : null;
  const now = new Date().toISOString();

  const moved = orders.find((o) => o.id === op.orderId);
  if (!moved) return orders;

  // 目标列中除被拖动单以外的成员
  const column = orders
    .filter((o) => o.driverId === targetDriverId && o.id !== op.orderId)
    .sort((a, b) => a.rank - b.rank);

  const insertAt = Math.max(0, Math.min(op.index, column.length));
  column.splice(insertAt, 0, moved);

  const rankOf = new Map<string, number>();
  column.forEach((o, i) => rankOf.set(o.id, (i + 1) * 1024));

  return orders.map((o) => {
    if (o.id === op.orderId) {
      const status = targetDriverId === null ? "unassigned" : "assigned";
      return {
        ...o,
        driverId: targetDriverId,
        status,
        revision: o.revision + 1,
        rank: rankOf.get(o.id) ?? 1024,
        updatedAt: now
      };
    }
    if (rankOf.has(o.id)) {
      return { ...o, rank: rankOf.get(o.id)! };
    }
    return o;
  });
}
