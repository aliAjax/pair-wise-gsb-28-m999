import { Button, Popconfirm, Tag } from "antd";
import { useDraggable } from "@dnd-kit/core";
import type { DeliveryOrder } from "../domain/types";

interface OrderCardProps {
  order: DeliveryOrder;
  /** 未派/已排卡可拖；已发车卡禁用拖动 */
  departed?: boolean;
  onDepart?: (order: DeliveryOrder) => void;
  onHandover?: (order: DeliveryOrder) => void;
  /** 模拟另一台电脑晚保存：把当前序号 +1（可附带改派司机） */
  onBumpRevision?: (order: DeliveryOrder) => void;
  canHandover?: boolean;
}

export function OrderCard({ order, departed, onDepart, onHandover, onBumpRevision, canHandover }: OrderCardProps) {
  const { attributes, listeners, setNodeRef, transform, isDragging } = useDraggable({
    id: order.id,
    disabled: departed,
    data: {
      type: "card",
      orderId: order.id,
      carriedRevision: order.revision,
      sourceDriver: order.driver
    }
  });

  const style = transform
    ? { transform: `translate3d(${transform.x}px, ${transform.y}px, 0)`, opacity: isDragging ? 0.55 : 1, zIndex: isDragging ? 50 : undefined }
    : undefined;

  return (
    <article ref={setNodeRef} style={style} className={`order-card${departed ? " departed" : ""}`}>
      <div {...(departed ? {} : listeners)} {...attributes} className={departed ? "order-body locked" : "order-body"}>
        <div className="order-head">
          <span className="order-no">{order.orderNo}</span>
          <Tag className="rev-tag" color={departed ? "default" : "blue"} bordered={false}>
            序号 {order.revision}
          </Tag>
        </div>
        <div className="order-meta">
          <span>{order.destination}</span>
          <span>{order.weightKg} kg</span>
        </div>
        {departed && <div className="departed-hint">已发车 · 占用锁定（{order.driver}）</div>}
      </div>
      <div className="card-actions">
        {onDepart && !departed && (
          <Button size="small" type="primary" ghost onClick={() => onDepart(order)}>
            发车
          </Button>
        )}
        {onHandover && departed && (
          <Button size="small" disabled={!canHandover} onClick={() => onHandover(order)}>
            登记移交
          </Button>
        )}
        {onBumpRevision && !departed && (
          <Popconfirm
            title="模拟他端晚保存"
            description="另一台电脑会把该单修订序号 +1，随后拖单将触发冲突。"
            okText="继续"
            cancelText="取消"
            onConfirm={() => onBumpRevision(order)}
          >
            <Button size="small" type="link">模拟他端+1</Button>
          </Popconfirm>
        )}
      </div>
    </article>
  );
}
