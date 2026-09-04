"use client";

import { Cpu, Github, ShieldCheck, Zap } from "lucide-react";
import { Panel, StatusBadge } from "@/components/ui";

const features = [
  { icon: Cpu, title: "Web Worker 解析", description: "十六进制解析、CRC 和数值解码不占用主线程。" },
  { icon: Zap, title: "窗口化渲染", description: "帧列表和寄存器表格只渲染可视区域，长输入不卡顿。" },
  { icon: ShieldCheck, title: "服务端密钥", description: "Supabase service role key 只在 Vercel Functions 中使用。" },
  { icon: Github, title: "开源协议对齐", description: "功能与 ModbusWorkbench macOS 版保持一致。" },
];

export default function About() {
  return (
    <div className="scroll-shell h-full min-h-0 space-y-3 overflow-y-auto pr-1">
      <Panel title="关于 Modbus Web Tools" subtitle="离线报文工作台，不打开串口、不建立 TCP 连接。">
        <div className="grid gap-3 md:grid-cols-2">
          {features.map(({ icon: Icon, title, description }) => (
            <div key={title} className="flex gap-3 rounded-md border border-line bg-neutral-50 p-4">
              <Icon size={20} className="mt-0.5 text-accent" />
              <div>
                <p className="text-sm font-semibold">{title}</p>
                <p className="mt-1 text-xs text-muted">{description}</p>
              </div>
            </div>
          ))}
        </div>
      </Panel>
      <Panel title="部署">
        <div className="flex flex-wrap gap-2">
          <StatusBadge tone="ok">Vercel</StatusBadge>
          <StatusBadge tone="ok">Next.js</StatusBadge>
          <StatusBadge tone="ok">Supabase</StatusBadge>
          <StatusBadge tone="neutral">RTU / TCP</StatusBadge>
        </div>
      </Panel>
    </div>
  );
}
