import { Loader2 } from "lucide-react";

import { Button } from "@/components/ui/button";

function LoadingButton({
  loading,
  children,
  disabled,
  ...props
}: React.ComponentProps<typeof Button> & { loading?: boolean }) {
  return (
    <Button disabled={loading || disabled} {...props}>
      {loading ? <Loader2 className="animate-spin" /> : null}
      {children}
    </Button>
  );
}

export { LoadingButton };
