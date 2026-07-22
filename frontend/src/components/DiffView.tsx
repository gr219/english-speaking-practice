import { DiffOp } from '../lib/api';

interface DiffViewProps {
  ops: DiffOp[];
}

export default function DiffView({ ops }: DiffViewProps) {
  return (
    <div className="whitespace-pre-wrap text-sm text-zinc-800 dark:text-zinc-200 leading-relaxed">
      {ops.map((op, i) => {
        switch (op.op) {
          case 'equal':
            return <span key={i}>{op.text}</span>;
          case 'delete':
            return (
              <span key={i} className="text-red-500 line-through bg-red-50 dark:bg-red-900/20">
                {op.text}
              </span>
            );
          case 'insert':
            return (
              <span key={i} className="text-[#0078D4] bg-blue-50 dark:bg-blue-900/20">
                {op.text}
              </span>
            );
          default:
            return <span key={i}>{op.text}</span>;
        }
      })}
    </div>
  );
}
