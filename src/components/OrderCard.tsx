import { useDraggable, useDroppable } from "@dnd-kit/core";
import { Button, Tag, Tooltip } from "antd";
import { useCallback } from "react";
import { driverName, Identity } from "../data";
import {
  DeliveryOrder,
  HandoverRequest,
  STATUS_TEXT
} from "../types";
import { formatTime } from "../utils";

interface OrderCardProps {
  order: DeliveryOrder;
  /** 该单当前待处理 / 最近一次移交登记 */
  handover?: HandoverRequest;
  identity: Identity;
  onDepart: (orderId: string) => void;
  onRegisterHandover: (order: DeliveryOrder) => void;
  onResolveHandover: (handoverId: string, accept: boolean) => void;
}

const STATUS_COLOR: Record<DeliveryOrder["status"], string> = {
  unassigned: "blue",
  assigned: "cyan",
  departed: "red"
};

export default function OrderCard({
  order,
  handover,
  identity,
  onDepart,
  onRegisterHandover,
  onResolveHandover
}: OrderCardProps) {
  const locked = order.status === "departed";

  const {
    attributes,
    listeners,
    setNodeRef: setDragRef,
    transform,
    isDragging
  } = useDraggable({
    id: `order:${order.id}`,
    disabled: locked,
    data: {
      // 拖拽开始瞬间的本地快照：提交时据此核对修订序号
      revision: order.revision,
      driverId: order.driverId
    }
  });

  const { setNodeRef: setDropRef, isOver } = useDroppable({
    id: `order:${order.id}`,
    disabled: false
  });

  const mergeRefs = useCallback(
    (node: HTMLDivElement | null) => {
      setDragRef(node);
      setDropRef(node);
    },
    [setDragRef, setDropRef]
  );

  const canDepart =
    identity.kind === "dispatcher" || identity.driverId === order.driverId;
  const isHandoverTarget =
    handover?.status === "pending" &&
    identity.kind === "driver" &&
    identity.driverId === handover.toDriverId;

  return (
    <div
      ref={mergeRefs}
      className={`order-card${locked ? " locked" : ""}${isDragging ? " dragging" : ""}${isOver ? " drop-over" : ""}`}
      style={
        transform
          ? { transform: `translate3d(${transform.x}px, ${transform.y}px, 0)` }
          : undefined
      }
      {...(locked ? {} : listeners)}
      {...(locked ? {} : attributes)}
    >
      <div className="order-card-head">
        <span className="order-no">{order.orderNo}</span>
        <Tag color={STATUS_COLOR[order.status]}>{STATUS_TEXT[order.status]}</Tag>
      </div>

      <div className="order-card-meta">
        <span>目的地：{order.destination || "—"}</span>
        <span>重量：{order.weight} kg</span>
        <span>占用：{driverName(order.driverId)}</span>
        <Tooltip title="每次被保存都会 +1，拖放提交时与服务端核对">
          <span className="revision-pill">修订序号 #{order.revision}</span>
        </Tooltip>
      </div>

      {order.note ? <p className="order-card-note">{order.note}</p> : null}

      <div className="order-card-foot">
        <span className="order-card-time">更新 {formatTime(order.updatedAt)}</span>
        <span className="order-card-actions">
          {order.status === "assigned" && (
            <Button size="small" type="primary" ghost disabled={!canDepart} onClick={() => onDepart(order.id)}>
              登记发车
            </Button>
          )}
          {locked && (
            <>
              <Tag color="volcano" className="lock-tag">🔒 已锁定，不可拖动</Tag>
              <Button size="small" onClick={() => onRegisterHandover(order)}>
                登记移交
              </Button>
            </>
          )}
        </span>
      </div>

      {locked && handover && (
        <div className="handover-line">
          {handover.status === "pending" && (
            <>
              <Tag color="orange">待 {driverName(handover.toDriverId)} 确认移交</Tag>
              {isHandoverTarget && (
                <span className="handover-confirm">
                  <Button size="small" type="primary" onClick={() => onResolveHandover(handover.id, true)}>
                    确认承接
                  </Button>
                  <Button size="small" danger onClick={() => onResolveHandover(handover.id, false)}>
                    拒绝
                  </Button>
                </span>
              )}
            </>
          )}
          {handover.status === "accepted" && (
            <Tag color="green">已由 {driverName(handover.toDriverId)} 承接</Tag>
          )}
          {handover.status === "rejected" && (
            <Tag>承接被拒，占用仍为 {driverName(handover.fromDriverId)}</Tag>
          )}
        </div>
      )}
    </div>
  );
}
