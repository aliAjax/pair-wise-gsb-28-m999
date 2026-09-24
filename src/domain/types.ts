/** 配送单状态：未派 -> 已排 -> 已发车（已发车后锁定，只能走移交） */
export type OrderStatus = "未派" | "已排" | "已发车";

/** 配送单。revision 为修订序号，每次成功排班/移交/发车都会 +1 */
export interface DeliveryOrder {
  id: string;
  orderNo: string;
  destination: string;
  weightKg: number;
  driver: string | null;
  status: OrderStatus;
  revision: number;
  /** 在所属容器（未派池 / 某司机队列）内的顺序，0 起 */
  seq: number;
  updatedAt: string;
}

/** 冲突记录：拖放时携带的修订序号与当前序号不一致时产生 */
export interface ConflictRecord {
  id: string;
  orderId: string;
  /** 单号 */
  orderNo: string;
  /** 原司机（本机排班底稿上看到的司机，未派为 null） */
  originalDriver: string | null;
  /** 本机底稿携带的修订序号 */
  carriedRevision: number;
  /** 落子时刻的当前修订序号 */
  currentRevision: number;
  /** 本次想做的操作描述，如 “拖到 赵师傅” / “在 未派池 内调整顺序” */
  attemptedAction: string;
  /** 冲突时刻该单实际所在司机 */
  currentDriver: string | null;
  createdAt: string;
  resolved: boolean;
}

/** 在途移交申请：仅原司机可发起，承接司机确认后才换占用 */
export interface HandoverRequest {
  id: string;
  orderId: string;
  orderNo: string;
  fromDriver: string;
  toDriver: string;
  reason: string;
  status: "待确认" | "已确认" | "已拒绝";
  createdAt: string;
  handledAt: string | null;
}

/** 持久化到 localStorage 的整包数据 */
export interface PersistShape {
  orders: DeliveryOrder[];
  conflicts: ConflictRecord[];
  handovers: HandoverRequest[];
}

/** 拖放提交时的操作意图（拖动开始瞬间捕获） */
export interface DragIntent {
  orderId: string;
  /** 底稿上携带的修订序号 */
  carriedRevision: number;
  /** 拖动开始时的原司机（未派为 null） */
  sourceDriver: string | null;
  kind: "assign" | "reorder";
  targetDriver: string | null;
  targetIndex: number;
}
