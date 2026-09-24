// 领域模型：配送单、移交登记、冲突记录、排班操作

export type OrderStatus = "unassigned" | "assigned" | "departed";

export const STATUS_TEXT: Record<OrderStatus, string> = {
  unassigned: "未派",
  assigned: "已派未发车",
  departed: "在途"
};

export interface Driver {
  id: string;
  name: string;
}

export interface DeliveryOrder {
  id: string;
  /** 单号 */
  orderNo: string;
  /** 修订序号：另一台电脑每次保存都会 +1，拖拽提交时必须核对 */
  revision: number;
  status: OrderStatus;
  /** 占用司机 id；未派为 null */
  driverId: string | null;
  weight: number;
  destination: string;
  /** 列内排序权重，越小越靠前 */
  rank: number;
  note: string;
  createdAt: string;
  updatedAt: string;
}

export type ScheduleTarget =
  | { kind: "unassigned" }
  | { kind: "driver"; driverId: string };

export interface ScheduleOperation {
  orderId: string;
  /** 拖拽时本地快照看到的修订序号 */
  baseRevision: number;
  /** 拖拽时本地快照看到的占用司机 */
  baseDriverId: string | null;
  target: ScheduleTarget;
  /** 目标列插入位置；0 表示列首 */
  index: number;
  /** 操作人，用于冲突留痕 */
  operator: string;
}

export interface ConflictRecord {
  id: string;
  orderId: string;
  /** 单号 */
  orderNo: string;
  /** 本地快照中的原司机（占用） */
  baseDriverId: string | null;
  /** 本地快照中的序号 */
  baseRevision: number;
  /** 服务端当前序号 */
  currentRevision: number;
  /** 服务端当前占用司机 */
  currentDriverId: string | null;
  /** 本次拖拽想去的位置 */
  target: ScheduleTarget;
  reason: string;
  operator: string;
  status: "open" | "retried" | "ignored";
  createdAt: string;
}

export interface HandoverRequest {
  id: string;
  orderId: string;
  /** 原司机（登记移交的一方） */
  fromDriverId: string;
  /** 承接司机 */
  toDriverId: string;
  reason: string;
  status: "pending" | "accepted" | "rejected";
  createdAt: string;
  decidedAt?: string;
}

export interface ApplyResult {
  ok: boolean;
  /** ok=false 且为 null 时表示不属于冲突（如已发车禁止拖拽），调用方直接提示 */
  conflict: ConflictRecord | null;
}
