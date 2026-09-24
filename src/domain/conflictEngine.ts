import type { ConflictRecord, DeliveryOrder, DragIntent, HandoverRequest } from "../domain/types";

const nowIso = () => new Date().toISOString();
const uid = () => (crypto.randomUUID ? crypto.randomUUID() : `${Date.now()}-${Math.random().toString(16).slice(2)}`);

export interface DropResult {
  orders: DeliveryOrder[];
  conflict: ConflictRecord | null;
  blocked: string | null;
}

/**
 * 落子前的他端先存模拟：另一台电脑已经把该单保存过一次，
 * 当前修订序号 +1，可能还改派了司机。
 */
export function applyExternalBump(
  orders: DeliveryOrder[],
  orderId: string,
  newDriver: string | null | undefined
): DeliveryOrder[] {
  return orders.map((order) =>
    order.id === orderId
      ? {
          ...order,
          revision: order.revision + 1,
          driver: newDriver === undefined ? order.driver : newDriver,
          status: newDriver === undefined ? order.status : newDriver === null ? "未派" : "已排",
          updatedAt: nowIso()
        }
      : order
  );
}

function resequence(list: DeliveryOrder[]): DeliveryOrder[] {
  return list.map((order, index) => (order.seq === index ? order : { ...order, seq: index }));
}

function reseqContainers(orders: DeliveryOrder[], orderedContainerKey: string | null | undefined): DeliveryOrder[] {
  const buckets = new Map<string | null, DeliveryOrder[]>();
  for (const order of orders) {
    const key = order.status === "未派" ? null : order.driver;
    const list = buckets.get(key) ?? [];
    list.push(order);
    buckets.set(key, list);
  }
  // 目标容器保持落子后的给定顺序；其余容器按原 seq 排序后连续重编号
  const result: DeliveryOrder[] = [];
  for (const [key, list] of buckets) {
    if (key !== orderedContainerKey) list.sort((a, b) => a.seq - b.seq);
    result.push(...resequence(list));
  }
  return result;
}

function describeAction(intent: DragIntent): string {
  if (intent.targetDriver === null) return "移回未派池";
  return intent.kind === "reorder" ? `在 ${intent.targetDriver} 名下调整顺序` : `拖到 ${intent.targetDriver} 名下`;
}

/** 构造冲突记录（服务端当前序号与拖单携带序号不一致时） */
export function buildConflict(current: DeliveryOrder, intent: DragIntent): ConflictRecord {
  return {
    id: uid(),
    orderId: current.id,
    orderNo: current.orderNo,
    originalDriver: intent.sourceDriver,
    carriedRevision: intent.carriedRevision,
    currentRevision: current.revision,
    attemptedAction: describeAction(intent),
    currentDriver: current.driver,
    createdAt: nowIso(),
    resolved: false
  };
}

/**
 * 排班落子：先核对拖单携带的修订序号与当前序号。
 * - 已发车的单子直接拒绝（不允许拖动）
 * - 序号不一致：本次操作进入冲突区，排班结果不变
 * - 序号一致：落位成功，修订序号 +1，容器内重排序号
 */
export function applyDrop(ordersInput: DeliveryOrder[], intent: DragIntent): DropResult {
  const carried = ordersInput.find((order) => order.id === intent.orderId);
  if (!carried) return { orders: ordersInput, conflict: null, blocked: "配送单不存在或已被删除" };

  if (carried.status === "已发车") {
    return { orders: ordersInput, conflict: null, blocked: `${carried.orderNo} 已发车，不能拖动；如需换车请由原司机登记移交` };
  }

  if (carried.revision !== intent.carriedRevision) {
    return { orders: ordersInput, conflict: buildConflict(carried, intent), blocked: null };
  }

  const without = ordersInput.filter((order) => order.id !== carried.id);
  const target = intent.targetDriver;
  const moved: DeliveryOrder = {
    ...carried,
    driver: target,
    status: target === null ? "未派" : "已排",
    revision: carried.revision + 1,
    updatedAt: nowIso()
  };

  const sameContainer = (order: DeliveryOrder) =>
    target === null ? order.status === "未派" : order.driver === target && order.status !== "已发车";

  const siblings = without.filter(sameContainer).sort((a, b) => a.seq - b.seq);
  const index = Math.max(0, Math.min(intent.targetIndex, siblings.length));
  siblings.splice(index, 0, moved);

  const others = without.filter((order) => !sameContainer(order));
  const next = reseqContainers([...others, ...siblings], target);
  return { orders: next, conflict: null, blocked: null };
}

/** 已排 -> 已发车，修订序号 +1 */
export function markDeparted(orders: DeliveryOrder[], orderId: string): DeliveryOrder[] {
  return orders.map((order) =>
    order.id === orderId && order.status === "已排"
      ? { ...order, status: "已发车", revision: order.revision + 1, updatedAt: nowIso() }
      : order
  );
}

export interface HandoverDraft {
  orderId: string;
  fromDriver: string;
  toDriver: string;
  reason: string;
}

/** 只有已发车单子的原司机可以登记移交，且同一单同时只允许一条待确认移交 */
export function createHandover(
  orders: DeliveryOrder[],
  handovers: HandoverRequest[],
  draft: HandoverDraft
): { handovers: HandoverRequest[]; error: string | null } {
  const order = orders.find((item) => item.id === draft.orderId);
  if (!order) return { handovers, error: "配送单不存在" };
  if (order.status !== "已发车") return { handovers, error: "只有已发车的单子才能登记移交" };
  if (order.driver !== draft.fromDriver) return { handovers, error: "只能由原司机登记移交" };
  if (draft.toDriver === draft.fromDriver) return { handovers, error: "承接司机不能是原司机本人" };
  if (!draft.reason.trim()) return { handovers, error: "请填写移交原因" };
  const pending = handovers.some((item) => item.orderId === draft.orderId && item.status === "待确认");
  if (pending) return { handovers, error: "该单已有待确认的移交申请" };

  const request: HandoverRequest = {
    id: uid(),
    orderId: draft.orderId,
    orderNo: order.orderNo,
    fromDriver: draft.fromDriver,
    toDriver: draft.toDriver,
    reason: draft.reason.trim(),
    status: "待确认",
    createdAt: nowIso(),
    handledAt: null
  };
  return { handovers: [...handovers, request], error: null };
}

/** 承接司机确认后才换占用，序号同步 +1；也可拒绝 */
export function resolveHandover(
  orders: DeliveryOrder[],
  handovers: HandoverRequest[],
  requestId: string,
  decision: "confirm" | "reject"
): { orders: DeliveryOrder[]; handovers: HandoverRequest[]; error: string | null } {
  const request = handovers.find((item) => item.id === requestId);
  if (!request || request.status !== "待确认") return { orders, handovers, error: "移交申请不可处理" };

  const updatedRequest: HandoverRequest = {
    ...request,
    status: decision === "confirm" ? "已确认" : "已拒绝",
    handledAt: nowIso()
  };
  const nextHandovers = handovers.map((item) => (item.id === requestId ? updatedRequest : item));

  if (decision === "reject") {
    return { orders, handovers: nextHandovers, error: null };
  }

  const nextOrders = orders.map((order) =>
    order.id === request.orderId
      ? { ...order, driver: request.toDriver, revision: order.revision + 1, updatedAt: nowIso() }
      : order
  );
  return { orders: nextOrders, handovers: nextHandovers, error: null };
}
