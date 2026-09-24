// 状态层：排班提交、在途移交、冲突留痕、配送资料维护都在此收口。
//
// 乐观锁模型：页面工作区持有“打开/上次同步”时的快照；另一台电脑（其它标签页）
// 保存后本页不会静默刷新单据位置，只收到提示。任何写操作提交时都重新读取
// localStorage 中的服务端真相：拖拽按修订序号核对，序号不一致则整笔操作进冲突区，
// 并在服务端真相之上落库——晚保存的一方不会把先排结果盖回去。

import { create } from "zustand";
import {
  applyScheduleOperation,
  checkDraggable,
  evaluateOperation
} from "./conflict";
import { DRIVERS, IDENTITIES, Identity, seedOrders } from "./data";
import {
  BoardState,
  loadState,
  saveState,
  subscribeRemote
} from "./storage";
import {
  ConflictRecord,
  DeliveryOrder,
  HandoverRequest,
  ScheduleOperation,
  ScheduleTarget
} from "./types";

export const REMOTE_ORIGIN = "remote-station";

export interface ActionResult {
  ok: boolean;
  error?: string;
}

export interface NewOrderInput {
  orderNo: string;
  weight: number;
  destination: string;
  note: string;
}

interface BoardStore extends BoardState {
  /** 本标签页（本机）标识，两个标签页即两台电脑 */
  stationId: string;
  identityId: string;
  identity: Identity;
  setIdentity: (id: string) => void;

  /** 他端有未拉取的单据改动时的提示；拉取或成功提交后清空 */
  serverNotice: string | null;
  pullFromServer: () => void;

  addOrder: (input: NewOrderInput) => ActionResult;
  updateOrderProfile: (
    id: string,
    baseRevision: number,
    patch: Pick<DeliveryOrder, "weight" | "destination" | "note">
  ) => ActionResult;
  removeOrder: (id: string) => void;

  /** 拖拽排班 / 调整顺序：带修订序号提交 */
  submitSchedule: (op: Omit<ScheduleOperation, "operator">) => ActionResult;
  markDeparted: (orderId: string) => ActionResult;

  registerHandover: (
    orderId: string,
    toDriverId: string,
    reason: string
  ) => ActionResult;
  resolveHandover: (handoverId: string, accept: boolean) => ActionResult;

  retryConflict: (conflictId: string) => ActionResult;
  ignoreConflict: (conflictId: string) => void;

  /** 演示：模拟另一台电脑抢先保存，使服务端序号推进（本页工作区保持旧快照） */
  simulateRemoteEdit: (orderId?: string) => ActionResult & { orderNo?: string };

  /** 收到其它电脑广播：只合并冲突/移交留痕，单据位置由调度员主动拉取 */
  mergeRemote: (next: BoardState) => void;
}

const initial = loadState();
// 旧版本数据（v1 列表）不兼容时直接回到种子数据
const validOrders =
  initial.orders.length > 0 && "revision" in initial.orders[0]
    ? initial.orders
    : seedOrders();

function shortStation() {
  return crypto.randomUUID().slice(0, 4).toUpperCase();
}

/** 比较他端真相与本地快照，生成“哪些单号被改动”的提示 */
function diffOrdersNotice(remote: DeliveryOrder[], local: DeliveryOrder[]): string | null {
  const localMap = new Map(local.map((o) => [o.id, o]));
  const changed: string[] = [];
  for (const o of remote) {
    const mine = localMap.get(o.id);
    if (!mine) changed.push(`${o.orderNo}(新增)`);
    else if (mine.revision !== o.revision) changed.push(`${o.orderNo}(#${mine.revision}→#${o.revision})`);
  }
  for (const o of local) {
    if (!remote.some((r) => r.id === o.id)) changed.push(`${o.orderNo}(已删除)`);
  }
  if (changed.length === 0) return null;
  const preview = changed.slice(0, 3).join("、");
  const more = changed.length > 3 ? ` 等 ${changed.length} 张` : "";
  return `另一台电脑已保存：${preview}${more}。工作区暂未刷新，拖放提交时会按修订序号核对，或点“拉取最新排班”同步。`;
}

export const useBoardStore = create<BoardStore>()((set, get) => {
  /** 以服务端真相为基底落库，避免把本机旧快照整份盖回去 */
  const commit = (next: BoardState) => {
    const saved: BoardState = { ...next, lastRemoteTick: null };
    saveState(saved, get().stationId);
    set({ ...saved, serverNotice: null });
  };

  const server = () => loadState();

  const bump = (order: DeliveryOrder, patch: Partial<DeliveryOrder>): DeliveryOrder => ({
    ...order,
    ...patch,
    revision: order.revision + 1,
    updatedAt: new Date().toISOString()
  });

  return {
    stationId: shortStation(),
    orders: validOrders,
    conflicts: initial.conflicts,
    handovers: initial.handovers,
    lastRemoteTick: null,
    serverNotice: null,
    identityId: IDENTITIES[0].id,
    identity: IDENTITIES[0],

    setIdentity: (id) => {
      const identity = IDENTITIES.find((item) => item.id === id) ?? IDENTITIES[0];
      set({ identityId: id, identity });
    },

    pullFromServer: () => {
      const latest = server();
      set({
        orders: latest.orders,
        conflicts: latest.conflicts,
        handovers: latest.handovers,
        serverNotice: null
      });
    },

    addOrder: (input) => {
      const truth = server();
      if (truth.orders.some((o) => o.orderNo === input.orderNo.trim())) {
        return { ok: false, error: "单号已存在" };
      }
      const now = new Date().toISOString();
      const unassignedTail = truth.orders
        .filter((o) => o.driverId === null)
        .reduce((max, o) => Math.max(max, o.rank), 0);
      const order: DeliveryOrder = {
        id: crypto.randomUUID(),
        orderNo: input.orderNo.trim(),
        revision: 1,
        status: "unassigned",
        driverId: null,
        weight: input.weight,
        destination: input.destination.trim(),
        rank: unassignedTail + 1024,
        note: input.note.trim(),
        createdAt: now,
        updatedAt: now
      };
      commit({ ...truth, orders: [order, ...truth.orders] });
      return { ok: true };
    },

    updateOrderProfile: (id, baseRevision, patch) => {
      const truth = server();
      const order = truth.orders.find((o) => o.id === id);
      if (!order) return { ok: false, error: "配送单不存在" };
      if (order.revision !== baseRevision) {
        // 资料也带序号：他端刚改过，不静默覆盖
        set({
          orders: truth.orders,
          conflicts: truth.conflicts,
          handovers: truth.handovers,
          serverNotice: null
        });
        return {
          ok: false,
          error: `该单刚被另一台电脑更新（当前序号 #${order.revision}），已加载最新资料，请重新编辑`
        };
      }
      commit({
        ...truth,
        orders: truth.orders.map((o) =>
          o.id === id
            ? bump(o, {
                weight: patch.weight,
                destination: patch.destination,
                note: patch.note
              })
            : o
        )
      });
      return { ok: true };
    },

    removeOrder: (id) => {
      const truth = server();
      commit({
        ...truth,
        orders: truth.orders.filter((o) => o.id !== id),
        handovers: truth.handovers.filter((h) => h.orderId !== id)
      });
    },

    submitSchedule: (opInput) => {
      const { identity } = get();
      if (identity.kind !== "dispatcher") {
        return { ok: false, error: "排班操作仅调度员可执行，请切换到调度员身份" };
      }

      const truth = server();
      const op: ScheduleOperation = { ...opInput, operator: identity.name };
      const order = truth.orders.find((o) => o.id === op.orderId);
      const refusal = checkDraggable(order);
      if (refusal) {
        // 禁拖类错误也顺带把服务端真相带回本机
        if (refusal.code === "missing") set({ orders: truth.orders });
        return { ok: false, error: refusal.message };
      }

      const result = evaluateOperation(order!, op);
      if (!result.ok && result.conflict) {
        // 序号已被另一台电脑推进：本次拖放不生效，整笔操作落入冲突区；
        // 本机同时拉取他端真相，冲突与他端排班都不会丢
        const next: BoardState = {
          orders: truth.orders,
          conflicts: [result.conflict, ...truth.conflicts],
          handovers: truth.handovers,
          lastRemoteTick: null
        };
        saveState(next, get().stationId);
        set({ ...next, serverNotice: null });
        return { ok: false, error: "修订序号不一致，操作已放入冲突区" };
      }

      commit({
        ...truth,
        orders: applyScheduleOperation(truth.orders, op)
      });
      return { ok: true };
    },

    markDeparted: (orderId) => {
      const { identity } = get();
      const truth = server();
      const order = truth.orders.find((o) => o.id === orderId);
      if (!order) return { ok: false, error: "配送单不存在" };
      if (order.status === "departed") return { ok: false, error: "该单已在途" };
      if (order.driverId === null) return { ok: false, error: "未派单不能直接发车" };
      const allowed =
        identity.kind === "dispatcher" || identity.driverId === order.driverId;
      if (!allowed) return { ok: false, error: "只有调度员或占用司机可以登记发车" };
      commit({
        ...truth,
        orders: truth.orders.map((o) => (o.id === orderId ? bump(o, { status: "departed" }) : o))
      });
      return { ok: true };
    },

    registerHandover: (orderId, toDriverId, reason) => {
      const { identity } = get();
      const truth = server();
      const order = truth.orders.find((o) => o.id === orderId);
      if (!order) return { ok: false, error: "配送单不存在" };
      if (order.status !== "departed") return { ok: false, error: "只有在途单需要登记移交" };
      if (identity.kind !== "driver" || identity.driverId !== order.driverId) {
        return { ok: false, error: "只能由当前占用的原司机登记移交" };
      }
      if (!DRIVERS.some((d) => d.id === toDriverId)) {
        return { ok: false, error: "请选择承接司机" };
      }
      if (toDriverId === order.driverId) {
        return { ok: false, error: "承接司机不能与原司机相同" };
      }
      if (!reason.trim()) return { ok: false, error: "请填写移交原因" };
      if (truth.handovers.some((h) => h.orderId === orderId && h.status === "pending")) {
        return { ok: false, error: "该单已有待确认的移交登记" };
      }

      // 登记阶段不换占用、不动配送单序号，等承接方确认
      const handover: HandoverRequest = {
        id: crypto.randomUUID(),
        orderId,
        fromDriverId: order.driverId!,
        toDriverId,
        reason: reason.trim(),
        status: "pending",
        createdAt: new Date().toISOString()
      };
      commit({ ...truth, handovers: [handover, ...truth.handovers] });
      return { ok: true };
    },

    resolveHandover: (handoverId, accept) => {
      const { identity } = get();
      const truth = server();
      const handover = truth.handovers.find((h) => h.id === handoverId);
      if (!handover) return { ok: false, error: "移交记录不存在" };
      if (handover.status !== "pending") return { ok: false, error: "该移交已处理" };
      if (identity.kind !== "driver" || identity.driverId !== handover.toDriverId) {
        return { ok: false, error: "只有承接司机本人可以确认或拒绝" };
      }
      const decidedAt = new Date().toISOString();
      const handovers = truth.handovers.map((h) =>
        h.id === handoverId
          ? { ...h, status: accept ? ("accepted" as const) : ("rejected" as const), decidedAt }
          : h
      );
      // 对方确认后才换占用，并推进修订序号（在服务端真相之上操作）
      const orders = accept
        ? truth.orders.map((o) =>
            o.id === handover.orderId ? bump(o, { driverId: handover.toDriverId }) : o
          )
        : truth.orders;
      commit({ ...truth, orders, handovers });
      return { ok: true };
    },

    retryConflict: (conflictId) => {
      const truth = server();
      const conflict = truth.conflicts.find((c) => c.id === conflictId);
      if (!conflict) return { ok: false, error: "冲突记录不存在" };
      const order = truth.orders.find((o) => o.id === conflict.orderId);
      if (!order) return { ok: false, error: "配送单已被删除" };
      const refusal = checkDraggable(order);
      if (refusal) return { ok: false, error: refusal.message };

      const op: ScheduleOperation = {
        orderId: order.id,
        // 重试用服务端当前序号作为新快照
        baseRevision: order.revision,
        baseDriverId: order.driverId,
        target: conflict.target,
        index: Number.MAX_SAFE_INTEGER, // 重投放到目标列尾，避免覆盖对方的新顺序
        operator: get().identity.name
      };
      const result = evaluateOperation(order, op);
      if (!result.ok && result.conflict) {
        const latest = result.conflict;
        const next: BoardState = {
          ...truth,
          orders: truth.orders,
          conflicts: truth.conflicts.map((c) =>
            c.id === conflictId
              ? {
                  ...c,
                  currentRevision: latest.currentRevision,
                  currentDriverId: latest.currentDriverId,
                  reason: latest.reason
                }
              : c
          )
        };
        saveState(next, get().stationId);
        set({ ...next, serverNotice: null });
        return { ok: false, error: "序号仍不一致，冲突尚未解除（已更新当前序号）" };
      }

      commit({
        ...truth,
        orders: applyScheduleOperation(truth.orders, op),
        conflicts: truth.conflicts.map((c) =>
          c.id === conflictId ? { ...c, status: "retried" as const } : c
        )
      });
      return { ok: true };
    },

    ignoreConflict: (conflictId) => {
      const truth = server();
      commit({
        ...truth,
        conflicts: truth.conflicts.map((c) =>
          c.id === conflictId ? { ...c, status: "ignored" as const } : c
        )
      });
    },

    simulateRemoteEdit: (orderId) => {
      const truth = server();
      if (truth.orders.length === 0) return { ok: false, error: "暂无配送单" };
      const order =
        truth.orders.find((o) => o.id === orderId) ??
        truth.orders.find((o) => o.status !== "departed") ??
        truth.orders[0];
      const now = new Date().toISOString();
      const clock = now.slice(11, 19);

      let nextOrder: DeliveryOrder;
      if (order.status === "departed") {
        // 在途单不能被他端拖动，模拟他端在资料页补了备注——同样推进序号
        nextOrder = bump(order, { note: `${order.note}（他端 ${clock} 更新备注）` });
      } else {
        // 模拟另一台电脑调整占用：未派→刘师傅，之后轮换司机，孙师傅→退回未派
        const sequence = [null, ...DRIVERS.map((d) => d.id)];
        const curIndex = sequence.indexOf(order.driverId);
        const nextDriverId = sequence[(curIndex + 1) % sequence.length];
        const tail = truth.orders
          .filter((o) => o.driverId === nextDriverId && o.id !== order.id)
          .reduce((max, o) => Math.max(max, o.rank), 0);
        nextOrder = bump(order, {
          driverId: nextDriverId,
          status: nextDriverId === null ? "unassigned" : "assigned",
          rank: tail + 1024
        });
      }

      const next: BoardState = {
        ...truth,
        orders: truth.orders.map((o) => (o.id === order.id ? nextOrder : o)),
        lastRemoteTick: `2号电脑于 ${clock} 改动了 ${order.orderNo}，服务端序号推进到 ${nextOrder.revision}`
      };
      // 以他端身份写入：本页工作区故意保持旧快照，只更新提示，拖放时即触发序号核对
      saveState(next, REMOTE_ORIGIN);
      set({ serverNotice: next.lastRemoteTick });
      return { ok: true, orderNo: order.orderNo };
    },

    mergeRemote: (next) => {
      const notice = diffOrdersNotice(next.orders, get().orders);
      // 冲突/移交留痕实时合并；单据位置不静默覆盖，等调度员拉取或提交时核对
      set((state) => ({
        conflicts: next.conflicts,
        handovers: next.handovers,
        serverNotice: notice ?? state.serverNotice
      }));
    }
  };
});

/** 订阅其它标签页（其它电脑）的保存，组件挂载时调用一次 */
export function bindRemoteSync() {
  return subscribeRemote((state) => {
    useBoardStore.getState().mergeRemote(state);
  });
}

export function targetText(target: ScheduleTarget): string {
  return target.kind === "unassigned"
    ? "未派区"
    : `司机 ${DRIVERS.find((d) => d.id === target.driverId)?.name ?? "?"}`;
}

export function conflictStatusText(status: ConflictRecord["status"]): string {
  return status === "open" ? "待处理" : status === "retried" ? "已重试落位" : "已忽略";
}

export function handoverStatusText(status: HandoverRequest["status"]): string {
  return status === "pending" ? "待承接方确认" : status === "accepted" ? "已确认换占用" : "已拒绝";
}
