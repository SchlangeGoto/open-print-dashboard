import { LucideIcon } from "lucide-react";

interface EmptyStateProps {
  icon: LucideIcon;
  title: string;
  description: string;
}

export function EmptyState({ icon: Icon, title, description }: EmptyStateProps) {
  return (
    <div className="flex flex-col items-center justify-center py-16 text-center">
      <div className="rounded-full bg-zinc-800 p-4 mb-4">
        <Icon size={32} className="text-zinc-500" />
      </div>
      <h3 className="text-lg font-medium text-zinc-300">{title}</h3>
      <p className="mt-1 text-sm text-muted max-w-sm">{description}</p>
    </div>
  );
}