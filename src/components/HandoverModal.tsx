import { Form, Input, Modal, Select } from "antd";
import { useEffect } from "react";
import { DRIVERS, driverName } from "../data";
import { DeliveryOrder } from "../types";

interface HandoverModalProps {
  order: DeliveryOrder | null;
  onClose: () => void;
  onSubmit: (orderId: string, toDriverId: string, reason: string) => void;
}

interface FormValues {
  toDriverId: string;
  reason: string;
}

/** 在途单移交：只能由原司机登记承接司机与移交原因，对方确认后才换占用 */
export default function HandoverModal({ order, onClose, onSubmit }: HandoverModalProps) {
  const [form] = Form.useForm<FormValues>();

  useEffect(() => {
    if (order) form.resetFields();
  }, [order, form]);

  return (
    <Modal
      title={`登记在途移交 · ${order?.orderNo ?? ""}`}
      open={order !== null}
      onCancel={onClose}
      okText="提交登记（等待对方确认）"
      cancelText="取消"
      onOk={() => {
        form
          .validateFields()
          .then((values) => {
            onSubmit(order!.id, values.toDriverId, values.reason);
            onClose();
          })
          .catch(() => undefined);
      }}
    >
      {order && (
        <div className="handover-modal-tip">
          当前占用：<strong>{driverName(order.driverId)}</strong>，状态在途。
          登记后不会立刻换人，需承接司机登录后确认。
        </div>
      )}
      <Form form={form} layout="vertical">
        <Form.Item
          name="toDriverId"
          label="承接司机"
          rules={[{ required: true, message: "请选择承接司机" }]}
        >
          <Select
            placeholder="请选择承接司机"
            options={DRIVERS.filter((d) => d.id !== order?.driverId).map((d) => ({
              value: d.id,
              label: d.name
            }))}
          />
        </Form.Item>
        <Form.Item
          name="reason"
          label="移交原因"
          rules={[{ required: true, message: "请填写移交原因" }]}
        >
          <Input.TextArea rows={3} placeholder="例如：车辆故障 / 司机身体不适 / 区域就近转交" />
        </Form.Item>
      </Form>
    </Modal>
  );
}
