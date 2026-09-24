import { create } from "zustand";
import type { ConflictRecord, DeliveryOrder, DragIntent, HandoverRequest, PersistShape } from "../domain/types";
import {
  applyDrop,
  applyExternalBump,
  buildConflict,
  createHandover,
  markDeparted,
  resolveHandover
} from "../domain/conflictEngine";
import { loadPersisted, savePersisted } from "../data/storage";

/**
 * 数据模型：localStorage 充当“服务端最新真相”，各标签页（各台电脑）
 * 打开时载入一份自己的排班底稿。保存动作走乐观锁——落子携带修订序号，
 * 与服务端当前序号核对一致才写入；不一致则进冲突区，并把本端底稿
 * 回放到服务端最新版本。
 */

function mergeById<T extends { id: string }>(a: T[], b: T[]): T[] {
  const map = new Map<string, T>();
  for (const item of a) map.set(item.id, item);
  for (const item of b) map.set(item.id, item);
  return [...map.values()];
}

interface DispatchState {
  orders: DeliveryOrder[];
  conflicts: ConflictRecord[];
  handovers: HandoverRequest[];
  /** 当前登录身份（调度员或司机，演示登记/确认权限） */
  currentUser: string;
  lastMessage: string | null;

  drop: (intent: DragIntent) => void;
  depart: (orderId: string) => void;
  registerHandover: (draft: { orderId: string; toDriver: string; reason: string }) => void;
  handleHandover: (requestId: string, decision: "confirm" | "reject") => void;
  resolveConflict: (conflictId: string) => void;
  clearResolvedConflicts: () => void;
  /** 演示另一台电脑晚保存：只动服务端真相，本端底稿保持旧序号 */
  simulateRemoteSave: (orderId: string, remoteDriver?: string | null) => void;
  addOrder: (input: { orderNo: string; destination: string; weightKg: number }) => void;
  /** 放弃本端底稿，重新载入服务端最新数据（等同于重新打开页面拉取） */
  reloadFromServer: () => void;
  setCurrentUser: (user: string) => void;
  dismissMessage: () => void;
}

type CommitResult = {
  data: PersistShape;
  /** 回写到本端底稿的数据，默认与 data 相同；冲突时也用服务端真相回放 */
  local?: Partial<PersistShape>;
  message?: string;
};

export const useDispatchStore = create<DispatchState>((set, get) => {
  /** 在服务端最新数据上执行一次变更并保存，同时合并本端产生的冲突/移交记录 */
  function commitOnServer(
    state: DispatchState,
    mutate: (server: PersistShape) => CommitResult | string
  ): Partial<DispatchState> | null {
    const server = loadPersisted();
    const result = mutate(server);
    if (typeof result === "string") return { lastMessage: result };
    savePersisted(result.data);
    const local = result.local ?? result.data;
    return {
      orders: local.orders ?? result.data.orders,
      conflicts: local.conflicts ?? result.data.conflicts,
      handovers: local.handovers ?? result.data.handovers,
      lastMessage: result.message ?? null
    };
  }

  return {
    ...loadPersisted(),
    currentUser: "调度员甲",
    lastMessage: null,

    drop: (intent) =>
      set((state) => {
        const outcome = commitOnServer(state, (server) => {
          const remote = server.orders.find((item) => item.id === intent.orderId);
          if (!remote) return "配送单不存在或已被他端删除";
          if (remote.status === "已发车") {
            return `${remote.orderNo} 已发车，不能拖动；如需换车请由原司机登记移交`;
          }
          if (remote.revision !== intent.carriedRevision) {
            const conflict = buildConflict(remote, intent);
            const conflicts = [conflict, ...mergeById(server.conflicts, state.conflicts)];
            const data: PersistShape = { orders: server.orders, conflicts, handovers: mergeById(server.handovers, state.handovers) };
            return {
              data,
              message: `序号冲突：${remote.orderNo}（携带 ${intent.carriedRevision} / 服务端当前 ${remote.revision}），已进冲突区，本端底稿已刷新`
            };
          }

          const result = applyDrop(server.orders, intent);
          if (result.blocked) return result.blocked;
          const data: PersistShape = {
            orders: result.orders,
            conflicts: mergeById(server.conflicts, state.conflicts),
            handovers: mergeById(server.handovers, state.handovers)
          };
          return { data, message: "排班已保存，修订序号已更新" };
        });
        return outcome ?? {};
      }),

    depart: (orderId) =>
      set((state) => {
        const outcome = commitOnServer(state, (server) => {
          const order = server.orders.find((item) => item.id === orderId);
          if (!order) return "配送单不存在";
          if (order.status !== "已排") return `${order.orderNo} 当前状态不能发车`;
          return {
            data: { ...server, orders: markDeparted(server.orders, orderId) },
            message: `${order.orderNo} 已发车，占用锁定，不能再拖动`
          };
        });
        return outcome ?? {};
      }),

    registerHandover: (draft) =>
      set((state) => {
        const outcome = commitOnServer(state, (server) => {
          const { handovers, error } = createHandover(server.orders, mergeById(server.handovers, state.handovers), {
            orderId: draft.orderId,
            fromDriver: state.currentUser,
            toDriver: draft.toDriver,
            reason: draft.reason
          });
          if (error) return error;
          return { data: { ...server, handovers }, message: "移交申请已登记，等待承接司机确认" };
        });
        return outcome ?? {};
      }),

    handleHandover: (requestId, decision) =>
      set((state) => {
        const outcome = commitOnServer(state, (server) => {
          const request = server.handovers.find((item) => item.id === requestId)
            ?? state.handovers.find((item) => item.id === requestId);
          if (!request) return "移交申请不存在";
          if (request.toDriver !== state.currentUser) return "只有承接司机本人可以确认或拒绝";
          const { orders, handovers, error } = resolveHandover(
            server.orders,
            mergeById(server.handovers, state.handovers),
            requestId,
            decision
          );
          if (error) return error;
          return {
            data: { orders, conflicts: mergeById(server.conflicts, state.conflicts), handovers },
            message:
              decision === "confirm"
                ? `${request.orderNo} 已由承接司机确认，占用转移给 ${request.toDriver}`
                : `${request.orderNo} 的移交申请已拒绝，占用保持不变`
          };
        });
        return outcome ?? {};
      }),

    resolveConflict: (conflictId) =>
      set((state) => {
        const outcome = commitOnServer(state, (server) => ({
          data: {
            ...server,
            conflicts: mergeById(server.conflicts, state.conflicts).map((item) =>
              item.id === conflictId ? { ...item, resolved: true } : item
            )
          }
        }));
        return outcome ?? {};
      }),

    clearResolvedConflicts: () =>
      set((state) => {
        const outcome = commitOnServer(state, (server) => ({
          data: { ...server, conflicts: mergeById(server.conflicts, state.conflicts).filter((item) => !item.resolved) }
        }));
        return outcome ?? {};
      }),

    simulateRemoteSave: (orderId, remoteDriver) =>
      set((state) => {
        // 只写服务端，故意不刷新本端底稿——模拟另一台电脑已经晚保存
        const server = loadPersisted();
        const remote = server.orders.find((item) => item.id === orderId);
        if (!remote) return { lastMessage: "配送单不存在" };
        const orders = applyExternalBump(server.orders, orderId, remoteDriver);
        savePersisted({
          orders,
          conflicts: mergeById(server.conflicts, state.conflicts),
          handovers: mergeById(server.handovers, state.handovers)
        });
        return {
          lastMessage:
            remoteDriver === undefined
              ? `他端已保存 ${remote.orderNo}，服务端当前序号 ${remote.revision + 1}；你的底稿仍是 ${remote.revision}，现在拖它`
              : `他端已把 ${remote.orderNo} 改派给 ${remoteDriver}，序号 ${remote.revision + 1}；现在拖它`
        };
      }),

    addOrder: (input) =>
      set((state) => {
        const outcome = commitOnServer(state, (server) => {
          if (server.orders.some((item) => item.orderNo === input.orderNo)) return "单号已存在";
          const poolCount = server.orders.filter((order) => order.status === "未派").length;
          const order: DeliveryOrder = {
            id: crypto.randomUUID(),
            orderNo: input.orderNo,
            destination: input.destination,
            weightKg: input.weightKg,
            driver: null,
            status: "未派",
            revision: 1,
            seq: poolCount,
            updatedAt: new Date().toISOString()
          };
          return { data: { ...server, orders: [...server.orders, order] }, message: `${input.orderNo} 已加入未派池` };
        });
        return outcome ?? {};
      }),

    reloadFromServer: () => {
      const server = loadPersisted();
      set({ ...server, lastMessage: "已载入服务端最新配送资料、冲突与移交记录" });
    },

    setCurrentUser: (user) => set({ currentUser: user }),
    dismissMessage: () => set({ lastMessage: null })
  };
});
