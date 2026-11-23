import { useState } from "react";
import {
  createColumnHelper,
  flexRender,
  getCoreRowModel,
  getSortedRowModel,
  useReactTable,
  type SortingState,
} from "@tanstack/react-table";
import type { RoutineRow } from "../lib/metrics";

const columnHelper = createColumnHelper<RoutineRow>();

const columns = [
  columnHelper.accessor("name", {
    header: "Routine",
    cell: (info) => {
      const row = info.row.original;
      return (
        <p className="name">
          {row.name}
          {row.severity ? (
            <span className="tag inline">{row.severity === "high" ? "Loop" : "Watch"}</span>
          ) : null}
        </p>
      );
    },
    sortingFn: "alphanumeric",
  }),
  columnHelper.accessor("botName", {
    header: "Bot",
    cell: (info) => info.getValue(),
  }),
  columnHelper.accessor("calls", {
    header: "Calls",
    cell: (info) => info.row.original.callLabel,
  }),
  columnHelper.accessor("tokens", {
    header: "Tokens",
    cell: (info) => info.row.original.tokenLabel,
  }),
  columnHelper.accessor("avgIntervalSec", {
    header: "Cadence",
    cell: (info) => info.row.original.cadence,
    sortingFn: "basic",
  }),
];

function SortMark({ direction }: { direction: false | "asc" | "desc" }) {
  if (direction === "asc") return <span className="mark">↑</span>;
  if (direction === "desc") return <span className="mark">↓</span>;
  return <span className="mark faint">↕</span>;
}

export function RoutineTable({ routines }: { routines: RoutineRow[] }) {
  const [sorting, setSorting] = useState<SortingState>([{ id: "calls", desc: true }]);

  const table = useReactTable({
    data: routines,
    columns,
    state: { sorting },
    onSortingChange: setSorting,
    getCoreRowModel: getCoreRowModel(),
    getSortedRowModel: getSortedRowModel(),
  });

  return (
    <>
      <div className="table-wrap desktop-table">
        <table>
          <thead>
            {table.getHeaderGroups().map((group) => (
              <tr key={group.id}>
                {group.headers.map((header) => {
                  const numeric = header.column.id === "calls" || header.column.id === "tokens";
                  return (
                    <th key={header.id} className={numeric ? "num" : undefined} scope="col">
                      <button
                        type="button"
                        className="sort"
                        onClick={header.column.getToggleSortingHandler()}
                        aria-label={`Sort by ${String(header.column.columnDef.header)}`}
                      >
                        {flexRender(header.column.columnDef.header, header.getContext())}
                        <SortMark direction={header.column.getIsSorted()} />
                      </button>
                    </th>
                  );
                })}
              </tr>
            ))}
          </thead>
          <tbody>
            {table.getRowModel().rows.map((row) => (
              <tr key={row.id}>
                {row.getVisibleCells().map((cell) => {
                  const numeric = cell.column.id === "calls" || cell.column.id === "tokens";
                  return (
                    <td key={cell.id} className={numeric ? "num" : undefined}>
                      {flexRender(cell.column.columnDef.cell, cell.getContext())}
                    </td>
                  );
                })}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <ul className="mobile-routines">
        {table.getRowModel().rows.map((row) => {
          const routine = row.original;
          return (
            <li key={routine.id} className="routine-card">
              <div className="row-top">
                <div>
                  <p className="name">{routine.name}</p>
                  <p className="bot-name">{routine.botName}</p>
                </div>
                {routine.severity ? (
                  <p className="tag">{routine.severity === "high" ? "Loop" : "Watch"}</p>
                ) : null}
              </div>
              <dl className="mini-grid">
                <div>
                  <dt>Calls</dt>
                  <dd>{routine.callLabel}</dd>
                </div>
                <div>
                  <dt>Tokens</dt>
                  <dd>{routine.tokenLabel}</dd>
                </div>
                <div>
                  <dt>Cadence</dt>
                  <dd>{routine.cadence}</dd>
                </div>
              </dl>
            </li>
          );
        })}
      </ul>
    </>
  );
}
