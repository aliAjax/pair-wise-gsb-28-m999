import {
  App as AntApp,
  Button,
  Form,
  Input,
  InputNumber,
  Modal,
  Popconfirm,
  Space,
  Table,
  Tag
} from "antd";
import type { ColumnsType } from "antd/es/table";
import { useMemo, useState } from "react";
import { driverName } from "../data";
import { useBoardStore } from "../store";
import { DeliveryOrder, STATUS_TEXT } from "../types";
import { formatFullTime } from "../utils";

interface ProfileFormValues {
  orderNo: string;
  weight: number;
  destination: string;
  note: string;
}

const STATUS_TAG: Record<DeliveryOrder["status"], string> = {
  unassigned: "blue",
  assigned: "cyan",
  departed: "red"
};

export default function OrderDataPage() {
  const { message } = AntApp.useApp();
  const orders = useBoardStore((s) => s.orders);
  const addOrder = useBoardStore((s) => s.addOrder);
  const updateOrderProfile = useBoardStore((s) => s.updateOrderProfile);
  const removeOrder = useBoardStore((s) => s.removeOrder);

  const [form] = Form.useForm<ProfileFormValues>();
  const [editing, setEditing] = useState<DeliveryOrder | null>(null);
  const [editForm] = Form.useForm<Omit<ProfileFormValues, "orderNo">>();

  const sorted = useMemo(
    () => [...orders].sort((a, b) => b.createdAt.localeCompare(a.createdAt)),
    [orders]
  );

  const columns: ColumnsType<DeliveryOrder> = [
    { title: "单号", dataIndex: "orderNo", width: 130 },
    {
      title: "修订序号",
      dataIndex: "revision",
      width: 100,
      sorter: (a, b) => a.revision - b.revision,
      render: (rev: number) => <Tag color="geekblue">#{rev}</Tag>
    },
    {
      title: "状态",
      dataIndex: "status",
      width: 110,
      render: (status: DeliveryOrder["status"]) => (
        <Tag color={STATUS_TAG[status]}>{STATUS_TEXT[status]}</Tag>
      )
    },
    { title: "占用司机", width: 100, render: (_, record) => driverName(record.driverId) },
    { title: "目的地", dataIndex: "destination", width: 100 },
    { title: "重量kg", dataIndex: "weight", width: 90, sorter: (a, b) => a.weight - b.weight },
    { title: "备注", dataIndex: "note", ellipsis: true },
    { title: "更新时间", width: 150, render: (_, r) => formatFullTime(r.updatedAt) },
    {
      title: "操作",
      width: 150,
      render: (_, record) => (
        <Space size="small">
          <Button
            size="small"
            onClick={() => {
              setEditing(record);
              editForm.setFieldsValue({
                weight: record.weight,
                destination: record.destination,
                note: record.note
              });
            }}
          >
            改资料
          </Button>
          <Popconfirm
            title={`删除 ${record.orderNo}？`}
            description="删除后相关待确认移交也会一并清除"
            onConfirm={() => {
              removeOrder(record.id);
              message.success("已删除");
            }}
          >
            <Button size="small" danger>
              删除
            </Button>
          </Popconfirm>
        </Space>
      )
    }
  ];

  return (
    <div className="data-page">
      <section className="panel-block">
        <h2>新增配送资料</h2>
        <p className="block-hint">
          新单以修订序号 #1 进入未派区，可到“排班拖拽”页安排司机。配送资料的任何修改都会推进修订序号，
          另一台电脑若仍按旧序号拖放，将被冲突判断拦下。
        </p>
        <Form
          form={form}
          layout="inline"
          className="create-form"
          onFinish={(values: ProfileFormValues) => {
            const result = addOrder(values);
            if (result.ok) {
              message.success(`配送单 ${values.orderNo} 已加入未派区`);
              form.resetFields();
            } else {
              message.warning(result.error ?? "新增失败");
            }
          }}
        >
          <Form.Item
            name="orderNo"
            label="单号"
            rules={[{ required: true, message: "请输入单号" }]}
          >
            <Input placeholder="如 ORD-9100" style={{ width: 150 }} />
          </Form.Item>
          <Form.Item
            name="destination"
            label="目的地"
            rules={[{ required: true, message: "请输入目的地" }]}
          >
            <Input placeholder="目的地" style={{ width: 130 }} />
          </Form.Item>
          <Form.Item
            name="weight"
            label="重量kg"
            rules={[{ required: true, message: "请输入重量" }]}
          >
            <InputNumber min={0} style={{ width: 110 }} />
          </Form.Item>
          <Form.Item name="note" label="备注">
            <Input placeholder="配送备注（可选）" style={{ width: 220 }} />
          </Form.Item>
          <Form.Item>
            <Button type="primary" htmlType="submit">
              加入未派区
            </Button>
          </Form.Item>
        </Form>
      </section>

      <section className="panel-block">
        <h2>配送资料台账（{orders.length}）</h2>
        <Table<DeliveryOrder>
          rowKey="id"
          size="small"
          columns={columns}
          dataSource={sorted}
          pagination={{ pageSize: 12, showSizeChanger: false }}
        />
      </section>

      <Modal
        title={`修改配送资料 · ${editing?.orderNo ?? ""}`}
        open={editing !== null}
        onCancel={() => setEditing(null)}
        okText="保存（序号 +1）"
        cancelText="取消"
        onOk={() => {
          editForm
            .validateFields()
            .then((values) => {
              const result = updateOrderProfile(editing!.id, editing!.revision, values);
              if (result.ok) {
                message.success("资料已保存，修订序号已推进");
                setEditing(null);
              } else {
                message.warning(result.error ?? "保存失败");
                setEditing(null);
              }
            })
            .catch(() => undefined);
        }}
      >
        <Form form={editForm} layout="vertical">
          <Form.Item name="destination" label="目的地" rules={[{ required: true }]}>
            <Input />
          </Form.Item>
          <Form.Item name="weight" label="重量kg" rules={[{ required: true }]}>
            <InputNumber min={0} style={{ width: "100%" }} />
          </Form.Item>
          <Form.Item name="note" label="备注">
            <Input.TextArea rows={3} />
          </Form.Item>
        </Form>
      </Modal>
    </div>
  );
}
