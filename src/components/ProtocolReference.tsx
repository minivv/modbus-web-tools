"use client";

import { Panel } from "@/components/ui";

const readFunctions = [
  ["01 读线圈", "读取可写 bit 输出。"],
  ["02 读离散输入", "读取只读 bit 输入。"],
  ["03 读保持寄存器", "读取可写 16 位寄存器值。"],
  ["04 读输入寄存器", "读取只读 16 位寄存器值。"],
];

const writeFunctions = [
  ["05 写单个线圈", "写入一个线圈，开为 FF00，关为 0000。"],
  ["06 写单个寄存器", "写入一个 16 位保持寄存器。"],
  ["15 写多个线圈", "写入打包线圈值，最低位在前。"],
  ["16 写多个寄存器", "写入多个 16 位保持寄存器。"],
];

const limits = [
  ["读线圈 / 离散输入", "1...2000 位", "响应按 bit 打包，Byte Count 后每字节包含 8 个点。"],
  ["读保持 / 输入寄存器", "1...125 个寄存器", "每个寄存器 2 字节，单帧数据区最多 250 字节。"],
  ["写多个线圈", "1...1968 位", "请求包含 Byte Count 和打包后的线圈数据。"],
  ["写多个寄存器", "1...123 个寄存器", "请求包含 Byte Count，每个寄存器 2 字节。"],
  ["从站地址", "0...247", "RTU 中是从站地址；TCP 中对应 Unit Identifier。"],
];

const frameStructures = [
  ["RTU 请求", "从站地址 + 功能码 + Payload + CRC Lo + CRC Hi"],
  ["TCP 请求", "事务号 + 协议号 + 长度 + 从站地址 + 功能码 + Payload"],
  ["读取请求 Payload", "起始地址高字节 + 起始地址低字节 + 数量高字节 + 数量低字节"],
  ["读取响应 Payload", "Byte Count + 数据区。线圈按 bit 打包，寄存器按 2 字节一组。"],
  ["异常响应", "功能码最高位置 1，即原功能码 + 0x80，后面跟 1 字节异常码。"],
];

const byteOrders = [
  ["ABCD", "寄存器原序"],
  ["CDAB", "word 交换"],
  ["BADC", "每个 word 内部字节交换"],
  ["DCBA", "完整字节反转"],
];

function FunctionList({ items }: { items: readonly (readonly string[])[] }) {
  return (
    <dl className="space-y-3">
      {items.map(([title, description]) => (
        <div key={title} className="border-b border-line pb-3 last:border-0 last:pb-0">
          <dt className="text-sm font-semibold">{title}</dt>
          <dd className="mt-1 text-xs text-muted">{description}</dd>
        </div>
      ))}
    </dl>
  );
}

export default function ProtocolReference() {
  return (
    <div className="space-y-3">
      <div className="grid gap-3 lg:grid-cols-2">
        <Panel title="读取功能码">
          <FunctionList items={readFunctions} />
        </Panel>
        <Panel title="写入功能码">
          <FunctionList items={writeFunctions} />
        </Panel>
      </div>

      <Panel title="帧结构">
        <dl className="grid gap-3 md:grid-cols-2">
          {frameStructures.map(([title, value]) => (
            <div key={title} className="rounded-md border border-line bg-neutral-50 p-3">
              <dt className="text-xs font-semibold text-muted">{title}</dt>
              <dd className="mt-1 font-mono text-xs leading-5">{value}</dd>
            </div>
          ))}
        </dl>
      </Panel>

      <Panel title="数量限制">
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
          {limits.map(([title, value, note]) => (
            <div key={title} className="rounded-md border border-line bg-neutral-50 p-3">
              <p className="text-sm font-semibold">{title}</p>
              <p className="mt-1 font-mono text-lg font-semibold text-accent">{value}</p>
              <p className="mt-1 text-xs text-muted">{note}</p>
            </div>
          ))}
        </div>
      </Panel>

      <Panel title="字节序">
        <p className="mb-3 text-sm text-muted">Modbus 寄存器 word 使用大端序。跨多个寄存器的 32/64 位值因设备而异，解析器提供常见字节序。</p>
        <div className="grid gap-3 sm:grid-cols-2 md:grid-cols-4">
          {byteOrders.map(([title, value]) => (
            <div key={title} className="rounded-md border border-line bg-white p-3">
              <p className="font-mono text-sm font-semibold">{title}</p>
              <p className="mt-1 text-xs text-muted">{value}</p>
            </div>
          ))}
        </div>
      </Panel>
    </div>
  );
}
