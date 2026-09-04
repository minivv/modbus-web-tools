"use client";

import { DATA_DISPLAY_MODES, type DataDisplayMode, type ParsedFrame, type RegisterComparisonRow } from "@/lib/types";
import { Select, TextInput } from "@/components/ui";

/** 行头列宽：地址 / 占用 / 解析方式 / 原始值 / 点位名称 */
const ROW_HEADER_WIDTHS = [56, 36, 152, 160, 140];

/** 行头列在横向滚动时冻结，左侧偏移量由列宽累加得出 */
const STICKY_LEFT = ROW_HEADER_WIDTHS.reduce<number[]>((offsets, width, index) => {
  offsets.push(index === 0 ? 0 : offsets[index - 1] + ROW_HEADER_WIDTHS[index - 1]);
  return offsets;
}, []);

const ROW_HEADER_WIDTH = ROW_HEADER_WIDTHS.reduce((total, width) => total + width, 0);

export default function RegisterTable({
  rows,
  frames,
  pointNames,
  onRegisterModeChange,
  onPointNameChange,
  className = "",
}: {
  rows: RegisterComparisonRow[];
  frames: ParsedFrame[];
  pointNames: Record<string, string>;
  onRegisterModeChange: (address: number, mode: DataDisplayMode) => void;
  onPointNameChange: (address: number, name: string) => void;
  className?: string;
}) {
  const isSingle = frames.length === 1;
  const valueColWidth = frames.length <= 1 ? 168 : 156;
  const lastColumn = ROW_HEADER_WIDTHS.length - 1;
  const isLastRow = (rowIndex: number) => rowIndex === rows.length - 1;
  const rowBorder = (rowIndex: number) => (isLastRow(rowIndex) ? "last:border-b-0" : "");
  const frozenCell = (column: number, rowIndex: number) =>
    `sticky z-10 border-b border-l border-line bg-white group-hover:bg-neutral-50 ${
      column === 0 ? "first:border-l-0" : ""
    } ${column === lastColumn ? "border-r border-line" : ""} ${rowBorder(rowIndex)}`;

  return (
    <div className={`overflow-auto rounded-md border border-line bg-white ${className}`}>
      <table
        className="w-full border-collapse text-[11px]"
        style={{ minWidth: ROW_HEADER_WIDTH + frames.length * valueColWidth }}
      >
        <colgroup>
          {ROW_HEADER_WIDTHS.map((width, index) => (
            <col key={index} style={{ width }} />
          ))}
          {frames.map((frame, index) => (
            <col key={frame.index ?? index} style={{ width: valueColWidth }} />
          ))}
        </colgroup>
        <thead className="sticky top-0 z-20 bg-neutral-100 text-muted">
          <tr>
            <th
              colSpan={ROW_HEADER_WIDTHS.length}
              className="sticky left-0 z-10 border-b border-r border-line bg-neutral-100 px-3 py-2 text-left text-[11px] font-semibold"
            >
              寄存器地址 / 占用 / 解析方式 / 原始值 / 点位名称
            </th>
            {frames.map((frame, index) => (
              <th
                key={frame.index ?? index}
                className="border-b border-l border-line px-3 py-2 text-left text-[11px] font-semibold"
              >
                {isSingle ? "数值" : `数值 ${index + 1}`}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {rows.map((row, rowIndex) => (
            <tr key={row.address} className="group bg-white">
              <td
                style={{ left: STICKY_LEFT[0] }}
                className={`${frozenCell(0, rowIndex)} px-2 py-1.5 align-middle font-mono font-semibold`}
              >
                {row.address}
              </td>
              <td
                style={{ left: STICKY_LEFT[1] }}
                className={`${frozenCell(1, rowIndex)} px-2 py-1.5 align-middle font-mono text-muted`}
              >
                {row.span}
              </td>
              <td style={{ left: STICKY_LEFT[2] }} className={`${frozenCell(2, rowIndex)} px-2 py-1 align-middle`}>
                <Select
                  value={row.mode}
                  onChange={(event) => onRegisterModeChange(row.address, event.target.value as DataDisplayMode)}
                  className="!h-7 !w-full px-1 text-[10px]"
                >
                  {DATA_DISPLAY_MODES.map((mode) => (
                    <option key={mode} value={mode}>
                      {mode}
                    </option>
                  ))}
                </Select>
              </td>
              <td
                style={{ left: STICKY_LEFT[3] }}
                className={`${frozenCell(3, rowIndex)} px-2 py-1.5 align-middle font-mono text-muted`}
                title={row.raw}
              >
                <span className="block truncate">{row.raw}</span>
              </td>
              <td style={{ left: STICKY_LEFT[4] }} className={`${frozenCell(4, rowIndex)} px-2 py-1 align-middle`}>
                <TextInput
                  value={pointNames[String(row.address)] ?? ""}
                  placeholder="填写名称"
                  onChange={(event) => onPointNameChange(row.address, event.target.value)}
                  className="!h-7 !w-full px-1 text-[10px]"
                />
              </td>
              {row.values.map((value, columnIndex) => (
                <td
                  key={columnIndex}
                  className={`border-b border-l border-line px-2 py-1.5 align-middle font-mono ${rowBorder(rowIndex)}`}
                  title={value?.value ?? "-"}
                >
                  <span className="block truncate">{value?.value ?? "-"}</span>
                </td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
