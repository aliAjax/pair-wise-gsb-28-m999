import { useState } from "react";
import { Button, Form, Input, InputNumber, Modal, Table, Tag } from "antd";
import type { ColumnsType } from "antd/es/table";
import type { DeliveryOrder, OrderStatus } from "../domain/types";
import { useDispatchStore } from "../state/store";
import { DRIVERS } from "../data/storage";

const STATUS_COLOR: Record<OrderStatus, string> = {
  未派: "default",
  已排: "blue",
  已发车: "green"
};

export function OrdersPage() {
  const orders = useDispatchStore((s) => s.orders);
  const addOrder = useDispatchStore((s) => s.addOrder);
  const [open, setOpen] = useState(false);
  const [form] = Form.useForm();

  async function submit() {
    const values = await form.validateFields();
    addOrder({ orderNo: values.orderNo.trim(), destination: values.destination.trim(), weightKg: Number(values.weightKg) });
    form.resetFields();
    setOpen(false);
  }

  const columns: ColumnsType<DeliveryOrder> = [
    { title: "单号", dataIndex: "orderNo", key: "orderNo", width: 130, render: (v: string) => <strong>{v}</strong> },
    { title: "目的地", dataIndex: "destination", key: "destination" },
    { title: "重量 kg", dataIndex: "weightKg", key: "weightKg", width: 100 },
    {
      title: "占用司机",
      dataIndex: "driver",
      key: "driver",
      width: 110,
      render: (driver: string | null) => driver ?? <Tag>未派</Tag>
    },
    {
      title: "状态",
      dataIndex: "status",
      key: "status",
      width: 100,
      render: (status: OrderStatus) => <Tag color={STATUS_COLOR[status]}>{status}</Tag>
    },
    {
      title: "修订序号",
      dataIndex: "revision",
      key: "revision",
      width: 100,
      render: (revision: number) => <Tag color="geekblue" bordered={false}>rev {revision}</Tag>,
      sorter: (a, b) => a.revision - b.revision
    },
    { title: "队列位置", dataIndex: "seq", key: "seq", width: 90 },
    {
      title: "最近更新",
      dataIndex: "updatedAt",
      key: "updatedAt",
      width: 180,
      render: (v: string) => new Date(v).toLocaleString()
    }
  ];

  return (
    <div className="orders-page">
      <div className="page-toolbar">
        <p className="page-hint">配送资料独立管理：这里只做录入与查看，排班在「拖拽排班」页进行，冲突判断走「冲突记录」页。未派、在途资料重新打开后都会保留。</p>
        <Button type="primary" onClick={() => setOpen(true)}>新增配送单</Button>
      </div>

      <Table
        rowKey="id"
        size="middle"
        columns={columns}
        dataSource={orders}
        pagination={{ pageSize: 12 }}
        scroll={{ x: 900 }}
      />

      <Modal
        title="新增配送单"
        open={open}
        onCancel={() => setOpen(false)}
        onOk={submit}
        okText="加入未派池"
        cancelText="取消"
      >
        <Form form={form} layout="vertical" initialValues={{ weightKg: 100 }}>
          <Form.Item
            name="orderNo"
            label="单号"
            rules={[
              { required: true, message: "请输入单号" },
              {
                validator: (_, value: string) =>
                  value && orders.some((o) => o.orderNo === value.trim())
                    ? Promise.reject(new Error("单号已存在"))
                    : Promise.resolve()
              }
            ]}
          >
            <Input placeholder="如 ORD-9034" />
          </Form.Item>
          <Form.Item name="destination" label="目的地" rules={[{ required: true, message: "请输入目的地" }]}>
            <Input placeholder="如 浦东机场" />
          </Form.Item>
          <Form.Item name="weightKg" label="重量 kg" rules={[{ required: true, message: "请输入重量" }]}>
            <InputNumber min={1} style={{ width: "100%" }} />
          </Form.Item>
        </Form>
      </Modal>

      <p className="driver-roster">司机名册：{DRIVERS.join("、")}</p>
    </div>
  );
}
